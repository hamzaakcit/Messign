import { parseOfferSheet, serializeOfferSheet } from '../../../services/marketing/offerSheet.js';
import { offerSheetIsActive } from '../../../services/marketing/offerProductionGate.js';

const FULL_BRIEF = [
  'Window drop for the novel on the counter this week.',
  '',
  'product: Kürk Mantolu Madonna',
  'truth_id: 11111111-2222-4333-8444-555555555555',
  'place: Karaköy kitapçı vitrini',
  'price: ₺189',
  'claim: Bu hafta vitrinde',
  'claim_id: 22222222-3333-4444-8555-666666666666',
  'audience: Shoppers passing the window',
  'window: 2026-11-16..2026-11-22',
  'language: tr',
  'style: editorial',
  'materials: A novel in the shop window.',
  'in_frame: the closed book standing face-out in the glass',
  'keep_out: people, flowers, a crown, letters',
  'mood: warm',
].join('\n');

describe('offer sheet', () => {
  it('round-trips a full sheet and ignores an unknown label', () => {
    const parsed = parseOfferSheet(FULL_BRIEF);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheet.intent).toBe('Window drop for the novel on the counter this week.');
    expect(parsed.sheet.product).toBe('Kürk Mantolu Madonna');
    expect(parsed.sheet.truthId).toBe('11111111-2222-4333-8444-555555555555');
    expect(parsed.sheet.place).toBe('Karaköy kitapçı vitrini');
    expect(parsed.sheet.price).toBe('₺189');
    expect(parsed.sheet.windowStart).toBe('2026-11-16');
    expect(parsed.sheet.windowEnd).toBe('2026-11-22');
    expect(parsed.sheet.language).toBe('tr');
    expect(parsed.sheet.materials).toBe('A novel in the shop window.');
    expect(parsed.sheet.inFrame).toBe('the closed book standing face-out in the glass');
    expect(parsed.sheet.keepOut).toBe('people, flowers, a crown, letters');
    expect(parsed.sheet.style).toBe('editorial');
    expect(serializeOfferSheet(parsed.sheet)).not.toContain('mood:');

    const again = parseOfferSheet(serializeOfferSheet(parsed.sheet));
    expect(again.errors).toEqual([]);
    expect(again.sheet).toEqual(parsed.sheet);
  });

  it('keeps intent lines that contain a colon, and still ignores an unknown label after the facts', () => {
    const parsed = parseOfferSheet(['Teachers Day: daisy bouquets', 'Tone: warm', '', 'product: Papatya buketi', 'price: ₺450', 'mood: calm'].join('\n'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheet.intent).toBe('Teachers Day: daisy bouquets\nTone: warm');
    expect(parsed.sheet.product).toBe('Papatya buketi');
    expect(parsed.sheet.price).toBe('₺450');
    expect(serializeOfferSheet(parsed.sheet)).not.toContain('mood');
    expect(parseOfferSheet(serializeOfferSheet(parsed.sheet)).sheet).toEqual(parsed.sheet);
  });

  it('treats a sentence with no labels as intent only', () => {
    const parsed = parseOfferSheet('Window drop for the novel.');
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheet.intent).toBe('Window drop for the novel.');
    expect(parsed.sheet.product).toBe('');
    expect(parsed.sheet.price).toBe('');
    expect(serializeOfferSheet(parsed.sheet)).toBe('Window drop for the novel.');
  });

  it('rejects a window whose end is before its start', () => {
    const parsed = parseOfferSheet('Drop\nwindow: 2026-11-22..2026-11-16');
    expect(parsed.errors).toEqual([
      { field: 'window', message: 'Window must be two dates, start..end, in YYYY-MM-DD.' },
    ]);
    expect(parsed.sheet.windowStart).toBe('');
    expect(parsed.sheet.intent).toBe('Drop');
  });

  it('rejects a phone number in the audience', () => {
    const parsed = parseOfferSheet('Drop\naudience: Call +90 555 123 4567');
    expect(parsed.errors.map((error) => error.field)).toEqual(['audience']);
    expect(parsed.sheet.audience).toContain('+90');
  });

  it('does not treat a shot note alone as an active offer sheet', () => {
    const parsed = parseOfferSheet('in_frame: the closed book\nkeep_out: people');
    expect(offerSheetIsActive(parsed.sheet)).toBe(false);
    expect(parsed.sheet.inFrame).toBe('the closed book');
    expect(parsed.sheet.keepOut).toBe('people');
  });
});
