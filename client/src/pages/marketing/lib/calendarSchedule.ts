import type { ContentItem } from '@/lib/marketingApi';

export type ScheduleDrop = { ok: true } | { ok: false; message: string };

/**
 * The calendar takes ready posts only (MC-10): approved, or already scheduled and being moved.
 * A draft or a post in review is refused with one line; a published post stays where it is.
 */
export function scheduleDropRule(item: Pick<ContentItem, 'status'>): ScheduleDrop {
  const status = item.status ?? 'draft';
  if (status === 'approved' || status === 'scheduled') return { ok: true };
  if (status === 'published') return { ok: false, message: 'This post is already published.' };
  return { ok: false, message: 'Only approved posts go on the calendar.' };
}

/**
 * Approved posts that do not have a day yet, and that can actually go out: an Instagram post with a caption and a
 * still. Another channel (the counter no longer has them) or an Instagram post missing its picture would fail on its day.
 */
export function readyToSchedule(items: ContentItem[]): ContentItem[] {
  return items.filter(
    (item) =>
      item.status === 'approved' &&
      !item.scheduled_date &&
      (item.channel ?? '').toLowerCase() === 'instagram' &&
      Boolean(item.body?.trim()) &&
      Boolean(item.image_url?.trim()),
  );
}

const GENERIC_TITLES = new Set(['', 'ai draft', 'untitled']);

/** What a tray card says: the title, or the start of the caption when the title is the generic "AI draft". */
export function trayLabel(item: Pick<ContentItem, 'title' | 'body'>): string {
  const title = (item.title ?? '').trim();
  if (!GENERIC_TITLES.has(title.toLowerCase())) return title;
  const caption = (item.body ?? '').replace(/\s+/g, ' ').trim();
  return caption ? `${caption.slice(0, 36)}${caption.length > 36 ? '…' : ''}` : 'Untitled post';
}
