import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Bookmark, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  username = 'your_brand',
}: {
  caption: string;
  imageUrl: string | null | undefined;
  imagePrompt: string | null | undefined;
  isGenerating?: boolean;
  carouselImages?: CarouselSlide[] | null;
  username?: string;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [imgLoadError, setImgLoadError] = useState(false);
  const { main, hashtags } = splitCaptionAndHashtags(caption);
  const { visible, more } = foldCaption(main);

  useEffect(() => { setImgLoadError(false); }, [imageUrl]);

  const isCarousel = carouselImages && carouselImages.length > 1;
  const currentImage = isCarousel
    ? carouselImages[slideIndex]?.image_url
    : imageUrl;
  const totalSlides = isCarousel ? carouselImages.length : 1;

  return (
    <div className="overflow-hidden rounded-xl border border-app-border bg-app-card shadow-lg">
      <div className="flex items-center justify-between border-b border-app-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-500/30 ring-1 ring-white/10" />
          <span className="truncate text-[12px] font-semibold text-slate-100">@{username}</span>
        </div>
        <span className="text-app-muted">•••</span>
      </div>

      <div className="relative aspect-square w-full bg-black/40">
        {isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-app-surface-tertiary" />
            <p className="text-[11px] text-app-muted">Generating visuals…</p>
          </div>
        ) : currentImage && !imgLoadError ? (
          <>
            <img src={currentImage} alt="" className="h-full w-full object-cover" onError={() => setImgLoadError(true)} />
            {isCarousel && (
              <>
                {slideIndex > 0 && (
                  <button
                    type="button"
                    title="Previous slide"
                    onClick={() => setSlideIndex((i) => i - 1)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-app-text/80 hover:bg-black/70"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                {slideIndex < totalSlides - 1 && (
                  <button
                    type="button"
                    title="Next slide"
                    onClick={() => setSlideIndex((i) => i + 1)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-app-text/80 hover:bg-black/70"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {carouselImages.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-colors',
                        i === slideIndex ? 'bg-cyan-400' : 'bg-white/30',
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : currentImage && imgLoadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <ImageOff className="h-7 w-7 text-slate-600" strokeWidth={1.5} />
            <p className="text-[10px] text-app-muted text-center">
              Image could not be loaded — regenerate to create a new one.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-end p-3">
            <p className="text-[10px] leading-relaxed text-app-muted line-clamp-[12]">
              {imagePrompt?.trim() ||
                'No image — add a prompt and generate, or wait for the pipeline to produce a visual.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-b border-app-border px-3 py-2 text-app-text">
        <Heart className="h-5 w-5" strokeWidth={1.5} />
        <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
        <Send className="h-5 w-5" strokeWidth={1.5} />
        <Bookmark className="ml-auto h-5 w-5" strokeWidth={1.5} />
      </div>

      <div className="space-y-1.5 px-3 py-3 text-[12px] leading-relaxed">
        <p className="text-app-text">
          <span className="font-semibold text-slate-100">@{username}</span>{' '}
          <span className="whitespace-pre-wrap">{visible}</span>
          {more && <span className="text-app-muted"> …more</span>}
        </p>
        {hashtags.length > 0 && (
          <p className="text-[11px] leading-snug">
            {hashtags.map((t, i) => (
              <span key={i} className={cn('text-cyan-400/90', i > 0 && 'ml-1')}>
                {t}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
