/**
 * Feed package check after Fal.
 * A labeled sheet must come back as a square still whose returned prompt
 * still names the product and the place, with one caption price and a link-in-bio line.
 */

import type { AspectRatio, StylePreset } from '../../dal/marketing/instagramTypes.js';
import { parseOfferSheet, type OfferSheet } from './offerSheet.js';
import { offerSheetIsActive } from './offerProductionGate.js';
import { inferEcommerceVertical } from '../../modules/marketing/prompts/ecommercePromptPack.js';
import { buildInstagramFeedT2iPrompt } from './workflows/instagramFeedT2i.js';

export interface FeedPackageError {
  field: string;
  message: string;
}

function priceKey(value: string): string {
  return value.replace(/[^\d]/g, '');
}

const CAPTION_LIMIT = 2200;
const URL_PATTERN = /https?:\/\/|www\./i;

/**
 * Money tokens in a caption, with spaces removed so `₺ 189` matches `₺189`.
 */
export function captionPrices(caption: string): string[] {
  const pattern = /₺\s*\d[\d.,]*|\d[\d.,]*\s*(?:₺|TL)\b/gi;
  return (caption.match(pattern) ?? []).map((price) => price.replace(/\s+/g, '').replace(/TL/gi, '₺'));
}

/**
 * Prefer the aspect Fal returned. Otherwise keep the aspect we requested.
 */
export function feedFrameAspect(
  returned: string | null | undefined,
  requested: AspectRatio,
): AspectRatio {
  if (returned === '1:1' || returned === '4:5' || returned === '9:16' || returned === '16:9') return returned;
  return requested;
}

function includesFact(haystack: string, fact: string): boolean {
  const named = fact.trim();
  if (!named) return true;
  return haystack.toLocaleLowerCase('tr').includes(named.toLocaleLowerCase('tr'));
}

/**
 * Still checks: returned prompt keeps the product and the place, and the frame is square.
 */
export function checkFeedStill(input: {
  sheet: OfferSheet;
  returnedPrompt: string | null | undefined;
  aspectRatio: AspectRatio | null | undefined;
}): FeedPackageError[] {
  const errors: FeedPackageError[] = [];
  const returned = input.returnedPrompt?.trim() ?? '';
  if (!input.sheet.product.trim() || !includesFact(returned, input.sheet.product)) {
    errors.push({ field: 'product', message: 'Returned prompt must name the product.' });
  }
  if (!input.sheet.place.trim() || !includesFact(returned, input.sheet.place)) {
    errors.push({ field: 'place', message: 'Returned prompt must name the place.' });
  }
  if (input.aspectRatio !== '1:1') {
    errors.push({ field: 'frame', message: 'Feed frame must be square.' });
  }
  return errors;
}

/**
 * Caption checks for a feed post. A second price, a raw URL, or a missing link-in-bio line fails.
 */
export function checkFeedCaption(sheet: OfferSheet, caption: string): FeedPackageError[] {
  const errors: FeedPackageError[] = [];
  const text = caption.trim();
  if (text.length > CAPTION_LIMIT) {
    errors.push({ field: 'caption', message: 'Caption is over 2,200 characters.' });
  }
  if (!/link in bio/i.test(text)) {
    errors.push({ field: 'caption', message: 'Caption must say Link in bio.' });
  }
  if (URL_PATTERN.test(text)) {
    errors.push({ field: 'caption', message: 'Caption contains a raw URL.' });
  }
  const prices = captionPrices(text);
  const sheetKey = priceKey(sheet.price);
  const extra = prices.filter((price) => priceKey(price) !== sheetKey);
  if (prices.length > 1 || (sheetKey.length > 0 && extra.length > 0) || (sheetKey.length === 0 && prices.length > 0)) {
    errors.push({ field: 'price', message: 'Caption adds a second price.' });
  }
  return errors;
}

/**
 * Full feed package. Empty when the brief has no product or place, so a plain topic still saves.
 */
export function checkFeedPackage(input: {
  brief: string | null | undefined;
  returnedPrompt: string | null | undefined;
  aspectRatio: AspectRatio | null | undefined;
  caption: string;
  format?: 'feed' | 'story' | 'reel' | null;
}): FeedPackageError[] {
  if (input.format === 'story' || input.format === 'reel') return [];
  const sheet = parseOfferSheet(input.brief).sheet;
  if (!offerSheetIsActive(sheet) || (!sheet.product.trim() && !sheet.place.trim())) return [];
  return [
    ...checkFeedStill({ sheet, returnedPrompt: input.returnedPrompt, aspectRatio: input.aspectRatio }),
    ...checkFeedCaption(sheet, input.caption),
  ];
}

/**
 * Join package errors into the workflow reason string.
 */
export function formatFeedPackageErrors(errors: readonly FeedPackageError[]): string {
  return errors.map((error) => `${error.field}: ${error.message}`).join('; ');
}

export interface FeedRegenScene {
  prompt: string;
  direct: boolean;
  sceneProduct?: string;
  scenePlace?: string;
  shopStill: boolean;
  aspectRatio: AspectRatio;
}

/**
 * Regen keeps the sheet scene. A brief with no product or place still uses the new prompt.
 */
export function feedRegenScene(params: {
  userBrief: string | null | undefined;
  newPrompt: string;
  stylePreset: StylePreset;
  aspectRatio?: AspectRatio | null;
}): FeedRegenScene {
  const sheet = parseOfferSheet(params.userBrief).sheet;
  const aspectRatio = params.aspectRatio ?? '1:1';
  const active = Boolean(sheet.product.trim() || sheet.place.trim());
  if (!active) {
    const built = buildInstagramFeedT2iPrompt(params.newPrompt, params.stylePreset, undefined, aspectRatio);
    return { prompt: built.prompt, direct: built.instagram_direct_prompt, shopStill: false, aspectRatio };
  }
  const built = buildInstagramFeedT2iPrompt(params.newPrompt, params.stylePreset, {
    userBrief: params.userBrief,
  }, aspectRatio);
  const shopStill =
    inferEcommerceVertical([sheet.product, sheet.place].filter(Boolean).join('\n')) != null;
  return {
    prompt: built.prompt,
    direct: built.instagram_direct_prompt,
    sceneProduct: sheet.product.trim() || undefined,
    scenePlace: sheet.place.trim() || undefined,
    shopStill,
    aspectRatio,
  };
}
