/**
 * Messign is the brand. Dora, Lucy, Messign, Knowledge Hub, and Work Management are products.
 * A still for one of those products must not paint the product name as the brand.
 */

import { MESSIGN_PRODUCT_NAMES } from '../../tenantContentSetup.js';

export interface MessignBrandStillInput {
  product?: string | null;
  brief?: string | null;
  /** Bookstore and florist stills keep their own brand. */
  shopStill?: boolean;
}

/**
 * True when this still is for the Messign brand, so the prompt names Messign and not the product.
 */
export function isMessignBrandStill(input: MessignBrandStillInput): boolean {
  if (input.shopStill === true) return false;
  const product = (input.product ?? '').trim().toLocaleLowerCase('en');
  if (product && MESSIGN_PRODUCT_NAMES.some((name) => name.toLocaleLowerCase('en') === product)) return true;
  return /\bmessign\b/i.test(input.brief ?? '');
}
