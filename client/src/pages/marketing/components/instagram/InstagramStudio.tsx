import { useState, type ReactElement } from 'react';
import { InstagramCockpit } from '../InstagramCockpit';
import { InstagramPreview, type CarouselSlide } from '../cockpit/InstagramPreview';
import { InstagramJourneyStrip, instagramJourneyPhase } from './InstagramJourneyStrip';
import { parseReelPackage, reelExportText } from '../../lib/reelStoryboard';
import { readStudioSheet } from '../../lib/offerSheetForm';
import { instagramFormatFromTags } from '../../lib/instagramFormat';

export interface InstagramStudioContent {
  id?: string;
  title?: string | null;
  body?: string | null;
  status?: string | null;
  image_url?: string | null;
  image_prompt?: string | null;
  visual_description?: string | null;
  reference_image_url?: string | null;
  carousel_images?: unknown[] | null;
  image_variants?: Array<{ id: string; image_url: string; style_preset: string }> | null;
  tags?: readonly string[] | null;
  user_brief?: string | null;
}

export interface InstagramStudioProps {
  content: InstagramStudioContent;
  isGenerating?: boolean;
  progressMessage?: string;
  onRegenerateImage?: (
    newPrompt: string,
    stylePreset: string,
    slideIndex?: number,
    extras?: { mock?: boolean },
  ) => void;
  onSelectImageVariant?: (imageUrl: string) => void;
  onUploadReferenceImage?: (file: File) => Promise<void>;
  onApplyAiPhotoEdit?: (editPrompt: string, stylePreset: string) => Promise<void>;
}

function visibleImageUrl(content: InstagramStudioContent): string | null {
  const image = content.image_url?.trim();
  if (image) return image;
  const reference = content.reference_image_url?.trim();
  return reference || null;
}

function asCarousel(value: unknown[] | null | undefined): CarouselSlide[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const slides: CarouselSlide[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const slide = item as { index?: number; image_url?: string; prompt?: string };
    if (!slide.image_url) continue;
    slides.push({
      index: slide.index ?? slides.length,
      image_url: slide.image_url,
      prompt: slide.prompt ?? '',
    });
  }
  return slides.length > 1 ? slides : null;
}

/**
 * Shared Instagram editor: journey status, carousel preview, and the regen / photo controls.
 * Used by the pipeline detail panel and the command-center panel.
 */
export function InstagramStudio({
  content,
  isGenerating,
  progressMessage,
  onRegenerateImage,
  onSelectImageVariant,
  onUploadReferenceImage,
  onApplyAiPhotoEdit,
}: InstagramStudioProps): ReactElement {
  const [slideIndex, setSlideIndex] = useState(0);
  const slides = asCarousel(content.carousel_images);
  const activeSlide = slides && slideIndex < slides.length ? slideIndex : 0;
  const variants = content.image_variants ?? [];
  const reel = parseReelPackage(content.body ?? '');
  const isReel = instagramFormatFromTags(content.tags) === 'reel' || reel != null;
  const imageUrl = visibleImageUrl(content);
  return (
    <div className="space-y-4" data-testid="instagram-studio" data-content-id={content.id}>
      <InstagramJourneyStrip
        phase={instagramJourneyPhase({
          body: content.body,
          imageUrl,
          status: content.status,
        })}
      />
      <InstagramPreview
        caption={reel?.caption || content.body || ''}
        imageUrl={imageUrl}
        imagePrompt={content.image_prompt}
        isGenerating={isGenerating}
        carouselImages={slides}
        onSlideIndexChange={setSlideIndex}
      />
      {slides && slides.length > 1 ? (
        <p className="text-[11px] text-slate-400">Regenerate updates slide {activeSlide + 1} of {slides.length}.</p>
      ) : null}
      {variants.length > 0 && onSelectImageVariant ? (
        <div className="grid grid-cols-2 gap-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelectImageVariant(variant.image_url)}
              className="overflow-hidden rounded-lg border border-white/[0.08] text-left"
            >
              <img src={variant.image_url} alt="" className="aspect-square w-full object-cover" />
              <span className="block px-1.5 py-1 text-[9px] text-slate-300">{variant.style_preset.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      ) : null}
      {isReel ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,240px)_1fr]" data-testid="reel-storyboard">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cover</p>
            {imageUrl ? (
              <img src={imageUrl} alt="" className="mt-2 aspect-[9/16] w-full rounded-lg object-cover" />
            ) : (
              <div className="mt-2 flex aspect-[9/16] items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-slate-500">
                Cover still
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-300">{reel?.coverPrompt ?? 'Cover prompt arrives with the storyboard.'}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
            {reel ? (
              <>
                <p className="text-sm font-medium text-slate-100">{reel.hook}</p>
                <ol className="mt-3 space-y-2">
                  {reel.shots.map((shot, index) => (
                    <li key={`${shot.shot}-${index}`} className="text-[12px] text-slate-200">
                      <span className="text-slate-500">{index + 1}. </span>
                      {shot.shot}
                      {shot.onScreen ? <span className="mt-0.5 block text-[11px] text-slate-400">On screen: {shot.onScreen}</span> : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[11px] text-slate-400">Audio: {reel.audioNote}</p>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-200"
                  onClick={() => {
                    const text = reelExportText(reel, imageUrl);
                    void navigator.clipboard?.writeText(text);
                  }}
                >
                  Copy storyboard
                </button>
              </>
            ) : (
              <p className="text-[12px] text-slate-400">
                A reel here is a cover still and a storyboard: a hook, three to six shots, on-screen lines, a caption, and an audio note.
              </p>
            )}
          </div>
        </div>
      ) : null}
      <InstagramCockpit
        showPreview={false}
        caption={content.body ?? ''}
        contentTitle={content.title}
        imageUrl={imageUrl}
        imagePrompt={slides?.[activeSlide]?.prompt ?? content.image_prompt ?? null}
        altText={content.visual_description ?? null}
        isGenerating={isGenerating}
        progressMessage={progressMessage}
        contentId={content.id}
        referenceImageUrl={content.reference_image_url ?? null}
        initialLook={readStudioSheet(content.user_brief).style}
        onRegenerateImage={
          onRegenerateImage
            ? (prompt, style, extras) => onRegenerateImage(prompt, style, activeSlide, extras)
            : undefined
        }
        onUploadReferenceImage={onUploadReferenceImage}
        onApplyAiPhotoEdit={onApplyAiPhotoEdit}
      />
    </div>
  );
}
