// ---------------------------------------------------------------------------
// Image generation context & prompt construction
// ---------------------------------------------------------------------------

import type { ImageGenerationInput, StylePreset } from '../../../../dal/marketing/instagramTypes.js';
import { emailImagePromptExplicitlyRequestsPeople } from './emailImagePromptSubject.js';
import { parseOfferSheet } from '../../offerSheet.js';
import { inferEcommerceVertical } from '../../../../modules/marketing/prompts/ecommercePromptPack.js';
import { isMessignBrandStill } from './messignBrandMark.js';

export interface ImageGenContext {
  channel: 'email' | 'instagram' | 'general';
  sectionType?:
    | 'hero'
    | 'product'
    | 'lifestyle'
    | 'feature'
    | 'standalone'
    /** Email body column beside copy — slightly tighter crop than hero. */
    | 'image_text'
    /** Small product tiles in a grid — square-ish, catalog style. */
    | 'product_grid';
  themeHint?: string;
  /**
   * When true, steer away from human faces and generic portraits unless the raw prompt
   * explicitly names people (see {@link emailImagePromptExplicitlyRequestsPeople}).
   */
  preferNonHumanSubjects?: boolean;
  /**
   * When true, align prompt hints with technical / platform imagery (same meaning as
   * {@link ImageGenerationInput.technical_platform_topic} on the generation request).
   */
  technicalPlatformTopic?: boolean;
  /** When set, the composition line matches this frame instead of the square default. */
  aspectRatio?: ImageGenerationInput['aspect_ratio'];
}

const NEGATIVE_PROMPT_BLOCK = [
  '',
  'AVOID in all generated images:',
  '- Deformed, extra, or missing fingers, limbs, or anatomical parts',
  '- Readable text, letters, numbers, or watermarks embedded in the image',
  '- Uncanny valley faces (lifeless eyes, waxy skin, asymmetric features)',
  '- Stock photo watermark artifacts, ID badges, or clip-art elements',
  '- Multiple competing focal points — keep one clear subject',
  '- Blurry or out-of-focus primary subjects',
  '- Overly saturated neon colors that look artificial',
  '- Flat, 2D, cartoon, or vector-style handheld objects (props must be 3D and photorealistic)',
  '- Handheld props with mismatched lighting or pasted-on appearance',
  '- Plastic-looking, CGI, or glossy renders of paper or fabric objects',
].join('\n');

export function buildChannelCompositionHint(ctx?: ImageGenContext): string {
  if (!ctx) return 'Style: clean, professional, brand-safe — suitable for marketing.';
  const parts: string[] = [];

  if (ctx.channel === 'email') {
    parts.push('Composition: horizontal/landscape orientation optimized for email hero banners (approx 600px wide, 300-400px tall).');
    parts.push('Leave text-safe negative space in the center third for headline overlay with dark scrim.');
  } else if (ctx.channel === 'instagram') {
    parts.push('Composition: square 1:1 aspect ratio optimized for Instagram feed grid.');
    parts.push('Strong visual hook that stops scrolling — bold contrast, unexpected angles, or vivid color pops.');
  } else {
    parts.push('Style: clean, professional, brand-safe — suitable for marketing.');
  }

  if (ctx.sectionType === 'hero') {
    if (ctx.preferNonHumanSubjects) {
      parts.push(
        'This is a HERO image: wide environmental, product, architectural, or abstract scene — premium quality. Avoid a human face or portrait as the dominant subject unless the brief explicitly asks for people.',
      );
    } else {
      parts.push('This is a HERO image: cinematic wide shot, dramatic lighting, premium quality. Think movie poster.');
    }
  } else if (ctx.sectionType === 'image_text') {
    parts.push(
      'This is an IMAGE+TEXT column image: medium crop (not full-bleed hero), balanced for ~280px column beside copy — clear focal subject, readable at email width.',
    );
  } else if (ctx.sectionType === 'product_grid') {
    parts.push(
      'This is a PRODUCT GRID thumbnail: square or near-square crop, catalog clarity, neutral background, single product focal point.',
    );
  } else if (ctx.sectionType === 'product') {
    parts.push('This is a PRODUCT image: clean background, product centered, sharp detail, e-commerce quality.');
  } else if (ctx.sectionType === 'feature') {
    parts.push(
      'This is a VALUE PROP / FEATURE tile image: iconographic or small illustration — one clear idea per tile, readable at email column width.',
    );
  } else if (ctx.sectionType === 'lifestyle') {
    parts.push('This is a LIFESTYLE image: authentic, natural setting, warm lighting, relatable and aspirational.');
  }

  if (ctx.themeHint) {
    parts.push(`Theme palette hint: "${ctx.themeHint}" — match the overall mood and color temperature of this theme.`);
  }

  return parts.join('\n');
}

export interface MarketingImageSystemOptions {
  /** When set, system instructions favor literal photography over illustration or stylized art. */
  style_preset?: ImageGenerationInput['style_preset'];
}

/**
 * Shared system rules for LiteLLM and Gemini direct image generation.
 * Context-aware when `context` is set. When `options.style_preset` is `photoreal`, appends PHOTOREAL MODE constraints.
 * @param resolution - Target pixel context for the model
 * @param context - Optional email/instagram composition hints
 * @param options - Optional style preset for backend-specific add-ons
 */
export function buildMarketingImageSystemText(
  resolution: string,
  context?: ImageGenContext,
  options?: MarketingImageSystemOptions,
): string {
  const photorealAddon =
    options?.style_preset === 'photoreal'
      ? [
          '',
          'PHOTOREAL MODE:',
          '- The image must look like a real photograph (camera capture), not an illustration, poster, 3D render, or comic.',
          '- Natural lighting, believable shadows and materials, plausible color balance.',
          '- Avoid noir silhouettes, heavy cinematic grading, neon accents, or purple/teal mood unless the user explicitly asked for that look.',
        ].join('\n')
      : '';

  return [
    'You are a professional marketing visual designer and art director.',
    'Generate EXACTLY ONE high-quality image that matches the user creative brief.',
    '',
    'OUTPUT RULES — follow strictly:',
    '- Your response must be the generated image only (image modality / inline image data in response parts).',
    '- Do NOT output JSON, tool calls, function schemas, or proxy actions (e.g. dalle, text2im, or action/action_input blocks).',
    '- Do NOT describe a plan, delegate to another API in prose, or paste base64 as plain text.',
    '',
    `Target resolution context: ${resolution}.`,
    buildChannelCompositionHint(context),
    'No watermarks or text overlays unless the user explicitly asked for text on the image.',
    NEGATIVE_PROMPT_BLOCK,
    photorealAddon,
  ].join('\n');
}

const DIRECT_INSTAGRAM_SCENE_MAX_CHARS = 1200;

/**
 * Strip strategist labels (`Planner:`, `User's request:`, …) but keep the rest of the line.
 */
function stripInstagramDraftLinePrefixes(line: string): string {
  let t = line.trim();
  if (!t) return '';
  const stripOnce = (s: string): string => {
    let u = s;
    u = u.replace(/^Planner:\s*/i, '').trim();
    u = u.replace(/^Strategy plan\s*:?\s*/i, '').trim();
    u = u.replace(/^User'?s request\s*:?\s*/i, '').trim();
    u = u.replace(/^Scene\s*\/\s*composition\s*:?\s*/i, '').trim();
    return u;
  };
  t = stripOnce(t);
  return t;
}

function instagramFrameLine(aspectRatio?: ImageGenerationInput['aspect_ratio']): string | null {
  if (aspectRatio === '9:16') return 'Vertical 9:16 frame, full-bleed portrait composition.';
  if (aspectRatio === '4:5') return 'Portrait 4:5 frame.';
  if (aspectRatio === '16:9') return 'Landscape 16:9 frame.';
  if (aspectRatio === '1:1') return 'Square 1:1 frame.';
  return null;
}

/**
 * Photoreal Instagram prompt. A labeled sheet becomes a scene of the product,
 * its materials, and the place. The raw brief is not the scene, so price, claim,
 * audience, and dates never reach Fal. A brief with no product or place uses the
 * cleaned image prompt.
 * When `aspectRatio` is set, a single framing line matches that size.
 */
export function buildDirectInstagramFalPrompt(params: {
  userBrief?: string | null;
  imagePrompt: string;
  aspectRatio?: ImageGenerationInput['aspect_ratio'];
  /** Look used when the sheet has no style. A style on the offer wins. */
  look?: string | null;
  /** The shop attached a logo file. It is placed on the photo after generation. */
  brandLogoAttached?: boolean;
  /** Prose from the truth row. Price and place labels must already be removed. */
  materials?: string | null;
}): string {
  const parsed = parseOfferSheet(params.userBrief);
  const sheet = parsed.sheet;
  const useSheet = Boolean(sheet.product.trim() || sheet.place.trim());
  const materials = cleanOfferMaterials(sheet.materials) || cleanOfferMaterials(params.materials);

  const look = resolveStillLook(sheet.style || params.look);
  const vertical = useSheet
    ? inferEcommerceVertical([sheet.product, sheet.place, materials].filter(Boolean).join('\n'))
    : null;
  const messignBrand =
    isMessignBrandStill({
      product: sheet.product,
      brief: params.userBrief,
      shopStill: vertical === 'bookstore' || vertical === 'florist',
    });
  let scene = useSheet
    ? offerStillSceneSentence({
        product: messignBrand ? '' : sheet.product,
        place: sheet.place,
        materials: messignBrand ? '' : materials,
        inFrame: messignBrand ? stripBrandCopy(sheet.inFrame) : sheet.inFrame,
        keepOut: messignBrand ? stripBrandCopy(sheet.keepOut) : sheet.keepOut,
        look,
      })
    : sceneFromImagePrompt(params.imagePrompt, params.userBrief);
  if (messignBrand && !useSheet) scene = stripBrandCopy(scene);
  if (messignBrand && !scene.trim()) {
    scene = `${stillLook(look).opener} of a physical space with blank wall panels and blank screens. No letters, numbers, or logos.`;
  }
  const shopLine =
    vertical === 'bookstore'
      ? 'Show the named book in the named shop. Do not replace it with a flower still-life.'
      : vertical === 'florist'
        ? 'Show the named flowers in the named shop. Do not replace them with a bookstore aisle.'
        : null;

  const realismLines = stillRealismLines(look);
  const blankSignage = blankSignageLine();
  const brandMark = brandMarkLine({
    product: sheet.product,
    brief: params.userBrief,
    shopStill: vertical === 'bookstore' || vertical === 'florist',
    logoAttached: params.brandLogoAttached === true,
  });

  const frame = instagramFrameLine(params.aspectRatio);
  return [scene, shopLine, realismLines, blankSignage, brandMark, frame].filter(Boolean).join('\n\n').trim();
}

/**
 * Messign is the brand on its own stills. An attached logo file is placed afterwards, so the model must not paint a name.
 */
function brandMarkLine(input: {
  product: string;
  brief?: string | null;
  shopStill: boolean;
  logoAttached: boolean;
}): string | null {
  const messign = isMessignBrandStill({
    product: input.product,
    brief: input.brief,
    shopStill: input.shopStill,
  });
  if (!messign && !input.logoAttached) return null;
  const parts: string[] = [];
  if (messign) {
    parts.push('Signs, screens, and wall faces stay a solid color or a photograph. No wordmark, no tagline, and no subtitle.');
  }
  if (input.logoAttached) {
    parts.push('The attached logo is placed on the photo afterwards. Draw no logo and no writing.');
  }
  return parts.join(' ');
}

/**
 * Walls and screens must not become slide decks. The model paints stacked lines of type when a booth has monitors.
 */
function blankSignageLine(): string {
  return 'Screens, signs, banners, badges, and wall panels stay blank. A screen or wall graphic shows only a photograph, a solid color, or an empty surface. No slide layouts, no stacked lines of type, no columns of bullets, no paragraphs, no tagline, and no subtitle. Do not paint letters, words, numbers, or a wordmark. Names in this brief are context, not writing.';
}

/** Drop brand and product names so a still does not paint them as signage. */
function stripBrandCopy(value: string | null | undefined): string {
  let out = (value ?? '').trim();
  if (!out) return '';
  const phrases = ['engagement platform', 'Knowledge Hub', 'Work Management', 'Messign', 'Lucy', 'Dora', 'Gamification'];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return out.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
}

/**
 * Drop price and claim lines so they cannot be painted into the still.
 */
function cleanOfferMaterials(materials: string | null | undefined): string {
  return (materials ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/₺|price\s*:|claim\s*:/i.test(line))
    .join(' ')
    .trim();
}

/**
 * Every look the still can open with. The id is the Fal style preset.
 */
export const STILL_LOOKS: ReadonlyArray<{ id: StylePreset; label: string; opener: string; line: string }> = [
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
export function resolveStillLook(value: string | null | undefined): StylePreset {
  const key = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const found = STILL_LOOKS.find((look) => look.id === key);
  return found?.id ?? 'photoreal';
}

function stillLook(id: StylePreset): { id: StylePreset; label: string; opener: string; line: string } {
  return STILL_LOOKS.find((look) => look.id === id) ?? STILL_LOOKS[0];
}

/**
 * Extra lines after the scene. Photoreal keeps the camera block. Other looks use their own line.
 */
function stillRealismLines(look: StylePreset): string {
  if (look === 'photoreal') {
    return [
      'Photorealistic photograph, sharp subject, no text, watermarks, or logos.',
      'Single coherent photograph (not a composite): unified lighting across all subjects and props.',
      'All objects must be 3D and physically real — no flat 2D shapes, vector icons, or pasted-on composites.',
      'Natural daylight or scene-appropriate ambient light with realistic shadows and depth of field.',
    ].join(' ');
  }
  return [stillLook(look).line, 'Single coherent image. No text, watermarks, or logos.'].join(' ');
}

/**
 * Scene sentence sent to Fal. Materials lead, and the product name is only the title.
 * The look opens the sentence. Shot lines that carry a price or a claim are omitted.
 */
export function offerStillSceneSentence(input: {
  product: string;
  place: string;
  materials: string;
  inFrame?: string;
  keepOut?: string;
  look?: string | null;
}): string {
  const product = input.product.trim();
  const place = input.place.trim();
  const lead = leadMaterials(cleanOfferMaterials(input.materials));
  const subject = lead && product ? `${lead}, titled ${product}` : lead || product;
  const located = place && subject
    ? lead && product
      ? `${subject}, at ${place}`
      : `${subject} at ${place}`
    : subject || place;
  if (!located) return '';
  const inFrame = scrubShotLine(input.inFrame);
  const keepOut = scrubShotLine(input.keepOut);
  const opener = stillLook(resolveStillLook(input.look)).opener;
  const parts = [`${opener} of ${located}.`];
  if (inFrame) parts.push(`In frame: ${inFrame}.`);
  if (keepOut) parts.push(`Keep out: ${keepOut}.`);
  parts.push('No letters, numbers, or logos.');
  return parts.join(' ').slice(0, DIRECT_INSTAGRAM_SCENE_MAX_CHARS);
}

/**
 * First letter down so the materials clause can open the sentence.
 */
function leadMaterials(materials: string): string {
  const cleaned = materials.trim().replace(/\.+$/, '').trim();
  if (!cleaned) return '';
  const second = cleaned.charAt(1);
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) return cleaned;
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

/**
 * Drop a shot line that would paint a price or a claim into the still.
 */
function scrubShotLine(value: string | null | undefined): string {
  const cleaned = (value ?? '').trim().replace(/\.+$/, '').trim();
  if (!cleaned || /₺|price\s*:|claim\s*:/i.test(cleaned)) return '';
  return cleaned;
}

function sceneFromImagePrompt(imagePrompt: string, userBrief?: string | null): string {
  const raw = (imagePrompt ?? '').trim();
  let scene = stripBoilerplateImagePrompt(raw).slice(0, DIRECT_INSTAGRAM_SCENE_MAX_CHARS);
  if (!scene) scene = raw.slice(0, DIRECT_INSTAGRAM_SCENE_MAX_CHARS);
  if (!scene) scene = (userBrief?.trim() ?? '').slice(0, DIRECT_INSTAGRAM_SCENE_MAX_CHARS);
  return scene;
}

function stripBoilerplateImagePrompt(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const cleaned = stripInstagramDraftLinePrefixes(line);
    if (cleaned.length > 0) kept.push(cleaned);
  }
  return kept.join('\n').trim();
}

/**
 * Enhances a raw prompt with style direction, technical requirements, and
 * channel/section composition hints.
 */
export function enhanceImagePrompt(
  rawPrompt: string,
  stylePreset: ImageGenerationInput['style_preset'] = 'modern_noir',
  context?: ImageGenContext,
): string {
  const styleMap: Record<NonNullable<ImageGenerationInput['style_preset']>, string> = {
    photoreal:
      'Photorealistic documentary photography: natural daylight or believable ambient light, accurate colors and white balance, ' +
      'realistic textures and depth of field as from a full-frame camera or high-end smartphone, ' +
      'no illustration or 3D-render look, no posterized or heavily graded "cinematic" treatment unless the scene naturally calls for it.',
    modern_noir:
      'Modern Noir aesthetic: deep charcoal and midnight tones, subtle purple accent highlights, ' +
      'soft studio glow lighting, professional SaaS visual style, clean negative space, ' +
      'shot on high-end DSLR with shallow depth of field.',
    vibrant_lifestyle:
      'Vibrant lifestyle photography style: warm golden-hour lighting, saturated but natural colors, ' +
      'authentic candid energy, slight lens flare, modern urban or nature backdrop, ' +
      'aspirational yet relatable mood.',
    minimal_flat:
      'Minimalist flat-lay composition: top-down view on a clean surface, ' +
      'carefully arranged objects with geometric precision, soft diffused even lighting, ' +
      'pastel or monochrome palette, editorial magazine quality.',
    editorial:
      'High-end editorial photography: dramatic directional lighting, ' +
      'cinematic color grading with deep shadows and lifted highlights, ' +
      'fashion-magazine composition, storytelling through visual tension.',
    product_spotlight:
      'Product spotlight photography: clean white or gradient background, ' +
      'hero lighting with soft key and fill, product centered with slight shadow, ' +
      'macro-lens detail, high-contrast sharpness, e-commerce premium quality.',
    team_culture:
      'Authentic team culture photography: natural office or co-working environment, ' +
      'warm ambient lighting with window light, diverse candid interactions, ' +
      'depth-of-field bokeh on background, genuine and unposed feel, employer branding quality.',
    data_viz:
      'Data visualization art style: clean abstract geometric shapes representing data flows, ' +
      'glowing neon accent lines on dark background, isometric or 3D perspective, ' +
      'tech-forward dashboard aesthetic, electric blue and purple gradients.',
    seasonal:
      'Seasonal campaign photography: rich environmental context matching the current season, ' +
      'warm cozy tones (autumn/winter) or bright airy palette (spring/summer), ' +
      'lifestyle-in-context composition, relatable seasonal props, natural soft lighting.',
    ugc_style:
      'User-generated content style: authentic phone-camera aesthetic, slightly imperfect framing, ' +
      'natural lighting with mild grain, lifestyle-in-action feel, approachable and real, ' +
      'no heavy post-processing, first-person perspective preferred.',
  };

  let styleDirective = styleMap[stylePreset] ?? styleMap.modern_noir;
  if (context?.channel === 'email' && stylePreset === 'photoreal') {
    styleDirective +=
      ' Email marketing: keep the primary subject sharp and identifiable (not a frame-filling abstract blur with no clear topic); ' +
      'use moderate depth of field (clarity similar to f/5.6–f/11 on a banner subject) so the hero stays readable at email width.';
  }

  const trimmed = rawPrompt.trim();

  const emailTopicFidelityBlock =
    context?.channel === 'email'
      ? [
          '',
          'EMAIL TOPIC FIDELITY (mandatory):',
          '- Match the campaign described in PRIMARY SUBJECT (and CAMPAIGN CONTEXT above when present) — same industry, channel, or product category.',
          '- Do not replace the brief with unrelated stock: cartoon narratives, children, random portraits, or off-topic lifestyle when the email is about a specific business topic.',
          '- No fake article layouts, posters with gibberish text, or illegible typography — use blank screens, soft UI bokeh, or wordless iconography.',
        ].join('\n')
      : '';

  const instagramTopicFidelityBlock =
    context?.channel === 'instagram'
      ? [
          '',
          'INSTAGRAM TOPIC FIDELITY (mandatory):',
          '- Depict PRIMARY SUBJECT literally: same products, brands, setting, weather, and type of people (or no people) as described — do not swap in a generic office, conference room, coworking table, or “team meeting” unless the brief is explicitly about that.',
          '- When the brief includes people, teams, portraits, or lifestyle with humans: show real individuals in the scene with visible faces where appropriate — not anonymous silhouettes or everyone facing away unless the brief asks for anonymity.',
          '- Fashion / retail / ecommerce: show the garments, bags, storefront, or street scene requested — not unrelated headshots or B2B meeting stock.',
          '- Match aspect ratio and framing if specified in the brief (e.g. 16:9 vs 1:1); default is square only when the brief does not specify otherwise.',
          `- ${blankSignageLine()}`,
        ].join('\n')
      : '';

  /** Feed thumbnails must read at small sizes — avoid “black square” renders from crushed blacks / empty exposure. */
  const instagramExposureBlock =
    context?.channel === 'instagram'
      ? [
          '',
          'EXPOSURE / READABILITY (mandatory — Instagram feed):',
          '- Clear visible subject and normal midtones: not a flat black frame, silhouette-only on pure black, or an underexposed void with no readable content.',
          '- Natural daylight or balanced ambient fill unless STYLE DIRECTION explicitly calls for a named low-key look — then still retain shadow detail (no RGB-crushed all-black fields).',
        ].join('\n')
      : '';

  const instagramPeopleForwardBlock =
    context?.channel === 'instagram' && emailImagePromptExplicitlyRequestsPeople(trimmed)
      ? [
          '',
          'PEOPLE / PORTRAIT (brief calls for humans):',
          '- Real camera photography: natural skin texture and lighting; believable eyes and hands; avoid plastic “AI” skin, wax faces, or mangled fingers.',
        ].join('\n')
      : '';

  const emailZeroTextBlock =
    context?.channel === 'email'
      ? [
          '',
          'ZERO TEXT (mandatory — email image):',
          '- No letters, numerals, glyphs, captions, subtitles, signage, billboards, neon signs, LED tickers, handwriting, or marketing slogans in the image.',
          '- No fake app UI, website screenshots, chat bubbles, error toasts, notification banners, or dashboard labels with readable words.',
          '- No watermarks, logos, or embedded text of any kind.',
        ].join('\n')
      : '';

  const emailHeroSharpnessBlock =
    context?.channel === 'email' && context?.sectionType === 'hero'
      ? [
          '',
          'EMAIL HERO CLARITY (mandatory):',
          '- Include a recognizable primary subject, environment, or product — not a vague abstract blur.',
          '- Moderate depth of field: keep the main subject and enough midground detail tack-sharp; avoid a frame that is entirely soft bokeh or out-of-focus with no identifiable subject.',
          '- Do not output only a gradient wash, color mush, or abstract blur-only hero.',
        ].join('\n')
      : '';

  const technicalPlatformBlock =
    context?.channel === 'email' && context?.technicalPlatformTopic === true
      ? [
          '',
          'TECHNICAL PLATFORM IMAGERY (when relevant):',
          '- Prefer hardware, infrastructure, cables, server racks, datacenter ambience, or abstract light trails — no readable text on screens.',
          '- Use blank screens, blurred UI glow, or wordless iconography when devices appear.',
        ].join('\n')
      : '';

  const preferNonHuman =
    context?.preferNonHumanSubjects === true ||
    (context?.channel === 'email' &&
      context?.preferNonHumanSubjects !== false &&
      !emailImagePromptExplicitlyRequestsPeople(trimmed));

  const compositionHint =
    context?.channel === 'email'
      ? '- Horizontal/landscape composition optimized for email banners (600px wide).'
      : context?.aspectRatio === '9:16'
        ? '- Vertical 9:16 portrait composition.'
        : context?.aspectRatio === '4:5'
          ? '- Portrait 4:5 composition.'
          : context?.aspectRatio === '16:9'
            ? '- Landscape 16:9 composition.'
            : '- Square 1:1 aspect ratio composition.';

  const sectionHint =
    context?.sectionType === 'hero'
      ? preferNonHuman
        ? '- Wide environmental or product-forward composition; no dominant human face unless the PRIMARY SUBJECT requires people; text-safe negative space in center third.'
        : '- Cinematic wide shot, dramatic lighting, text-safe negative space in center third.'
      : context?.sectionType === 'image_text'
        ? preferNonHuman
          ? '- Medium crop for a side column; one clear subject that matches the campaign — sharp focus, not mushy abstract blur; not an unrelated cartoon or stock scene.'
          : '- Medium crop for a side column beside body copy; one clear subject; not a full-bleed banner.'
        : context?.sectionType === 'product_grid'
          ? '- Square-ish product thumbnail, neutral backdrop, sharp product detail.'
          : context?.sectionType === 'feature'
            ? preferNonHuman
              ? '- value_prop tile: abstract icon or diagram scale; geometric or symbolic only — no cartoon narrative, no random characters.'
              : '- value_prop tile: icon or small illustration scale; single focal point per image.'
            : '';

  const nonHumanExtraLines: string[] = [];
  if (preferNonHuman && context?.sectionType === 'hero') {
    nonHumanExtraLines.push(
      '- Hero: include a clear, sharp focal subject or setting tied to the campaign — avoid a vague blurry gradient with no recognizable topic.',
    );
  }
  if (preferNonHuman && context?.sectionType === 'feature') {
    nonHumanExtraLines.push(
      '- No cartoon characters, children, family scenes, or mascots unless the campaign explicitly asks for them.',
      '- Value-prop art must stay on-topic with CAMPAIGN CONTEXT (subject/preheader) — abstract icons, diagrams, or simple objects only.',
    );
  }
  if (preferNonHuman && context?.sectionType === 'image_text') {
    nonHumanExtraLines.push(
      '- The scene must illustrate this campaign’s topic from CAMPAIGN CONTEXT — not a random unrelated illustration.',
    );
  }

  const nonHumanBlock = preferNonHuman
    ? [
        '',
        'SUBJECT CONSTRAINT (mandatory unless PRIMARY SUBJECT above already names specific people):',
        '- Do not make a human face or portrait the main focal point.',
        '- Prefer product, environment, architecture, food, nature, workspace still life without people, or abstract UI/light — not a generic smiling business person.',
        '- Do not replace the brief with unrelated stock office team photography.',
        ...nonHumanExtraLines,
      ].join('\n')
    : '';

  return [
    'PRIMARY SUBJECT — literal depiction (match this scene; do not replace with an unrelated generic stock concept):',
    trimmed,
    emailTopicFidelityBlock,
    instagramTopicFidelityBlock,
    instagramExposureBlock,
    instagramPeopleForwardBlock,
    emailZeroTextBlock,
    emailHeroSharpnessBlock,
    technicalPlatformBlock,
    nonHumanBlock,
    '',
    '---',
    'STYLE DIRECTION (mood/lighting only — keep the subject matter from above):',
    styleDirective,
    '',
    'TECHNICAL REQUIREMENTS:',
    '- Professional marketing quality.',
    '- No visible watermarks, logos, or stock-photo artifacts.',
    '- Brand-safe: no controversial, violent, or NSFW elements.',
    compositionHint,
    '- Sharp focus on the primary subject.',
    '- No deformed anatomy, no readable text in the image.',
    sectionHint,
  ]
    .filter(Boolean)
    .join('\n');
}
