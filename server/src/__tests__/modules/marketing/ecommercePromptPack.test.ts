import { describe, expect, it } from 'vitest';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';
import {
  ECOMMERCE_PROMPT_FIXTURES,
  brandLanguageFromProfile,
  buildEcommerceFixtureImagePrompt,
  inferEcommerceVertical,
  unsupportedDiscountPhrase,
} from '../../../modules/marketing/prompts/ecommercePromptPack.js';

const baseInput = {
  userRole: 'admin',
  productTruthMd: '## Truth\n- Feature A',
  brandVoiceMd: '## Brand\nLanguage: Turkish',
};

describe('ecommerce prompt pack', () => {
  it('covers five bookstore briefs and five florist briefs', () => {
    const books = ECOMMERCE_PROMPT_FIXTURES.filter((fixture) => fixture.vertical === 'bookstore');
    const flowers = ECOMMERCE_PROMPT_FIXTURES.filter((fixture) => fixture.vertical === 'florist');
    expect(books).toHaveLength(5);
    expect(flowers).toHaveLength(5);
  });

  it('names the product and the place in every image prompt', () => {
    for (const fixture of ECOMMERCE_PROMPT_FIXTURES) {
      expect(inferEcommerceVertical(fixture.brief)).toBe(fixture.vertical);
      const prompt = buildEcommerceFixtureImagePrompt(fixture);
      expect(prompt).toContain(`photograph of ${fixture.product} at ${fixture.place}`);
      expect(prompt).toContain('Link in bio');
    }
  });

  it('selects the bookstore addendum in Turkish and leaves a generic Instagram brief unchanged', () => {
    const bookstore = buildMarketingContentStrategistPrompt({
      ...baseInput,
      channel: 'instagram',
      userBrief: 'Instagram bookstore post for İnce Memed at the Kadıköy kitapçı.',
    });
    expect(bookstore).toContain('E-commerce Instagram (bookstore)');
    expect(bookstore).toContain('Write the caption in Turkish');
    expect(bookstore).toContain('Link in bio');
    expect(bookstore).not.toContain('E-commerce Instagram (florist)');

    const generic = buildMarketingContentStrategistPrompt({
      ...baseInput,
      channel: 'instagram',
      userBrief: 'A square post about our weekly planning ritual.',
    });
    expect(generic).not.toContain('E-commerce Instagram');
    expect(brandLanguageFromProfile('Tone: warm. Language: English')).toBe('en');
  });

  it('gives Lucy the product, the place, and the sheet language without the price', () => {
    const prompt = buildMarketingContentStrategistPrompt({
      ...baseInput,
      brandVoiceMd: '## Brand\nLanguage: English',
      channel: 'instagram',
      offerMaterials: 'A novel in the shop window.',
      userBrief: [
        'Nice photo',
        '',
        'product: Kürk Mantolu Madonna',
        'place: Karaköy kitapçı vitrini',
        'price: ₺189',
        'claim: Bu hafta vitrinde',
        'language: tr',
      ].join('\n'),
    });
    expect(prompt).toContain('Product: Kürk Mantolu Madonna');
    expect(prompt).toContain('Place: Karaköy kitapçı vitrini');
    expect(prompt).toContain('Materials: A novel in the shop window.');
    expect(prompt).toContain('Caption language: Turkish.');
    expect(prompt).toContain('E-commerce Instagram (bookstore)');
    expect(prompt).toContain('Write the caption in Turkish');
    expect(prompt).not.toContain('₺189');
    expect(prompt).not.toContain('Bu hafta vitrinde');
  });

  it('rejects 50% off when product truth has no such discount and allows it when the sheet lists it', () => {
    const truth = 'İnce Memed. Price: 120 TL.';
    expect(unsupportedDiscountPhrase('Bu hafta 50% off', truth)).toBe('50% off');
    expect(unsupportedDiscountPhrase('Bu hafta 50% off', 'Approved claim: 50% off weekend.')).toBeNull();
  });
});
