/**
 * Journey email child for an offer. The draft is built from the offer title and
 * the parsed sheet, not from an Instagram caption and not by scanning the brief for a price.
 */

import { parseOfferSheet } from './offerSheet.js';

export interface JourneyEmailOffer {
  id: string;
  title: string;
  userBrief?: string | null;
  tags?: readonly string[] | null;
}

export interface JourneyEmailCreateInput {
  title: string;
  content_type: 'email';
  channel: 'email';
  status: 'draft';
  body: string;
  user_brief: string;
  parent_content_id: string;
  tags: string[];
}

const OPT_OUT =
  /unsubscribe|opt[\s-]?out|abonelikten\s*çık|abonelikten\s*cik|listeden\s*çık|listeden\s*cik/i;

const DRAFT_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const DRAFT_PHONE = /(?:\+\d{1,3}[\s-]?)?\d{3}[\s.-]\d{3}[\s.-]\d{2,4}(?:[\s.-]\d{2,4})?|\+\d{10,15}/;

/**
 * Template id a later journey step will render. Stored on the email child.
 * Shape: `{offerId}:email`.
 */
export function journeyTemplateRef(offerId: string): string {
  return `${offerId}:email`;
}

/** Read `journey_template_ref:{offerId}:email` from content tags. */
export function journeyTemplateRefFromTags(tags: readonly string[] | null | undefined): string | null {
  const prefix = 'journey_template_ref:';
  const tag = tags?.find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : null;
}

/**
 * Journey drafts must not carry a customer email address or phone number.
 * Returns an error message when the prompt should be refused.
 */
export function journeyDraftPiiError(text: string): string | null {
  if (DRAFT_EMAIL.test(text) || DRAFT_PHONE.test(text)) {
    return 'Draft prompt cannot include an email address or phone number.';
  }
  return null;
}

/**
 * True when an email (not Instagram) is missing an opt-out line.
 * Instagram captions are not commercial opt-in messages and do not need one.
 */
export function emailOptOutBlocksReview(
  channel: string | null | undefined,
  text: string,
): boolean {
  const normalized = (channel ?? '').trim().toLowerCase();
  if (normalized !== 'email' && normalized !== 'newsletter') return false;
  return !OPT_OUT.test(text);
}

/** Message for a blocked review, or null when the channel may proceed. */
export function reviewBlockedByMissingOptOut(
  channel: string | null | undefined,
  text: string,
): string | null {
  if (!emailOptOutBlocksReview(channel, text)) return null;
  return 'Email needs an unsubscribe or opt-out line before review.';
}

/**
 * Create-payload for the email child of an offer.
 * Subject is the offer title. Preview is the claim, or the intent line when the claim is empty.
 * A price line is written only when the sheet price field is set.
 */
export function journeyEmailCreateInput(offer: JourneyEmailOffer): JourneyEmailCreateInput {
  const subject = offer.title.trim().slice(0, 200) || 'Journey email';
  const brief = (offer.userBrief ?? '').trim();
  const sheet = parseOfferSheet(brief).sheet;
  const preview = sheet.claim.trim() || sheet.intent.trim();
  const price = sheet.price.trim();
  const product = sheet.product.trim();
  const windowLabel =
    sheet.windowStart && sheet.windowEnd ? `${sheet.windowStart}..${sheet.windowEnd}` : '';
  const recipeTags = (offer.tags ?? []).filter(
    (tag) => tag.startsWith('recipe:') || tag === 'ig_slot:off',
  );
  const cartNote = recipeTags.includes('recipe:cart')
    ? 'A public Instagram post is a different recipe. This email does not create one.'
    : null;
  const body = [
    `SUBJECT: ${subject}`,
    preview ? `PREVIEW: ${preview}` : null,
    product ? `Product: ${product}` : null,
    price ? `Price: ${price}` : null,
    windowLabel ? `Window: ${windowLabel}` : null,
    cartNote,
    'Unsubscribe: {{unsubscribe_url}}',
  ]
    .filter((line): line is string => line != null)
    .join('\n');

  return {
    title: subject,
    content_type: 'email',
    channel: 'email',
    status: 'draft',
    body,
    user_brief: brief || subject,
    parent_content_id: offer.id,
    tags: [
      'journey_email',
      `journey_template_ref:${journeyTemplateRef(offer.id)}`,
      ...(recipeTags.length > 0 ? recipeTags : ['recipe:product_drop']),
    ],
  };
}
