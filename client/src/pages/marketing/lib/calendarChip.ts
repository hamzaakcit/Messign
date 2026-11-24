import { instagramFormatFromTags, type InstagramFormat } from './instagramFormat';

export interface CalendarChipInput {
  channel?: string | null;
  title: string;
  body?: string | null;
  image_url?: string | null;
  tags?: readonly string[] | null;
}

export type CalendarChip =
  | { kind: 'instagram'; title: string; thumb: string | null; format: InstagramFormat | null }
  | { kind: 'email'; subject: string }
  | { kind: 'other'; title: string };

/** Subject line for an email child. The body wins when it starts with SUBJECT:. */
export function emailSubject(title: string, body: string | null | undefined): string {
  const match = (body ?? '').match(/^SUBJECT:\s*(.+)$/m);
  const fromBody = match?.[1]?.trim();
  return fromBody || title.trim() || 'Email';
}

/**
 * Calendar cell for a scheduled child.
 * Instagram shows a thumb and a format badge. Email shows the subject and is not a network post.
 */
export function calendarChip(item: CalendarChipInput): CalendarChip {
  const channel = (item.channel ?? '').toLowerCase();
  if (channel === 'instagram') {
    return {
      kind: 'instagram',
      title: item.title,
      thumb: item.image_url?.trim() || null,
      format: instagramFormatFromTags(item.tags),
    };
  }
  if (channel === 'email' || channel === 'newsletter') {
    return { kind: 'email', subject: emailSubject(item.title, item.body) };
  }
  return { kind: 'other', title: item.title };
}
