import { cn } from '@/lib/utils';

const CHANNEL_STYLES: Record<string, string> = {
  linkedin: 'bg-blue-500/15 text-blue-200 border-blue-500/25',
  instagram: 'bg-gradient-to-r from-pink-500/20 via-purple-500/15 to-amber-500/15 text-pink-100 border-pink-500/20',
  x: 'bg-white/[0.06] text-slate-200 border-white/10',
  twitter: 'bg-white/[0.06] text-slate-200 border-white/10',
  email: 'bg-teal-500/15 text-teal-200 border-teal-500/25',
  blog: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
  ad: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
  social: 'bg-violet-500/15 text-violet-200 border-violet-500/25',
};

function label(ch: string | null | undefined): string {
  if (!ch?.trim()) return 'Channel';
  const c = ch.toLowerCase();
  if (c === 'x' || c === 'twitter') return 'X';
  return ch.slice(0, 1).toUpperCase() + ch.slice(1);
}

export function ChannelBadge({
  channel,
  size = 'md',
}: {
  channel: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const key = (channel ?? '').toLowerCase().trim();
  const style =
    CHANNEL_STYLES[key] ??
    (key.includes('linkedin')
      ? CHANNEL_STYLES.linkedin
      : key.includes('instagram')
        ? CHANNEL_STYLES.instagram
        : CHANNEL_STYLES.social);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
        style,
      )}
    >
      {label(channel)}
    </span>
  );
}
