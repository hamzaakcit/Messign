// ---------------------------------------------------------------------------
// Image generation context & prompt construction — v2 Pro
// ---------------------------------------------------------------------------
// Section-aware prompt engineering with theme visual directives
// and specialized templates per email section type.
// ---------------------------------------------------------------------------

import type { ImageGenerationInput } from '../../../../dal/marketing/instagramTypes.js';

export interface ImageGenContext {
  channel: 'email' | 'instagram' | 'general';
  sectionType?: 'hero' | 'product' | 'lifestyle' | 'feature' | 'testimonial' | 'image_text' | 'value_prop' | 'social_proof' | 'standalone';
  themeHint?: string;
  artDirection?: {
    imageStyle?: string;
    imageMood?: string;
    imageColorHint?: string;
  };
}

// ---------------------------------------------------------------------------
// Section-specific prompt templates
// ---------------------------------------------------------------------------

const SECTION_PROMPT_TEMPLATES: Record<string, string> = {
  hero:
    'Cinematic ultra-wide photograph with dramatic, directional lighting. ' +
    'Generous text-safe negative space in the center-left third for headline overlay. ' +
    'Premium editorial quality, shallow depth of field with creamy bokeh, ' +
    'anamorphic lens character. Aspect ratio 16:9 landscape. Think high-budget movie poster or ' +
    'Apple product launch hero. Rich tonal depth, not flat.',

  value_prop:
    'Clean minimal conceptual illustration or isometric 3D icon art. ' +
    'Single concept per image, soft ambient occlusion shadow, ' +
    'flat or semi-flat design language with subtle gradients. ' +
    'Limited 2-3 color palette on clean background. ' +
    'Square composition, centered subject, icon-style clarity.',

  feature:
    'Clean minimal conceptual illustration or isometric 3D icon art. ' +
    'Single concept per image, soft ambient occlusion shadow, ' +
    'flat or semi-flat design language with subtle gradients. ' +
    'Limited 2-3 color palette on clean background. ' +
    'Square composition, centered subject, icon-style clarity.',

  testimonial:
    'Professional environmental portrait with warm, approachable studio lighting. ' +
    'Shallow depth of field with soft bokeh background. ' +
    'Authentic, confident expression. Chest-up framing, slight three-quarter angle. ' +
    'Corporate but human — real person energy, not stock photo feel. ' +
    'Square or vertical composition.',

  product:
    'Product spotlight photography on clean gradient or white-sweep background. ' +
    'Studio hero lighting: soft key light at 45 degrees with fill and subtle rim light. ' +
    'Sharp macro-lens detail, object perfectly centered with grounding shadow. ' +
    'E-commerce premium quality, jewel-like presentation. Color-accurate, no reflections.',

  image_text:
    'Editorial lifestyle photograph with cinematic color grading. ' +
    'Directional golden-hour or window lighting creating depth and dimension. ' +
    'Horizontal composition optimized for side-by-side layout with text. ' +
    'Story-driven visual that evokes emotion. Rule of thirds, one clear focal point. ' +
    'Magazine-quality, aspirational but authentic.',

  social_proof:
    'Abstract geometric pattern or data visualization art. ' +
    'Clean, modern, tech-forward aesthetic. Represents growth, trust, or scale conceptually. ' +
    'Subtle gradient mesh or flowing lines on muted background. ' +
    'Suitable as a subtle visual accent, not dominant. Wide horizontal format.',

  standalone:
    'Professional marketing photograph, clean and brand-safe. ' +
    'Good lighting, single clear focal point, balanced composition. ' +
    'Suitable for digital marketing context.',
};

// ---------------------------------------------------------------------------
// Theme → visual language mapping
// ---------------------------------------------------------------------------

const THEME_VISUAL_DIRECTIVES: Record<string, string> = {
  executive:
    'Visual language: Corporate and authoritative. Muted navy/slate tones, ' +
    'controlled studio lighting, clean geometry. Fortune 500 annual report aesthetic. ' +
    'Cool-neutral color temperature, premium materials (marble, glass, steel).',

  startup:
    'Visual language: Dynamic and energetic. Bold color pops on clean backgrounds, ' +
    'tech-forward compositions, Silicon Valley innovation feel. ' +
    'Bright, optimistic lighting with vibrant accent colors.',

  luxury:
    'Visual language: Rich and editorial. Deep dark backgrounds with gold/champagne accents, ' +
    'dramatic chiaroscuro lighting. Vogue/Architectural Digest quality. ' +
    'Tactile textures (leather, silk, brushed metal), cinematic depth.',

  minimal:
    'Visual language: Serene and clean. Abundant white space, ' +
    'Scandinavian design sensibility, soft diffused lighting. ' +
    'Whisper-quiet palette, only one subtle accent color. Zen-like simplicity.',

  bold:
    'Visual language: High-impact and confident. Saturated primary colors, ' +
    'strong geometric shapes, dramatic angles. Street art meets graphic design. ' +
    'High contrast, punchy, impossible to ignore.',

  nature:
    'Visual language: Organic and grounded. Earth tones (sage, terracotta, warm brown), ' +
    'natural textures (wood grain, linen, stone), warm sunlight. ' +
    'Botanical elements, sustainable feel, outdoor freshness.',

  tech:
    'Visual language: Futuristic and precise. Cool blue-to-purple gradients, ' +
    'glass/metal/carbon fiber textures, subtle grid patterns. ' +
    'LED-glow accent lighting, dashboard aesthetic, cutting-edge feel.',

  warm:
    'Visual language: Inviting and cozy. Golden-hour warmth, amber/honey tones, ' +
    'soft natural lighting, lived-in textures (knit, ceramic, wood). ' +
    'Community feel, welcoming, Sunday-morning energy.',
};

// ---------------------------------------------------------------------------
// Negative prompt — expanded for email context
// ---------------------------------------------------------------------------

const NEGATIVE_PROMPT_BLOCK = [
  '',
  'AVOID in all generated images:',
  '- Deformed, extra, or missing fingers, limbs, or anatomical parts',
  '- Readable text, words, letters, numbers, or watermarks embedded in the image',
  '- Uncanny valley faces (lifeless eyes, waxy skin, asymmetric features)',
  '- Stock photo watermark artifacts, ID badges, or clip-art elements',
  '- Multiple competing focal points — keep one clear subject',
  '- Blurry or out-of-focus primary subjects',
  '- Overly saturated neon colors that look artificial',
  '- Thin fine lines or tiny details that disappear at 600px email width',
  '- Busy repeating patterns that compete with email text overlay',
  '- Pure black backgrounds (use dark charcoal or near-black instead for email)',
].join('\n');

// ---------------------------------------------------------------------------
// Public API — v1 compatible
// ---------------------------------------------------------------------------

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

  const sectionTemplate = ctx.sectionType ? SECTION_PROMPT_TEMPLATES[ctx.sectionType] : null;
  if (sectionTemplate) {
    parts.push(sectionTemplate);
  }

  if (ctx.themeHint) {
    const themeDirective = THEME_VISUAL_DIRECTIVES[ctx.themeHint];
    if (themeDirective) {
      parts.push(themeDirective);
    } else {
      parts.push(`Theme palette hint: "${ctx.themeHint}" — match the overall mood and color temperature.`);
    }
  }

  if (ctx.artDirection?.imageMood) {
    parts.push(`Mood directive: ${ctx.artDirection.imageMood}`);
  }
  if (ctx.artDirection?.imageColorHint) {
    parts.push(`Dominant color accent: ${ctx.artDirection.imageColorHint}`);
  }

  return parts.join('\n');
}

/**
 * Shared system rules for LiteLLM and Gemini direct image generation.
 * Context-aware: adjusts composition guidance based on channel, section type, and theme.
 */
export function buildMarketingImageSystemText(resolution: string, context?: ImageGenContext): string {
  return [
    'You are a world-class art director and visual designer for premium marketing campaigns.',
    'Generate EXACTLY ONE stunning, high-quality image that matches the creative brief.',
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
 * Build a section-aware prompt for fal.ai or any image provider.
 * Combines raw prompt with section template, theme directive, and art direction.
 */
export function buildSectionAwarePrompt(
  rawPrompt: string,
  sectionType?: string,
  themeName?: string,
  artDirection?: ImageGenContext['artDirection'],
): string {
  const parts: string[] = [];
  const trimmed = rawPrompt.trim();

  // Primary subject
  parts.push(trimmed);

  // Section-specific composition template
  const sectionKey = sectionType ?? 'standalone';
  const template = SECTION_PROMPT_TEMPLATES[sectionKey];
  if (template) {
    parts.push('');
    parts.push(`COMPOSITION: ${template}`);
  }

  // Theme visual language
  if (themeName) {
    const directive = THEME_VISUAL_DIRECTIVES[themeName];
    if (directive) {
      parts.push('');
      parts.push(directive);
    }
  }

  // Art direction overrides
  if (artDirection?.imageStyle) {
    parts.push(`Style: ${artDirection.imageStyle}`);
  }
  if (artDirection?.imageMood) {
    parts.push(`Mood: ${artDirection.imageMood}`);
  }
  if (artDirection?.imageColorHint) {
    parts.push(`Dominant accent color: ${artDirection.imageColorHint}`);
  }

  // Technical requirements (concise for fal.ai which works from prompt alone)
  parts.push('');
  parts.push('Professional marketing quality. No text, watermarks, or logos in image. Brand-safe. Sharp focus.');

  return parts.join('\n');
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
      'Vibrant lifestyle photography: warm golden-hour lighting, saturated but natural colors, ' +
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
      'Data visualization art: clean abstract geometric shapes representing data flows, ' +
      'glowing neon accent lines on dark background, isometric or 3D perspective, ' +
      'tech-forward dashboard aesthetic, electric blue and purple gradients.',
    seasonal:
      'Seasonal campaign photography: rich environmental context matching the current season, ' +
      'warm cozy tones or bright airy palette, ' +
      'lifestyle-in-context composition, relatable seasonal props, natural soft lighting.',
    ugc_style:
      'User-generated content style: authentic phone-camera aesthetic, slightly imperfect framing, ' +
      'natural lighting with mild grain, lifestyle-in-action feel, approachable and real, ' +
      'no heavy post-processing, first-person perspective preferred.',
  };

  const styleDirective = styleMap[stylePreset] ?? styleMap.modern_noir;
  const trimmed = rawPrompt.trim();

  // Use section-aware prompt for email context
  if (context?.channel === 'email' && context.sectionType) {
    const sectionPrompt = buildSectionAwarePrompt(
      trimmed,
      context.sectionType,
      context.themeHint,
      context.artDirection,
    );
    return sectionPrompt;
  }

  const compositionHint =
    context?.channel === 'email'
      ? '- Horizontal/landscape composition optimized for email banners (600px wide).'
      : '- Square 1:1 aspect ratio composition.';

  const sectionHint =
    context?.sectionType === 'hero'
      ? '- Cinematic wide shot, dramatic lighting, text-safe negative space in center third.'
      : '';

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
