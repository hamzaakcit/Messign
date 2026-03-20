import { Heart, MessageCircle, Send, Bookmark } from 'lucide-react';
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

export function InstagramPreview({
  caption,
  imageUrl,
  imagePrompt,
  isGenerating,
  username = 'your_brand',
}: {
  caption: string;
  imageUrl: string | null | undefined;
  imagePrompt: string | null | undefined;
  isGenerating?: boolean;
  username?: string;
}) {
  const { main, hashtags } = splitCaptionAndHashtags(caption);
  const { visible, more } = foldCaption(main);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0f14] shadow-lg">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-500/30 ring-1 ring-white/10" />
          <span className="truncate text-[12px] font-semibold text-slate-100">@{username}</span>
        </div>
        <span className="text-slate-500">•••</span>
      </div>

      <div className="relative aspect-square w-full bg-black/40">
        {isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.08]" />
            <p className="text-[11px] text-slate-500">Generating visuals…</p>
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col justify-end p-3">
            <p className="text-[10px] leading-relaxed text-slate-500 line-clamp-[12]">
              {imagePrompt?.trim() || 'No image yet — prompt will appear here for reference.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 border-b border-white/[0.05] px-3 py-2 text-slate-300">
        <Heart className="h-5 w-5" strokeWidth={1.5} />
        <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
        <Send className="h-5 w-5" strokeWidth={1.5} />
        <Bookmark className="ml-auto h-5 w-5" strokeWidth={1.5} />
      </div>

      <div className="space-y-1.5 px-3 py-3 text-[12px] leading-relaxed">
        <p className="text-slate-200">
          <span className="font-semibold text-slate-100">@{username}</span>{' '}
          <span className="whitespace-pre-wrap">{visible}</span>
          {more && <span className="text-slate-500"> …more</span>}
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
