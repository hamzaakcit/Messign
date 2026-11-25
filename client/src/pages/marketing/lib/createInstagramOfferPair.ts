/**
 * Creates an offer and only the children its recipe allows.
 * Product drop: one Instagram draft and one journey email.
 * Cart: the email only.
 */
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { planRecipeChildren, type OfferRecipe } from './offerRecipes';

export const OFFER_CONTENT_TYPE = 'offer';

export interface CreateInstagramOfferPairInput {
  topic: string;
  format?: 'feed' | 'story' | 'reel';
  brandProfileId?: string | null;
  /** The campaign this offer is named under. The post and the email join it. */
  campaignId?: string | null;
  recipe?: OfferRecipe;
  /** Occasion only. Defaults to on. Ignored for product drop and cart. */
  includeInstagram?: boolean;
  /** When true, image generation returns a placeholder and does not call a provider. */
  mockImage?: boolean;
  /** Labeled offer sheet. Falls back to the topic when omitted. */
  userBrief?: string;
}

export interface InstagramOfferPair {
  offer: ContentItem;
  /** Instagram child when the recipe includes that slot. */
  child: ContentItem | null;
  email: ContentItem | null;
}

/**
 * Persists the offer, then each allowed child.
 * Associates a brand profile when one is selected. Brand association failure
 * does not discard the rows.
 */
export async function createInstagramOfferPair(
  userId: string,
  input: CreateInstagramOfferPairInput,
): Promise<InstagramOfferPair> {
  const topic = input.topic.trim().slice(0, 500);
  const brief = (input.userBrief ?? topic).trim() || topic;
  const format = input.format ?? 'feed';
  const recipe = input.recipe ?? 'product_drop';
  const slots = planRecipeChildren(recipe, { includeInstagram: input.includeInstagram });
  const tags = [`recipe:${recipe}`, `ig_format:${format}`];
  if (input.mockImage) tags.push('image_gen:mock');
  if (recipe === 'occasion' && input.includeInstagram === false) tags.push('ig_slot:off');
  const brandId = input.brandProfileId?.trim() || undefined;
  const campaign = input.campaignId ? { campaign_id: input.campaignId } : {};

  const offer = await marketingAPI.createContent(userId, {
    title: topic,
    content_type: OFFER_CONTENT_TYPE,
    channel: 'internal',
    status: 'draft',
    user_brief: brief,
    tags,
    ...campaign,
  });

  let child: ContentItem | null = null;
  if (slots.includes('instagram')) {
    child = await marketingAPI.createContent(userId, {
      title: topic,
      content_type: 'social',
      channel: 'instagram',
      status: 'draft',
      parent_content_id: offer.id,
      user_brief: brief,
      tags,
      ...campaign,
    });
  }

  let email: ContentItem | null = null;
  if (slots.includes('email')) {
    email = await marketingAPI.draftJourneyEmail(userId, offer.id);
  }

  const ids = [offer.id, child?.id, email?.id].filter((id): id is string => Boolean(id));
  if (brandId) {
    await Promise.all(
      ids.map((id) => marketingAPI.associateBrandWithContent(userId, brandId, id).catch(() => undefined)),
    );
  }

  return { offer, child, email };
}
