/**
 * Caption for an offer's Instagram post (MC-18). The model writes it from the offer sheet only: the product, its
 * price and claim, the place, the audience and the intent the shop typed. No customer data goes in, and the prompt
 * forbids facts that are not on the sheet. The text lands on the post as a draft; review still runs the product-truth
 * and brand-voice checks on it.
 */

import { parseOfferSheet, type OfferSheet } from './offerSheet.js';
import { journeyDraftPiiError } from './journeyEmailDraft.js';
import type { LLMCallFunction } from './channelGenerators/types.js';

/** Instagram's caption limit. */
export const CAPTION_MAX = 2200;

export interface CaptionPrompt {
  systemPrompt: string;
  userMessage: string;
}

/** The facts the caption may use, one per line, empty ones left out. */
function sheetFacts(sheet: OfferSheet, title: string): string[] {
  const rows: Array<[string, string]> = [
    ['Product', sheet.product],
    ['Price', sheet.price],
    ['Claim', sheet.claim],
    ['Place', sheet.place],
    ['Audience', sheet.audience],
    ['Window', [sheet.windowStart, sheet.windowEnd].filter(Boolean).join(' to ')],
    ['What the shop wants to say', sheet.intent || title],
  ];
  return rows.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`);
}

/**
 * The prompt for one caption. Pure: the same sheet always gives the same prompt.
 * `brandName` is the shop's name, never a person's.
 */
export function buildCaptionPrompt(
  sheet: OfferSheet,
  opts: { title: string; brandName?: string | null },
): CaptionPrompt {
  const language = sheet.language === 'en' ? 'English' : 'Turkish';
  const brand = opts.brandName?.trim();
  const systemPrompt = [
    `You write one Instagram caption for a small shop${brand ? ` called ${brand}` : ''}.`,
    `Write in ${language}.`,
    'Use only the facts given below. Do not invent prices, discounts, stock levels, dates, awards, health or safety claims, or anything about people.',
    'Do not name or address a customer. Do not include an email address, a phone number or a link.',
    'Structure: a first line that makes someone stop, two or three short lines about the product, then one clear call to action.',
    'Finish with 3 to 5 relevant hashtags on the last line.',
    `Keep it under ${CAPTION_MAX} characters.`,
    'Answer with the caption text only: no quotation marks, no preface, no explanation.',
  ].join('\n');
  const userMessage = `Offer sheet:\n${sheetFacts(sheet, opts.title).join('\n')}`;
  return { systemPrompt, userMessage };
}

/** Removes fences, wrapping quotes and a leading "Caption:" label, and keeps it inside the limit. */
export function cleanCaption(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  text = text.replace(/^(caption|başlık|açıklama)\s*:\s*/i, '').trim();
  if (/^["“”«].*["“”»]$/s.test(text)) text = text.slice(1, -1).trim();
  if (text.length > CAPTION_MAX) text = `${text.slice(0, CAPTION_MAX - 1).trimEnd()}…`;
  return text;
}

export interface DraftCaptionInput {
  /** The offer sheet text saved in `user_brief`. */
  brief: string | null | undefined;
  title: string;
  brandName?: string | null;
}

export class CaptionDraftError extends Error {
  constructor(message: string, readonly status: 400 | 422 | 502) {
    super(message);
    this.name = 'CaptionDraftError';
  }
}

/**
 * Writes the caption. `callLLM` is injected (the route passes the gateway), so tests need no model.
 * Refuses a sheet with no product and no intent, and a model answer that carries an email address or phone number.
 */
export async function draftOfferCaption(input: DraftCaptionInput, callLLM: LLMCallFunction): Promise<string> {
  const { sheet } = parseOfferSheet(input.brief);
  if (!sheet.product.trim() && !sheet.intent.trim()) {
    throw new CaptionDraftError('The offer needs a product or a topic before a caption can be written.', 400);
  }
  const prompt = buildCaptionPrompt(sheet, { title: input.title, brandName: input.brandName });
  let raw: string;
  try {
    raw = await callLLM({ model: 'creative', systemPrompt: prompt.systemPrompt, userMessage: prompt.userMessage, maxTokens: 700 });
  } catch {
    throw new CaptionDraftError('The caption could not be written. Try again.', 502);
  }
  const caption = cleanCaption(raw);
  if (!caption) throw new CaptionDraftError('The model returned no caption. Try again.', 502);
  if (journeyDraftPiiError(caption)) {
    throw new CaptionDraftError('The caption included contact details and was discarded. Try again.', 422);
  }
  return caption;
}
