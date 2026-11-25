/**
 * Gates for the new offer. Five steps with a picture, four without (an email-only offer has no still to set up).
 * A product drop cannot leave Product without a product.
 */

import type { OfferRecipe } from './offerRecipes';

export const NEW_OFFER_STEPS = ['Product', 'Picture', 'Words', 'Preview', 'Looks good'] as const;

export type NewOfferStep = (typeof NEW_OFFER_STEPS)[number];

/**
 * True when this recipe is a product drop and no product has been picked.
 */
export function productDropNeedsProduct(recipe: OfferRecipe, product: string): boolean {
  return recipe === 'product_drop' && product.trim().length === 0;
}

/** The steps for this offer: an offer with no Instagram post skips Picture. */
export function offerSteps(withPicture: boolean): readonly NewOfferStep[] {
  return withPicture ? NEW_OFFER_STEPS : NEW_OFFER_STEPS.filter((step) => step !== 'Picture');
}

/**
 * What the shop wants to say: the topic, then any direction, then the tone as a line of its own. This is the block at
 * the top of the saved brief; the caption writer reads it, so a tone typed on the Words step is no longer lost.
 */
export function offerIntent(input: { topic: string; direction: string; tone: string }): string {
  const tone = input.tone.trim();
  return [input.topic.trim(), input.direction.trim(), tone ? `Tone: ${tone}` : ''].filter(Boolean).join('\n');
}
