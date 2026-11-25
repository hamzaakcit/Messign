/**
 * Labeled offer sheet stored in `user_brief`.
 * The first block is the human intent. Known labels carry the product facts.
 * Unknown labels are ignored. Tags stay on the content row.
 */

import { journeyDraftPiiError } from './journeyEmailDraft.js';

export interface OfferSheet {
  intent: string;
  product: string;
  truthId: string;
  place: string;
  price: string;
  claim: string;
  claimId: string;
  audience: string;
  /** Physical object. Leads the Fal scene. Not a gate field. */
  materials: string;
  /** What the frame must show. Not a gate field. */
  inFrame: string;
  /** What the frame must leave out. Not a gate field. */
  keepOut: string;
  /** Image look. Not a gate field. Empty means photoreal. */
  style: string;
  windowStart: string;
  windowEnd: string;
  language: '' | 'tr' | 'en';
}

export interface OfferSheetFieldError {
  field: string;
  message: string;
}

export interface OfferSheetParseResult {
  sheet: OfferSheet;
  errors: OfferSheetFieldError[];
}

const LABEL_TO_FIELD: Record<string, keyof OfferSheet | 'window'> = {
  product: 'product',
  truth_id: 'truthId',
  place: 'place',
  price: 'price',
  claim: 'claim',
  claim_id: 'claimId',
  audience: 'audience',
  materials: 'materials',
  in_frame: 'inFrame',
  keep_out: 'keepOut',
  style: 'style',
  window: 'window',
  language: 'language',
};

/**
 * Empty sheet. Intent and every fact are blank.
 */
export function emptyOfferSheet(): OfferSheet {
  return {
    intent: '',
    product: '',
    truthId: '',
    place: '',
    price: '',
    claim: '',
    claimId: '',
    audience: '',
    materials: '',
    inFrame: '',
    keepOut: '',
    style: '',
    windowStart: '',
    windowEnd: '',
    language: '',
  };
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Read a brief into a sheet. A sentence with no labels is intent only.
 * A phone number or email in `audience`, a bad window, or a language other than tr/en is an error.
 * The function does not throw.
 */
export function parseOfferSheet(brief: string | null | undefined): OfferSheetParseResult {
  const sheet = emptyOfferSheet();
  const errors: OfferSheetFieldError[] = [];
  const intentLines: string[] = [];
  let seenLabel = false;

  for (const rawLine of (brief ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const splitAt = line.indexOf(':');
    const key = splitAt > 0 ? line.slice(0, splitAt).trim().toLowerCase().replace(/\s+/g, '_') : '';
    const field = key ? LABEL_TO_FIELD[key] : undefined;
    if (!field) {
      // Before the first known label this is the human intent, colons and all ("Sale: 20% off", "Tone: warm").
      // After it, an unknown label is ignored.
      if (!seenLabel) intentLines.push(line);
      continue;
    }
    seenLabel = true;
    const value = line.slice(splitAt + 1).trim();
    if (field === 'window') {
      const [start, end] = value.split('..').map((part) => part.trim());
      if (!start || !end || !isRealDate(start) || !isRealDate(end) || start > end) {
        errors.push({ field: 'window', message: 'Window must be two dates, start..end, in YYYY-MM-DD.' });
        continue;
      }
      sheet.windowStart = start;
      sheet.windowEnd = end;
      continue;
    }
    if (field === 'language') {
      if (value !== 'tr' && value !== 'en') {
        errors.push({ field: 'language', message: 'Language must be tr or en.' });
        continue;
      }
      sheet.language = value;
      continue;
    }
    sheet[field] = value;
  }

  sheet.intent = intentLines.join('\n').trim();
  const pii = journeyDraftPiiError(sheet.audience);
  if (pii) errors.push({ field: 'audience', message: pii });
  return { sheet, errors };
}

/**
 * Write a sheet back to a brief. Empty facts are omitted.
 * A sheet with only an intent line serializes to that sentence.
 */
export function serializeOfferSheet(sheet: OfferSheet): string {
  const lines: string[] = [];
  const intent = sheet.intent.trim();
  if (intent) lines.push(intent);
  const facts: Array<[string, string]> = [
    ['product', sheet.product.trim()],
    ['truth_id', sheet.truthId.trim()],
    ['materials', sheet.materials.trim()],
    ['place', sheet.place.trim()],
    ['in_frame', sheet.inFrame.trim()],
    ['keep_out', sheet.keepOut.trim()],
    ['style', sheet.style.trim()],
    ['price', sheet.price.trim()],
    ['claim', sheet.claim.trim()],
    ['claim_id', sheet.claimId.trim()],
    ['audience', sheet.audience.trim()],
  ];
  if (sheet.windowStart && sheet.windowEnd) {
    facts.push(['window', `${sheet.windowStart}..${sheet.windowEnd}`]);
  }
  if (sheet.language === 'tr' || sheet.language === 'en') {
    facts.push(['language', sheet.language]);
  }
  const factLines = facts.filter(([, value]) => value.length > 0).map(([key, value]) => `${key}: ${value}`);
  if (intent && factLines.length > 0) lines.push('');
  lines.push(...factLines);
  return lines.join('\n').trim();
}
