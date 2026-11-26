import { useState, type ReactElement } from 'react';
import { InstagramCockpit } from '../InstagramCockpit';
import { InstagramPreview, type CarouselSlide } from '../cockpit/InstagramPreview';
import { InstagramJourneyStrip, instagramJourneyPhase } from './InstagramJourneyStrip';
import { parseReelPackage, reelExportText } from '../../lib/reelStoryboard';
import { readStudioSheet } from '../../lib/offerSheetForm';
import { instagramFormatFromTags } from '../../lib/instagramFormat';
import type { ImageEngine } from '../../lib/imageEngine';

export interface InstagramStudioContent {
  id?: string;
  title?: string | null;
  body?: string | null;
  status?: string | null;
  image_url?: string | null;
  image_prompt?: string | null;
  visual_description?: string | null;
  reference_image_url?: string | null;
  brand_logo_url?: string | null;
  carousel_images?: unknown[] | null;
  image_variants?: Array<{ id: string; image_url: string; style_preset: string }> | null;
  tags?: readonly string[] | null;
  user_brief?: string | null;
}

export interface InstagramStudioProps {
  content: InstagramStudioContent;
  isGenerating?: boolean;
  onRegenerateImage?: (
    newPrompt: string,
    stylePreset: string,
    slideIndex?: number,
    extras?: { mock?: boolean; image_provider?: ImageEngine },
  ) => void;
  imageEngines?: readonly Exclude<ImageEngine, 'all'>[];
  onSelectImageVariant?: (imageUrl: string) => void;
  onUploadReferenceImage?: (file: File) => Promise<void>;
  onUploadBrandLogo?: (file: File) => Promise<void>;
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
  onRegenerateImage,
  onSelectImageVariant,
  onUploadReferenceImage,
  onUploadBrandLogo,
  onApplyAiPhotoEdit,
  imageEngines,
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
        <p className="text-[11px] text-[#78716c]">Regenerate updates slide {activeSlide + 1} of {slides.length}.</p>
      ) : null}
      {variants.length > 0 && onSelectImageVariant ? (
        <div className="grid grid-cols-2 gap-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelectImageVariant(variant.image_url)}
              className="overflow-hidden rounded-lg border border-[#e7e0d6] bg-white text-left"
            >
              <img src={variant.image_url} alt="" className="aspect-square w-full object-cover" />
              <span className="block px-1.5 py-1 text-[9px] text-[#57534e]">{variant.style_preset.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      ) : null}
      {isReel ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,240px)_1fr]" data-testid="reel-storyboard">
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#78716c]">Cover</p>
            {imageUrl ? (
              <img src={imageUrl} alt="" className="mt-2 aspect-[9/16] w-full rounded-lg object-cover" />
            ) : (
              <div className="mt-2 flex aspect-[9/16] items-center justify-center rounded-lg border border-dashed border-[#e7e0d6] text-[11px] text-[#78716c]">
                Cover still
              </div>
            )}
            <p className="mt-2 text-[11px] text-[#57534e]">{reel?.coverPrompt ?? 'Cover prompt arrives with the storyboard.'}</p>
          </div>
          <div className="rounded-xl border border-[#e7e0d6] bg-white p-3">
            {reel ? (
              <>
                <p className="text-sm font-medium text-[#1c1917]">{reel.hook}</p>
                <ol className="mt-3 space-y-2">
                  {reel.shots.map((shot, index) => (
                    <li key={`${shot.shot}-${index}`} className="text-[12px] text-[#44403c]">
                      <span className="text-[#78716c]">{index + 1}. </span>
                      {shot.shot}
                      {shot.onScreen ? <span className="mt-0.5 block text-[11px] text-[#78716c]">On screen: {shot.onScreen}</span> : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[11px] text-[#78716c]">Audio: {reel.audioNote}</p>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-[#e7e0d6] bg-white px-3 py-1.5 text-xs text-[#44403c]"
                  onClick={() => {
                    const text = reelExportText(reel, imageUrl);
                    void navigator.clipboard?.writeText(text);
                  }}
                >
                  Copy storyboard
                </button>
              </>
            ) : (
              <p className="text-[12px] text-[#78716c]">
                A reel here is a cover still and a storyboard: a hook, three to six shots, on-screen lines, a caption, and an audio note.
              </p>
            )}
          </div>
        </div>
      ) : null}
      <InstagramCockpit
        caption={content.body ?? ''}
        contentTitle={content.title}
        imageUrl={imageUrl}
        imagePrompt={slides?.[activeSlide]?.prompt ?? content.image_prompt ?? null}
        isGenerating={isGenerating}
        contentId={content.id}
        referenceImageUrl={content.reference_image_url ?? null}
        brandLogoUrl={content.brand_logo_url ?? null}
        onUploadBrandLogo={onUploadBrandLogo}
        initialLook={readStudioSheet(content.user_brief).style}
        imageEngines={imageEngines}
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
