import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cacheBustImageUrl } from '@/lib/cacheBustImageUrl';

function splitCaptionAndHashtags(body: string): { main: string; hashtags: string[] } {
  const lines = body.split('\n');
  const tagLineIdx = lines.findIndex((l) => /^(#[\w\u00C0-\u024F]+\s*)+$/i.test(l.trim()) || /^#\w/.test(l.trim()));
  if (tagLineIdx === -1) {
    const inlineTags = body.match(/#[\w\u00C0-\u024F]+/g);
    if (inlineTags && inlineTags.length >= 3) {
      const withoutTags = body.replace(/#[\w\u00C0-\u024F]+/g, '').trim();
      return { main: withoutTags, hashtags: inlineTags };
    }
    return { main: body.trim(), hashtags: [] };
  }
  const main = lines.slice(0, tagLineIdx).join('\n').trim();
  const tagPart = lines.slice(tagLineIdx).join('\n');
  const hashtags = tagPart.match(/#[\w\u00C0-\u024F]+/g) ?? [];
  return { main, hashtags };
}

function foldCaption(text: string, foldAt = 125): { visible: string; more: boolean } {
  if (text.length <= foldAt) return { visible: text, more: false };
  const cut = text.slice(0, foldAt);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return { visible: safe.trim(), more: true };
}

export interface CarouselSlide {
  index: number;
  image_url: string;
  prompt: string;
}

export function InstagramPreview({
  caption,
  imageUrl,
  imagePrompt,
  isGenerating,
  carouselImages,
  onSlideIndexChange,
}: {
  caption: string;
  imageUrl: string | null | undefined;
  imagePrompt: string | null | undefined;
  isGenerating?: boolean;
  carouselImages?: CarouselSlide[] | null;
  onSlideIndexChange?: (index: number) => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const selectSlide = (index: number): void => {
    setSlideIndex(index);
    onSlideIndexChange?.(index);
  };
  const [imgLoadError, setImgLoadError] = useState(false);
  const [imgCacheBust, setImgCacheBust] = useState(0);
  const { main, hashtags } = splitCaptionAndHashtags(caption);
  const { visible, more } = foldCaption(main);

  /**
   * Multi-slide posts: `carousel_images` is only refreshed by the initial pipeline.
   * Regenerate updates `image_url` (hero) but not always every carousel entry — prefer
   * `imageUrl` for slide 0 so the preview matches the latest regen.
   */
  const isCarousel = Boolean(carouselImages && carouselImages.length > 1);
  const currentImage = useMemo(() => {
    if (isCarousel) {
      if (slideIndex === 0) {
        return imageUrl ?? carouselImages![slideIndex]?.image_url ?? null;
      }
      return carouselImages![slideIndex]?.image_url ?? null;
    }
    return imageUrl ?? carouselImages?.[0]?.image_url ?? null;
  }, [carouselImages, imageUrl, isCarousel, slideIndex]);

  useEffect(() => {
    setImgLoadError(false);
    setImgCacheBust((n) => n + 1);
  }, [currentImage]);

  const displayImageSrc =
    currentImage && !currentImage.startsWith('data:')
      ? cacheBustImageUrl(currentImage, imgCacheBust)
      : (currentImage ?? '');

  const totalSlides = isCarousel ? carouselImages!.length : 1;

  return (
    <div className="overflow-hidden rounded-xl border border-[#e7e0d6] bg-white">
      {/* Checkerboard shows through transparent PNG alpha so a failed/empty decode does not read as solid black on dark chrome. */}
      <div
        className="relative aspect-square w-full overflow-hidden"
        style={{
          backgroundColor: '#e5e7eb',
          backgroundImage: 'repeating-conic-gradient(#e5e7eb 0% 25%, #d1d5db 0% 50%)',
          backgroundSize: '12px 12px',
        }}
      >
        {isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-[#e7e0d6]" />
            <p className="text-[11px] text-[#78716c]">Generating visuals…</p>
          </div>
        ) : currentImage && !imgLoadError ? (
          <>
            <img
              key={`${currentImage ?? ''}-${imgCacheBust}`}
              src={displayImageSrc}
              alt=""
              className="h-full w-full bg-white object-cover"
              referrerPolicy="no-referrer"
              onError={() => {
                console.warn('[InstagramPreview] image_load_error', {
                  url: currentImage?.slice(0, 120),
                });
                setImgLoadError(true);
              }}
            />
            {isCarousel && (
              <>
                {slideIndex > 0 && (
                  <button
                    type="button"
                    title="Previous slide"
                    onClick={() => selectSlide(slideIndex - 1)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-app-text/80 hover:bg-black/70"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {slideIndex < totalSlides - 1 && (
                  <button
                    type="button"
                    title="Next slide"
                    onClick={() => selectSlide(slideIndex + 1)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-app-text/80 hover:bg-black/70"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {(carouselImages ?? []).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-colors',
                        i === slideIndex ? 'bg-[#1c1917]' : 'bg-white/60',
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : currentImage && imgLoadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <ImageOff className="h-7 w-7 text-[#a8a29e]" strokeWidth={1.5} />
            <p className="text-[10px] text-[#78716c] text-center">
              Image could not be loaded — regenerate to create a new one.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-end p-3">
            <p className="text-[10px] leading-relaxed text-[#78716c] line-clamp-[12]">
              {imagePrompt?.trim() ||
                'No image — add a prompt and generate, or wait for the pipeline to produce a visual.'}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5 px-3 py-3 text-[12px] leading-relaxed">
        <p className="text-[#44403c]">
          <span className="whitespace-pre-wrap">{visible}</span>
          {more && <span className="text-[#a8a29e]"> …more</span>}
        </p>
        {hashtags.length > 0 && (
          <p className="text-[11px] leading-snug">
            {hashtags.map((t, i) => (
              <span key={i} className={cn('text-[#57534e]', i > 0 && 'ml-1')}>
                {t}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
