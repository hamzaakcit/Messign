/**
 * E-commerce Instagram addendum for bookstore and florist briefs.
 * Selected by {@link buildChannelSpecsBlock} when the brief names that vertical.
 */

export type EcommerceVertical = 'bookstore' | 'florist';
export type BrandLanguage = 'tr' | 'en';

export interface EcommerceBriefFixture {
  id: string;
  vertical: EcommerceVertical;
  language: BrandLanguage;
  product: string;
  place: string;
  brief: string;
}

export interface EcommerceChannelContext {
  userBrief?: string;
  brandVoiceMd?: string;
  /** Sheet language. When set, the caption line uses this instead of the brand profile. */
  captionLanguage?: BrandLanguage;
  /**
   * Vertical taken from the truth row. `null` means the row is not a bookstore or florist.
   * When omitted, the brief is scanned as before.
   */
  vertical?: EcommerceVertical | null;
}

const BOOK_ASCII = /\b(books|book|bookstore|bookshop|novel)\b/gi;
const FLOWER_ASCII = /\b(flowers|flower|florist|bouquet|bloom)\b/gi;
const BOOK_TR = ['kitapçı', 'kitapci', 'kitap', 'sahaf', 'yayınevi', 'yayinevi'];
const FLOWER_TR = ['çiçekçi', 'cicekci', 'çiçek', 'cicek', 'buket'];

function countAscii(pattern: RegExp, text: string): number {
  return text.match(pattern)?.length ?? 0;
}

/** Longer tokens win so "kitapçı" is not also counted as "kitap". */
function countTokens(text: string, tokens: readonly string[]): number {
  let remaining = text.toLocaleLowerCase('tr');
  let total = 0;
  const ordered = [...tokens].sort((a, b) => b.length - a.length);
  for (const token of ordered) {
    const needle = token.toLocaleLowerCase('tr');
    let from = 0;
    while (from < remaining.length) {
      const at = remaining.indexOf(needle, from);
      if (at < 0) break;
      total += 1;
      remaining = `${remaining.slice(0, at)}${' '.repeat(needle.length)}${remaining.slice(at + needle.length)}`;
      from = at + needle.length;
    }
  }
  return total;
}

const SHARED_RULES = `
- The image prompt must name the product and the place from the brief. Do not substitute a generic office, conference room, or coworking table.
- Product, price, and any discount must appear in product truth. Do not invent a percent-off.
- Caption CTA is "Link in bio". Do not put a raw URL in the caption.
`.trim();

const BOOKSTORE_RULES = `
Bookstore: show the named book in the named shop (shelf, window, or reading table). Do not replace it with a flower still-life.
`.trim();

const FLORIST_RULES = `
Florist: show the named flowers in the named shop (counter, window, or cooler). Do not replace them with a bookstore aisle.
`.trim();

/** Five bookstore briefs and five florist briefs. Product and place are the image subject. */
export const ECOMMERCE_PROMPT_FIXTURES: readonly EcommerceBriefFixture[] = [
  {
    id: 'book-ince-memed',
    vertical: 'bookstore',
    language: 'tr',
    product: 'İnce Memed',
    place: 'Kadıköy kitapçı vitrini',
    brief: 'Draft an Instagram post for the novel İnce Memed in the Kadıköy kitapçı vitrini.',
  },
  {
    id: 'book-tutunamayanlar',
    vertical: 'bookstore',
    language: 'tr',
    product: 'Tutunamayanlar',
    place: 'Beyoğlu sahaf',
    brief: 'Instagram bookstore post: Tutunamayanlar on a table at Beyoğlu sahaf.',
  },
  {
    id: 'book-madonna',
    vertical: 'bookstore',
    language: 'tr',
    product: 'Kürk Mantolu Madonna',
    place: 'Karaköy kitapçı',
    brief: 'Bookshop window post for Kürk Mantolu Madonna at Karaköy kitapçı.',
  },
  {
    id: 'book-midnight',
    vertical: 'bookstore',
    language: 'en',
    product: 'The Midnight Library',
    place: 'a London bookshop table',
    brief: 'Instagram bookstore post for The Midnight Library on a London bookshop table.',
  },
  {
    id: 'book-dune',
    vertical: 'bookstore',
    language: 'en',
    product: 'Dune',
    place: 'a Seattle bookstore aisle',
    brief: 'Feed post for the novel Dune in a Seattle bookstore aisle.',
  },
  {
    id: 'flower-peony',
    vertical: 'florist',
    language: 'tr',
    product: 'şakayık buketi',
    place: 'Nişantaşı çiçekçi tezgahı',
    brief: 'Instagram florist post: şakayık buketi on the Nişantaşı çiçekçi tezgahı.',
  },
  {
    id: 'flower-lily',
    vertical: 'florist',
    language: 'tr',
    product: 'beyaz zambak',
    place: 'Cihangir çiçekçi vitrini',
    brief: 'Florist window post for beyaz zambak at the Cihangir çiçekçi vitrini.',
  },
  {
    id: 'flower-orchid',
    vertical: 'florist',
    language: 'tr',
    product: 'orkide',
    place: 'Moda atölye tezgahı',
    brief: 'Çiçekçi post: orkide on the Moda atölye tezgahı.',
  },
  {
    id: 'flower-rose',
    vertical: 'florist',
    language: 'en',
    product: 'red roses',
    place: 'a Paris florist cooler',
    brief: 'Instagram florist post of red roses in a Paris florist cooler.',
  },
  {
    id: 'flower-tulip',
    vertical: 'florist',
    language: 'en',
    product: 'tulip bunch',
    place: 'an Amsterdam market stall',
    brief: 'Florist post: tulip bunch at an Amsterdam market stall.',
  },
];

/**
 * Bookstore vs florist from the brief. The vertical with more keyword hits wins.
 * A tie, or no keyword, returns null so a generic Instagram brief stays unchanged.
 */
export function inferEcommerceVertical(text: string | null | undefined): EcommerceVertical | null {
  const source = text ?? '';
  const books = countAscii(BOOK_ASCII, source) + countTokens(source, BOOK_TR);
  const flowers = countAscii(FLOWER_ASCII, source) + countTokens(source, FLOWER_TR);
  if (books === 0 && flowers === 0) return null;
  if (books === flowers) return null;
  return books > flowers ? 'bookstore' : 'florist';
}

/**
 * Caption language from the brand profile. Turkish when the profile says so; otherwise English.
 */
export function brandLanguageFromProfile(brandVoiceMd: string | null | undefined): BrandLanguage {
  const text = brandVoiceMd ?? '';
  if (/\b(turkish|türkçe|turkce)\b/i.test(text) || /language:\s*tr\b/i.test(text)) return 'tr';
  return 'en';
}

/**
 * Instagram addendum for one vertical. Empty when the brief is not bookstore or florist.
 */
export function buildEcommerceInstagramAddendum(context?: EcommerceChannelContext): string {
  const vertical =
    context && 'vertical' in context && context.vertical !== undefined
      ? context.vertical
      : inferEcommerceVertical(context?.userBrief);
  if (!vertical) return '';
  const language = context?.captionLanguage ?? brandLanguageFromProfile(context?.brandVoiceMd);
  const languageLine =
    language === 'tr'
      ? 'Write the caption in Turkish, matching the brand profile.'
      : 'Write the caption in English, matching the brand profile.';
  const scene = vertical === 'bookstore' ? BOOKSTORE_RULES : FLORIST_RULES;
  return `
### E-commerce Instagram (${vertical})
${SHARED_RULES}
${scene}
- ${languageLine}
`.trim();
}

/**
 * Image prompt for a golden brief. Names the product and the place, and states the brand language.
 */
export function buildEcommerceFixtureImagePrompt(fixture: EcommerceBriefFixture): string {
  const languageLine =
    fixture.language === 'tr'
      ? 'Caption language: Turkish, matching the brand profile.'
      : 'Caption language: English, matching the brand profile.';
  return [
    '[IMAGE_PROMPT]',
    `Photorealistic photograph of ${fixture.product} at ${fixture.place}.`,
    'The product is the hero. No office, conference room, or coworking table.',
    'No text, logos, or watermarks. No invented discount.',
    languageLine,
    'CTA in the caption: Link in bio.',
    '[/IMAGE_PROMPT]',
  ].join('\n');
}

const DISCOUNT_PATTERN =
  /(\d{1,3})\s*%\s*(?:off|indirim)|%\s*(\d{1,3})\s*(?:off|indirim)|yüzde\s*(\d{1,3})\s*indirim/gi;

/**
 * A percent-off claim that does not appear in product truth.
 * Returns the phrase to fail, or null when every discount is supported (or there is none).
 */
export function unsupportedDiscountPhrase(
  content: string,
  productTruthMd: string,
): string | null {
  const flags = content.match(DISCOUNT_PATTERN);
  if (!flags) return null;
  for (const phrase of flags) {
    const number = phrase.match(/\d{1,3}/)?.[0];
    if (!number) continue;
    const supported =
      productTruthMd.includes(`${number}%`) ||
      productTruthMd.includes(`%${number}`) ||
      new RegExp(`yüzde\\s*${number}\\b`, 'i').test(productTruthMd);
    if (!supported) return phrase.trim();
  }
  return null;
}
