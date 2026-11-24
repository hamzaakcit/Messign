/**
 * Offer sheet written into `user_brief` from the studio form.
 * Labels match the server parser. Empty facts are omitted.
 */

export interface StudioSheetInput {
  intent: string;
  product: string;
  truthId: string;
  place: string;
  price: string;
  claim: string;
  materials: string;
  inFrame: string;
  keepOut: string;
  /** Image look id. Empty means photoreal. */
  style: string;
  language: '' | 'tr' | 'en';
}

export interface StudioSheetView {
  product: string;
  place: string;
  price: string;
  claim: string;
  /** Scene sentence sent to Fal when the sheet names a product or a place. */
  scene: string;
  style: string;
}

/**
 * Id shared with the server fixture row for this content tenant.
 */
export function fixtureTruthId(orgKey: string, name: string): string {
  return `${orgKey}:${name.trim()}`;
}

/**
 * Read `price:` and `place:` labels out of a truth description.
 * The other lines are the physical materials. A description with no price label returns an empty price.
 */
export function priceAndPlace(description: string | null | undefined): { price: string; place: string; materials: string } {
  let price = '';
  let place = '';
  const prose: string[] = [];
  for (const rawLine of (description ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) {
      prose.push(line);
      continue;
    }
    const key = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (key === 'price') price = value;
    else if (key === 'place') place = value;
    else prose.push(line);
  }
  return { price, place, materials: prose.join(' ').trim() };
}

/**
 * Looks the still can open with. The id matches the server style preset.
 */
export const STILL_LOOKS: ReadonlyArray<{ id: string; label: string; opener: string; line: string }> = [
  { id: 'photoreal', label: 'Photoreal', opener: 'Photorealistic photograph', line: 'Photorealistic photograph, sharp subject, no text, watermarks, or logos.' },
  { id: 'modern_noir', label: 'Modern noir', opener: 'Modern noir photograph', line: 'Modern noir photograph: deep charcoal tones, subtle purple accents, soft studio glow.' },
  { id: 'vibrant_lifestyle', label: 'Vibrant lifestyle', opener: 'Vibrant lifestyle photograph', line: 'Vibrant lifestyle photograph: warm golden-hour light, saturated natural colors.' },
  { id: 'minimal_flat', label: 'Minimal flat-lay', opener: 'Minimal flat-lay photograph', line: 'Minimal flat-lay photograph: top-down, clean surface, soft even light.' },
  { id: 'editorial', label: 'Editorial', opener: 'Editorial photograph', line: 'Editorial photograph: dramatic directional light, fashion-magazine composition.' },
  { id: 'product_spotlight', label: 'Product spotlight', opener: 'Product spotlight photograph', line: 'Product spotlight photograph: clean background, hero light, sharp product detail.' },
  { id: 'team_culture', label: 'Team culture', opener: 'Team culture photograph', line: 'Team culture photograph: natural workplace light, candid people, shallow depth of field.' },
  { id: 'data_viz', label: 'Data visualization', opener: 'Data visualization image', line: 'Data visualization image: abstract geometric forms, glowing accent lines, dark ground.' },
  { id: 'seasonal', label: 'Seasonal', opener: 'Seasonal photograph', line: 'Seasonal photograph: the season is visible in the light, the color, and the props.' },
  { id: 'ugc_style', label: 'Phone camera', opener: 'Phone-camera photograph', line: 'Phone-camera photograph: natural light, mild grain, slightly imperfect framing.' },
];

/**
 * A known look id. Anything else is photoreal.
 */
export function resolveStillLook(value: string | null | undefined): string {
  const key = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STILL_LOOKS.some((look) => look.id === key) ? key : 'photoreal';
}

/**
 * Scene sentence. Materials lead. The product name is the title.
 * The look opens the sentence. A shot line that carries a price or a claim is left out.
 */
export function offerSceneSentence(input: {
  product: string;
  place: string;
  materials: string;
  inFrame?: string;
  keepOut?: string;
  look?: string | null;
}): string {
  const product = input.product.trim();
  const place = input.place.trim();
  const lead = leadMaterials(input.materials);
  const subject = lead && product ? `${lead}, titled ${product}` : lead || product;
  const located = place && subject
    ? lead && product
      ? `${subject}, at ${place}`
      : `${subject} at ${place}`
    : subject || place;
  if (!located) return '';
  const inFrame = scrubShotLine(input.inFrame);
  const keepOut = scrubShotLine(input.keepOut);
  const look = STILL_LOOKS.find((item) => item.id === resolveStillLook(input.look)) ?? STILL_LOOKS[0];
  const parts = [`${look.opener} of ${located}.`];
  if (inFrame) parts.push(`In frame: ${inFrame}.`);
  if (keepOut) parts.push(`Keep out: ${keepOut}.`);
  parts.push('No letters, numbers, or logos.');
  return parts.join(' ');
}

const PHOTOREAL_BLOCK = [
  'Photorealistic photograph, sharp subject, no text, watermarks, or logos.',
  'Single coherent photograph (not a composite): unified lighting across all subjects and props.',
  'All objects must be 3D and physically real — no flat 2D shapes, vector icons, or pasted-on composites.',
  'Natural daylight or scene-appropriate ambient light with realistic shadows and depth of field.',
].join(' ');

/**
 * The prompt Fal receives for this still: the scene, the shop line, the look, and the frame.
 * Feed is square. Story and reel covers are vertical.
 */
export function falStillPrompt(input: {
  product: string;
  place: string;
  materials: string;
  inFrame?: string;
  keepOut?: string;
  look?: string | null;
  format?: 'feed' | 'story' | 'reel' | null;
}): string {
  const scene = offerSceneSentence(input);
  if (!scene) return '';
  const vertical = shopVertical([input.product, input.place, input.materials].filter(Boolean).join('\n'));
  const shop = vertical === 'bookstore'
    ? 'Show the named book in the named shop. Do not replace it with a flower still-life.'
    : vertical === 'florist'
      ? 'Show the named flowers in the named shop. Do not replace them with a bookstore aisle.'
      : null;
  const look = STILL_LOOKS.find((item) => item.id === resolveStillLook(input.look)) ?? STILL_LOOKS[0];
  const realism = look.id === 'photoreal'
    ? PHOTOREAL_BLOCK
    : `${look.line} Single coherent image. No text, watermarks, or logos.`;
  const frame = input.format === 'story' || input.format === 'reel'
    ? 'Vertical 9:16 frame, full-bleed portrait composition.'
    : 'Square 1:1 frame.';
  return [scene, shop, realism, frame].filter((part): part is string => Boolean(part)).join('\n\n');
}

/**
 * Bookstore or florist, using the same words the server uses.
 * A tie, or neither, adds no shop line.
 */
function shopVertical(text: string): 'bookstore' | 'florist' | null {
  const books = countWords(text, /\b(books|book|bookstore|bookshop|novel)\b/gi)
    + countTokens(text, ['kitapçı', 'kitapci', 'kitap', 'sahaf', 'yayınevi', 'yayinevi']);
  const flowers = countWords(text, /\b(flowers|flower|florist|bouquet|bloom)\b/gi)
    + countTokens(text, ['çiçekçi', 'cicekci', 'çiçek', 'cicek', 'buket']);
  if (books === 0 && flowers === 0) return null;
  if (books === flowers) return null;
  return books > flowers ? 'bookstore' : 'florist';
}

function countWords(text: string, pattern: RegExp): number {
  return text.match(new RegExp(pattern.source, 'gi'))?.length ?? 0;
}

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
      remaining = `${remaining.slice(0, at)} ${remaining.slice(at + needle.length)}`;
      from = at + 1;
    }
  }
  return total;
}

function leadMaterials(materials: string): string {
  const cleaned = scrubShotLine(materials);
  if (!cleaned) return '';
  const second = cleaned.charAt(1);
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) return cleaned;
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function scrubShotLine(value: string | null | undefined): string {
  const cleaned = (value ?? '').trim().replace(/\.+$/, '').trim();
  if (!cleaned || /₺|price\s*:|claim\s*:/i.test(cleaned)) return '';
  return cleaned;
}

/**
 * Brief stored on the offer and the Instagram child.
 * The intent line stays first. A sheet with no facts is just that sentence.
 */
export function serializeStudioBrief(input: StudioSheetInput): string {
  const lines: string[] = [];
  const intent = input.intent.trim();
  if (intent) lines.push(intent);
  const facts: Array<[string, string]> = [
    ['product', input.product.trim()],
    ['truth_id', input.truthId.trim()],
    ['materials', input.materials.trim()],
    ['place', input.place.trim()],
    ['in_frame', input.inFrame.trim()],
    ['keep_out', input.keepOut.trim()],
    ['style', STILL_LOOKS.some((look) => look.id === input.style.trim()) ? input.style.trim() : ''],
    ['price', input.price.trim()],
    ['claim', input.claim.trim()],
  ];
  if (input.language === 'tr' || input.language === 'en') {
    facts.push(['language', input.language]);
  }
  const factLines = facts.filter(([, value]) => value.length > 0).map(([key, value]) => `${key}: ${value}`);
  if (intent && factLines.length > 0) lines.push('');
  lines.push(...factLines);
  return lines.join('\n').trim();
}

/**
 * Sheet fields and the Fal scene for the detail panel.
 * A brief with no product and no place has an empty scene.
 */
export function readStudioSheet(brief: string | null | undefined): StudioSheetView {
  let product = '';
  let place = '';
  let price = '';
  let claim = '';
  let materials = '';
  let inFrame = '';
  let keepOut = '';
  let style = '';
  for (const rawLine of (brief ?? '').split('\n')) {
    const line = rawLine.trim();
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase().replace(/\s+/g, '_');
    const value = line.slice(splitAt + 1).trim();
    if (key === 'product') product = value;
    else if (key === 'place') place = value;
    else if (key === 'price') price = value;
    else if (key === 'claim') claim = value;
    else if (key === 'materials') materials = value;
    else if (key === 'in_frame') inFrame = value;
    else if (key === 'keep_out') keepOut = value;
    else if (key === 'style') style = value;
  }
  const scene = offerSceneSentence({ product, place, materials, inFrame, keepOut, look: style });
  return { product, place, price, claim, scene, style: resolveStillLook(style) };
}
