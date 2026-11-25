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

/**
 * The first and last day of a month as `YYYY-MM-DD` (month is 1 to 12). Built from local parts: `toISOString()` of
 * a local midnight is the previous day in any time zone east of UTC, which left the last day out of the month.
 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

/**
 * A day as `YYYY-MM-DD` from its local parts. `toISOString().slice(0, 10)` of a local midnight is the previous day in any
 * time zone east of UTC (Turkey), which put every date one column early on the calendar.
 */
export function localDateKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * How many day cells a Monday-first month grid needs: whole weeks from the Monday on or before the 1st to the Sunday on
 * or after the last day. A fixed five weeks cut off the end of a month that starts on a Sunday (Nov 2026) or Saturday.
 */
export function monthGridLength(year: number, monthIndex: number): number {
  const firstColumn = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  return Math.ceil((firstColumn + days) / 7) * 7;
}
