import type { ContentItem } from '@/lib/marketingApi';

/** Kept out of ContentEmailUnlayerControls.tsx so that file only exports the component (Vite Fast Refresh). */
export function isEmailContentItem(content: ContentItem): boolean {
  const t = (content.content_type ?? '').toLowerCase();
  const ch = (content.channel ?? '').toLowerCase();
  return t === 'email' || ch === 'email' || ch === 'newsletter';
}
