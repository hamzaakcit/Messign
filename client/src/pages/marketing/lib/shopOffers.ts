/**
 * Which offers belong on the counter for the shop selected in this browser.
 */

import type { ContentItem } from '@/lib/marketingApi';
import { readStudioSheet } from './offerSheetForm';
import type { TenantContentSetup } from './tenantContentSetup';

export interface ShopOfferRow {
  offer: ContentItem;
  child: ContentItem | null;
  product: string;
  price: string;
  step: 'Writing' | 'Picture' | 'Review' | 'Ready' | 'Draft';
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
 * Where the offer sits. Ready covers review, schedule, and publish.
 * A caption without a still is Picture. A child with neither is Writing.
 */
export function offerStep(offer: ContentItem, child: ContentItem | null): ShopOfferRow['step'] {
  const status = (offer.status || child?.status || '').toLowerCase();
  if (status === 'in_review' || status === 'approved' || status === 'ready' || status === 'scheduled' || status === 'published') {
    return 'Ready';
  }
  const hasBody = Boolean(child?.body?.trim());
  const hasImage = Boolean(child?.image_url?.trim() || offer.image_url?.trim());
  if (hasBody && hasImage) return 'Review';
  if (hasBody) return 'Picture';
  if (child) return 'Writing';
  return 'Draft';
}

/**
 * Offers for this shop, newest first, with the Instagram child when the list has one.
 */
export function shopOfferRows(items: readonly ContentItem[], setup: TenantContentSetup): ShopOfferRow[] {
  const offers = items.filter((item) => (item.content_type ?? '') === 'offer' && offerMatchesShop(item.user_brief, setup));
  return offers
    .map((offer) => {
      const child = items.find((item) => item.parent_content_id === offer.id && (item.channel ?? '').toLowerCase() === 'instagram') ?? null;
      const sheet = readStudioSheet(offer.user_brief);
      return {
        offer,
        child,
        product: sheet.product || offer.title,
        price: sheet.price,
        step: offerStep(offer, child),
      };
    })
    .sort((a, b) => (b.offer.created_at || '').localeCompare(a.offer.created_at || ''));
}
