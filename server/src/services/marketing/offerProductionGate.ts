/**
 * Stops offer generation before a model call when the sheet is not grounded.
 * A plain brief with no labels is left alone. A product drop, or any brief that
 * already has sheet facts, must name a truth row and may not invent a discount.
 */

import type { OfferSheet, OfferSheetFieldError } from './offerSheet.js';
import type { OfferRecipe } from './offerRecipes.js';

export interface OfferTruthRowRef {
  id: string;
  name: string;
  /** Prose from the truth description, without price or place. */
  materials?: string;
}

const DISCOUNT = /(?:\d+(?:[.,]\d+)?\s*%|\b(?:off|indirim)\b)/i;

/**
 * True when the brief already carries offer facts, so the gate applies.
 */
export function offerSheetIsActive(sheet: OfferSheet): boolean {
  return Boolean(
    sheet.product ||
      sheet.truthId ||
      sheet.place ||
      sheet.price ||
      sheet.claim ||
      sheet.claimId ||
      sheet.audience ||
      sheet.windowStart ||
      sheet.language,
  );
}

/**
 * Field errors for a sheet. Empty when this brief is not a product drop and has no sheet facts.
 * `truthRow` is the row loaded for the caller’s org. A missing or mismatched row fails `truth_id`.
 */
export function offerProductionGate(input: {
  sheet: OfferSheet;
  recipe: OfferRecipe | null;
  truthRow: OfferTruthRowRef | null;
}): OfferSheetFieldError[] {
  const active = offerSheetIsActive(input.sheet) || input.recipe === 'product_drop';
  if (!active) return [];

  const errors: OfferSheetFieldError[] = [];
  const sheet = input.sheet;
  const row = input.truthRow;

  if (!sheet.truthId) {
    errors.push({ field: 'truth_id', message: 'Pick a product from this org’s truth sheet.' });
  } else if (!row || row.id !== sheet.truthId) {
    errors.push({ field: 'truth_id', message: 'That truth row is not in this org.' });
  } else if (sheet.product.trim() && row.name.trim() !== sheet.product.trim()) {
    errors.push({ field: 'product', message: 'Product name must match the truth row.' });
  }

  const discountText = [sheet.intent, sheet.claim, sheet.product].join('\n');
  if (DISCOUNT.test(discountText) && !sheet.claimId.trim()) {
    errors.push({ field: 'claim_id', message: 'A discount must be an approved claim.' });
  }

  return errors;
}
