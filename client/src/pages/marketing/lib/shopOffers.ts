/**
 * Which offers belong on the counter for the shop selected in this browser.
 */

import type { ContentItem } from '@/lib/marketingApi';
import { readStudioSheet } from './offerSheetForm';
import type { TenantContentSetup } from './tenantContentSetup';

export type OfferStage = 'progress' | 'review' | 'approved' | 'scheduled' | 'live';

export interface ShopOfferRow {
  offer: ContentItem;
  /** The Instagram post, or the email when the offer has no post (cart). */
  child: ContentItem | null;
  product: string;
  price: string;
  step: 'Draft' | 'Writing' | 'Picture' | 'Ready for review' | 'In review' | 'Approved' | 'Scheduled' | 'Live';
  stage: OfferStage;
}

/** The offer list's status view (what the Pipeline board used to show). */
export const OFFER_FILTERS: Array<{ id: 'all' | OfferStage; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'In progress' },
  { id: 'review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'live', label: 'Live' },
];

export function parseOfferFilter(value: string | null): 'all' | OfferStage {
  return OFFER_FILTERS.some((f) => f.id === value) ? (value as 'all' | OfferStage) : 'all';
}

/**
 * Read `truth_id` from a brief. Empty when the label is absent.
 */
function truthIdFromBrief(brief: string | null | undefined): string {
  for (const rawLine of (brief ?? '').split('\n')) {
    const line = rawLine.trim();
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase();
    if (key === 'truth_id') return line.slice(splitAt + 1).trim();
  }
  return '';
}

/**
 * True when the offer names a product on this shop's truth list,
 * or its truth id starts with this shop. A brief with neither stays on Messign.
 */
export function offerMatchesShop(brief: string | null | undefined, setup: TenantContentSetup): boolean {
  const sheet = readStudioSheet(brief);
  if (sheet.product) {
    return setup.productTruth.some((row) => row.name === sheet.product);
  }
  const truthId = truthIdFromBrief(brief);
  if (truthId.startsWith(`${setup.orgKey}:`)) return true;
  return !truthId && setup.orgKey === 'messign';
}

/**
 * Where the offer sits, read from its post (the offer row itself stays a draft). Before review: a child with
 * neither text nor still is Writing, a caption without a still is Picture, both is Ready for review.
 */
export function offerStep(offer: ContentItem, child: ContentItem | null): Pick<ShopOfferRow, 'step' | 'stage'> {
  const status = (child?.status || offer.status || '').toLowerCase();
  if (status === 'in_review') return { step: 'In review', stage: 'review' };
  if (status === 'approved' || status === 'ready') return { step: 'Approved', stage: 'approved' };
  if (status === 'scheduled') return { step: 'Scheduled', stage: 'scheduled' };
  if (status === 'published') return { step: 'Live', stage: 'live' };
  const isEmail = (child?.channel ?? '').toLowerCase() === 'email';
  const hasBody = Boolean(child?.body?.trim());
  const hasImage = isEmail || Boolean(child?.image_url?.trim() || offer.image_url?.trim());
  if (hasBody && hasImage) return { step: 'Ready for review', stage: 'progress' };
  if (hasBody) return { step: 'Picture', stage: 'progress' };
  if (child) return { step: 'Writing', stage: 'progress' };
  return { step: 'Draft', stage: 'progress' };
}

/**
 * Offers for this shop, newest first, with the Instagram child when the list has one.
 */
export function shopOfferRows(items: readonly ContentItem[], setup: TenantContentSetup): ShopOfferRow[] {
  const offers = items.filter((item) => (item.content_type ?? '') === 'offer' && offerMatchesShop(item.user_brief, setup));
  return offers
    .map((offer) => {
      const children = items.filter((item) => item.parent_content_id === offer.id);
      const child =
        children.find((item) => (item.channel ?? '').toLowerCase() === 'instagram') ??
        children.find((item) => (item.channel ?? '').toLowerCase() === 'email') ??
        null;
      const sheet = readStudioSheet(offer.user_brief);
      return {
        offer,
        child,
        product: sheet.product || offer.title,
        price: sheet.price,
        ...offerStep(offer, child),
      };
    })
    .sort((a, b) => (b.offer.created_at || '').localeCompare(a.offer.created_at || ''));
}
