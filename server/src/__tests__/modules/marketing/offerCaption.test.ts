import { describe, expect, it, vi } from 'vitest';
import {
  buildCaptionPrompt,
  CAPTION_MAX,
  CaptionDraftError,
  cleanCaption,
  draftOfferCaption,
} from '../../../services/marketing/offerCaption.js';
import { parseOfferSheet } from '../../../services/marketing/offerSheet.js';

const BRIEF = [
  'Daisy bouquets for Teachers\' Day',
  '',
  'product: Papatya buketi',
  'place: Nişantaşı çiçekçi tezgahı',
  'price: ₺450',
  'claim: Bu hafta vitrinde',
  'language: tr',
].join('\n');

describe('buildCaptionPrompt', () => {
  const { sheet } = parseOfferSheet(BRIEF);
  const prompt = buildCaptionPrompt(sheet, { title: 'Daisy bouquets', brandName: 'Lilyana' });

  it('carries the product facts and the intent, and names the shop', () => {
    expect(prompt.userMessage).toContain('Product: Papatya buketi');
    expect(prompt.userMessage).toContain('Price: ₺450');
    expect(prompt.userMessage).toContain('Claim: Bu hafta vitrinde');
    expect(prompt.userMessage).toContain("Daisy bouquets for Teachers' Day");
    expect(prompt.systemPrompt).toContain('called Lilyana');
  });

  it('writes in the sheet language and forbids facts that are not on the sheet', () => {
    expect(prompt.systemPrompt).toContain('Write in Turkish.');
    expect(prompt.systemPrompt).toContain('Use only the facts given below');
    expect(prompt.systemPrompt).toContain('Do not name or address a customer');
    expect(buildCaptionPrompt({ ...sheet, language: 'en' }, { title: 't' }).systemPrompt).toContain('Write in English.');
  });

  it('leaves empty facts out and falls back to the title when there is no intent', () => {
    const bare = buildCaptionPrompt(parseOfferSheet('product: Orkide').sheet, { title: 'Orkide drop' });
    expect(bare.userMessage).toBe('Offer sheet:\nProduct: Orkide\nWhat the shop wants to say: Orkide drop');
  });

  it('is the same for the same sheet', () => {
    expect(buildCaptionPrompt(sheet, { title: 'Daisy bouquets' })).toEqual(buildCaptionPrompt(sheet, { title: 'Daisy bouquets' }));
  });
});

describe('cleanCaption', () => {
  it('removes fences, wrapping quotes and a Caption: label', () => {
    expect(cleanCaption('```\nHello there\n```')).toBe('Hello there');
    expect(cleanCaption('"Hello there"')).toBe('Hello there');
    expect(cleanCaption('Caption: Hello there')).toBe('Hello there');
  });

  it('keeps a long answer inside the Instagram limit', () => {
    const long = cleanCaption('a'.repeat(CAPTION_MAX + 500));
    expect(long.length).toBe(CAPTION_MAX);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('draftOfferCaption', () => {
  it('asks the creative model once and returns the cleaned caption', async () => {
    const callLLM = vi.fn().mockResolvedValue('"Papatya buketi vitrinde.\n\n#çiçek #papatya"');
    const caption = await draftOfferCaption({ brief: BRIEF, title: 'Daisy', brandName: 'Lilyana' }, callLLM);
    expect(caption).toBe('Papatya buketi vitrinde.\n\n#çiçek #papatya');
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM.mock.calls[0]?.[0]).toMatchObject({ model: 'creative', maxTokens: 700 });
  });

  it('refuses a sheet with no product and no intent, without calling the model', async () => {
    const callLLM = vi.fn();
    await expect(draftOfferCaption({ brief: '', title: '' }, callLLM)).rejects.toMatchObject({ status: 400 });
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('turns a model failure into a retryable error', async () => {
    const callLLM = vi.fn().mockRejectedValue(new Error('gateway down'));
    await expect(draftOfferCaption({ brief: BRIEF, title: 'x' }, callLLM)).rejects.toMatchObject({ status: 502 });
  });

  it('discards an answer with an email address or a phone number', async () => {
    const withEmail = vi.fn().mockResolvedValue('Write to ayse@example.com for the bouquet');
    await expect(draftOfferCaption({ brief: BRIEF, title: 'x' }, withEmail)).rejects.toBeInstanceOf(CaptionDraftError);
    const withPhone = vi.fn().mockResolvedValue('Call 0532 123 45 67 now');
    await expect(draftOfferCaption({ brief: BRIEF, title: 'x' }, withPhone)).rejects.toMatchObject({ status: 422 });
  });

  it('treats an empty answer as a failure', async () => {
    await expect(draftOfferCaption({ brief: BRIEF, title: 'x' }, vi.fn().mockResolvedValue('  '))).rejects.toMatchObject({ status: 502 });
  });
});
