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

/** Approved posts that do not have a day yet. */
export function readyToSchedule(items: ContentItem[]): ContentItem[] {
  return items.filter((item) => item.status === 'approved' && !item.scheduled_date);
}
