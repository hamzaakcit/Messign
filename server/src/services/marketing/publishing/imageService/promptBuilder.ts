// ---------------------------------------------------------------------------
// Image generation context & prompt construction
// ---------------------------------------------------------------------------

import type { ImageGenerationInput } from '../../../../dal/marketing/instagramTypes.js';

export interface ImageGenContext {
  channel: 'email' | 'instagram' | 'general';
  sectionType?: 'hero' | 'product' | 'lifestyle' | 'feature' | 'standalone';
  themeHint?: string;
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
    parts.push('This is a HERO image: cinematic wide shot, dramatic lighting, premium quality. Think movie poster.');
  } else if (ctx.sectionType === 'product') {
    parts.push('This is a PRODUCT image: clean background, product centered, sharp detail, e-commerce quality.');
  } else if (ctx.sectionType === 'lifestyle') {
    parts.push('This is a LIFESTYLE image: authentic, natural setting, warm lighting, relatable and aspirational.');
  } else if (ctx.sectionType === 'feature') {
    parts.push('This is a FEATURE illustration: clean, iconographic, conceptual — focus on one idea.');
  }

  if (ctx.themeHint) {
    parts.push(`Theme palette hint: "${ctx.themeHint}" — match the overall mood and color temperature of this theme.`);
  }

  return parts.join('\n');
}

/**
 * Shared system rules for LiteLLM and Gemini direct image generation.
 * Context-aware: adjusts composition guidance based on channel, section type, and theme.
 */
export function buildMarketingImageSystemText(resolution: string, context?: ImageGenContext): string {
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
  ].join('\n');
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

  const styleDirective = styleMap[stylePreset] ?? styleMap.modern_noir;

  const compositionHint =
    context?.channel === 'email'
      ? '- Horizontal/landscape composition optimized for email banners (600px wide).'
      : '- Square 1:1 aspect ratio composition.';

  const sectionHint =
    context?.sectionType === 'hero'
      ? '- Cinematic wide shot, dramatic lighting, text-safe negative space in center third.'
      : '';

  const trimmed = rawPrompt.trim();

  return [
    'PRIMARY SUBJECT — literal depiction (match this scene; do not replace with an unrelated generic stock concept):',
    trimmed,
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
