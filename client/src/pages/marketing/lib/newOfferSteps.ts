/**
 * Gates for the five-step new offer. A product drop cannot leave Product without a product.
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
