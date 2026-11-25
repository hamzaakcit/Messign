import type { ContentItem } from '@/lib/marketingApi';

export interface JourneyEmailSummary {
  subject: string;
  product: string;
  price: string;
  window: string;
  hasUnsubscribe: boolean;
}

/** Matches the server's opt-out rule in `journeyEmailDraft.ts`. */
const OPT_OUT = /unsubscribe|opt[\s-]?out|abonelikten\s*çık|abonelikten\s*cik|listeden\s*çık|listeden\s*cik/i;

/**
 * Reads the journey email child as the server drafts it (`SUBJECT:`, `Product:`, `Price:`, `Window:` lines plus an
 * unsubscribe line), so the offer can show it without opening the email builder.
 */
export function journeyEmailSummary(email: Pick<ContentItem, 'title' | 'body'>): JourneyEmailSummary {
  const fields: Record<string, string> = {};
  for (const raw of (email.body ?? '').split('\n')) {
    const at = raw.indexOf(':');
    if (at <= 0) continue;
    fields[raw.slice(0, at).trim().toLowerCase()] = raw.slice(at + 1).trim();
  }
  return {
    subject: fields.subject || (email.title ?? ''),
    product: fields.product ?? '',
    price: fields.price ?? '',
    window: fields.window ?? '',
    hasUnsubscribe: OPT_OUT.test(email.body ?? ''),
  };
}
