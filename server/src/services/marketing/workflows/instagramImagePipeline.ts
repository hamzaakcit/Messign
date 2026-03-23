/**
 * Shared Instagram image generation pipeline — used by both the orchestrator
 * and the one-shot content workflow to ensure consistent behavior.
 *
 * Responsibilities:
 *   1. Extract [IMAGE_PROMPT] from draft (tolerant of LLM format variations).
 *   2. When no [IMAGE_PROMPT] is found, auto-synthesize a visual prompt from the caption.
 *   3. Enhance the prompt with the selected style preset.
 *   4. Call generateImage and persist the result.
 *   5. Support carousel (multi-image), aspect ratios, and A/B variants.
 *   6. Log every step for observability.
 */
import { randomUUID } from 'crypto';
import type { CallerContext } from '../../../dal/types.js';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  CarouselSlideImage,
  ImageVariant,
  AspectRatio,
  StylePreset,
} from '../../../dal/marketing/instagramTypes.js';
import { ASPECT_RATIO_RESOLUTIONS } from '../../../dal/marketing/instagramTypes.js';
import * as contentDal from '../../../dal/marketing/content.js';
import {
  extractImagePrompts,
  extractCaption,
  extractAltText,
} from '../../../modules/marketing/prompts/instagramChannelSpec.js';
import { generateImage, enhanceImagePrompt, resolveStockImageUrl } from '../publishing/imageService.js';

const LOG = '[instagramImagePipeline]';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramDraftParseResult {
  caption: string;
  /** First (or only) image prompt. */
  imagePrompt: string | null;
  /** All carousel prompts (length > 1 = carousel). */
  allImagePrompts: Array<{ index: number; prompt: string }>;
  visualDescription: string | null;
  /** True when prompt was auto-synthesized from caption (no [IMAGE_PROMPT] in LLM output). */
  autoSynthesized: boolean;
}

export interface InstagramImageGenResult {
  success: boolean;
  imageUrl: string | null;
  metadata: ImageGenerationResult['metadata'] | null;
  error?: string;
  /** Which step resolved the prompt (extracted | synthesized | none). */
  promptSource: 'extracted' | 'synthesized' | 'none';
  /** Carousel slide images (populated when draft had multiple [IMAGE_PROMPT:N] blocks). */
  carouselImages?: CarouselSlideImage[];
}

// ---------------------------------------------------------------------------
// Step 1: Parse draft → caption + image prompt(s)
// ---------------------------------------------------------------------------

/**
 * Parse an Instagram draft from the Content Strategist into caption, image prompt(s),
 * and visual description. When no [IMAGE_PROMPT] block is found, auto-synthesizes
 * a visual brief from the caption text so image generation always has a prompt.
 */
export function parseInstagramDraft(rawDraft: string): InstagramDraftParseResult {
  const caption = extractCaption(rawDraft);
  const prompts = extractImagePrompts(rawDraft);
  const altText = extractAltText(rawDraft);

  const extractedPrompt = prompts[0]?.prompt ?? null;

  if (extractedPrompt) {
    console.log(`${LOG} parse_ok`, {
      promptLen: extractedPrompt.length,
      captionLen: caption.length,
      carouselSlides: prompts.length,
    });
    return {
      caption: caption || rawDraft.trim(),
      imagePrompt: extractedPrompt,
      allImagePrompts: prompts,
      visualDescription: altText ?? extractedPrompt,
      autoSynthesized: false,
    };
  }

  // Auto-synthesize: build a visual prompt from the caption text
  const synthesized = synthesizeImagePromptFromCaption(caption || rawDraft.trim());
  console.warn(`${LOG} no_image_prompt_block — auto-synthesized from caption`, {
    captionLen: (caption || rawDraft).length,
    synthesizedLen: synthesized.length,
  });

  return {
    caption: caption || rawDraft.trim(),
    imagePrompt: synthesized,
    allImagePrompts: [{ index: 0, prompt: synthesized }],
    visualDescription: altText ?? synthesized,
    autoSynthesized: true,
  };
}

/**
 * Build a reasonable image generation prompt from a caption when the LLM
 * forgot to include [IMAGE_PROMPT]. Extracts the core topic/hook and wraps
 * it in standard visual directions.
 */
function synthesizeImagePromptFromCaption(caption: string): string {
  const hookLine = caption.split('\n').find((l) => l.trim().length > 10) ?? caption.slice(0, 200);
  const topicCore = hookLine
    .replace(/#[\w\u00C0-\u024F]+/g, '')
    .replace(/[^\w\s.,!?'-]/g, '')
    .trim()
    .slice(0, 180);

  return [
    `Professional marketing visual for an Instagram post about: "${topicCore}"`,
    '',
    'Visual direction:',
    '- Subject: abstract conceptual representation of the topic',
    '- Composition: centered, clean, modern layout with negative space',
    '- Lighting: soft studio glow, subtle purple accent highlights',
    '- Color palette: deep charcoal (#1a1a2e), electric purple (#c084fc), soft white highlights',
    '- Mood: confident, professional, aspirational',
    '- Style: Modern Noir, professional SaaS aesthetic',
    '- No text overlay, no watermarks',
    '- Technical: square 1:1 aspect ratio, professional marketing photography quality',
  ].join('\n');
}

/** Resolve the resolution string from an aspect ratio. */
function resolveResolution(
  aspectRatio?: AspectRatio,
): ImageGenerationInput['resolution'] {
  if (!aspectRatio) return '1024x1024';
  const r = ASPECT_RATIO_RESOLUTIONS[aspectRatio];
  return (r as ImageGenerationInput['resolution']) ?? '1024x1024';
}

// ---------------------------------------------------------------------------
// Step 2: Generate image + persist (single or carousel)
// ---------------------------------------------------------------------------

/**
 * Run the full Instagram image generation pipeline for a content row.
 * Handles prompt extraction/synthesis, enhancement, generation, and DB update.
 * Supports single image, carousel (multi-image), and aspect ratio selection.
 *
 * Shared by both `marketingAgentOrchestrator.executeContentWorkflow` and
 * `marketingContentWorkflow.executeContentWorkflow` to prevent behavioral drift.
 */
export async function runInstagramImageGeneration(opts: {
  orgId: string;
  contentId: string;
  rawDraft: string;
  caller: CallerContext;
  stylePreset?: StylePreset;
  aspectRatio?: AspectRatio;
}): Promise<InstagramImageGenResult> {
  const { orgId, contentId, rawDraft, caller, stylePreset = 'modern_noir', aspectRatio } = opts;

  const parsed = parseInstagramDraft(rawDraft);

  if (!parsed.imagePrompt) {
    console.warn(`${LOG} gen_skipped — no prompt even after synthesis`, { contentId });
    return { success: false, imageUrl: null, metadata: null, promptSource: 'none' };
  }

  // Persist the image prompt and visual description regardless of gen outcome
  await contentDal.updateContent(caller, contentId, {
    image_prompt: parsed.imagePrompt,
    visual_description: parsed.visualDescription,
  });

  const resolution = resolveResolution(aspectRatio);
  const isCarousel = parsed.allImagePrompts.length > 1;

  console.log(`${LOG} gen_start`, {
    contentId,
    promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
    stylePreset,
    aspectRatio: aspectRatio ?? '1:1',
    resolution,
    slides: parsed.allImagePrompts.length,
    promptPreview: parsed.imagePrompt.slice(0, 120),
  });

  // --- Carousel: generate all slide images in parallel ---
  if (isCarousel) {
    return runCarouselGeneration({
      orgId,
      contentId,
      prompts: parsed.allImagePrompts,
      caller,
      stylePreset,
      resolution,
      autoSynthesized: parsed.autoSynthesized,
    });
  }

  // --- Single image: check for [STOCK] route first ---
  const stockUrl = resolveStockImageUrl(parsed.imagePrompt);
  if (stockUrl) {
    console.log(`${LOG} stock_resolved`, { contentId, url: stockUrl.slice(0, 80) });
    await contentDal.updateContent(caller, contentId, {
      image_url: stockUrl,
    });
    return {
      success: true,
      imageUrl: stockUrl,
      metadata: null,
      promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
    };
  }

  const enhanced = enhanceImagePrompt(parsed.imagePrompt, stylePreset, {
    channel: 'instagram',
    sectionType: 'standalone',
  });
  const genResult = await generateImage({
    org_id: orgId,
    content_id: contentId,
    prompt: enhanced,
    resolution,
    style_preset: stylePreset,
    aspect_ratio: aspectRatio,
  });

  console.log(`${LOG} gen_result`, {
    contentId,
    success: genResult.success,
    imageUrl: genResult.image_url?.slice(0, 80),
    error: genResult.error,
    durationMs: genResult.metadata?.duration_ms,
  });

  if (genResult.success && genResult.image_url) {
    await contentDal.updateContent(caller, contentId, {
      image_url: genResult.image_url,
      image_generation_metadata: genResult.metadata,
    });
  }

  return {
    success: genResult.success,
    imageUrl: genResult.image_url ?? null,
    metadata: genResult.metadata,
    error: genResult.error,
    promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
  };
}

// ---------------------------------------------------------------------------
// Carousel generation
// ---------------------------------------------------------------------------

async function runCarouselGeneration(opts: {
  orgId: string;
  contentId: string;
  prompts: Array<{ index: number; prompt: string }>;
  caller: CallerContext;
  stylePreset: StylePreset;
  resolution: ImageGenerationInput['resolution'];
  autoSynthesized: boolean;
}): Promise<InstagramImageGenResult> {
  const { orgId, contentId, prompts, caller, stylePreset, resolution, autoSynthesized } = opts;

  console.log(`${LOG} carousel_gen_start`, { contentId, slides: prompts.length });

  const results = await Promise.allSettled(
    prompts.map(async (p) => {
      const stockUrl = resolveStockImageUrl(p.prompt);
      if (stockUrl) {
        return {
          index: p.index,
          prompt: p.prompt,
          result: {
            success: true as const,
            image_url: stockUrl,
            storage_key: null,
            metadata: null,
            error: undefined,
          },
        };
      }
      const enhanced = enhanceImagePrompt(p.prompt, stylePreset, {
        channel: 'instagram',
        sectionType: 'standalone',
      });
      const result = await generateImage({
        org_id: orgId,
        content_id: contentId,
        prompt: enhanced,
        resolution,
        style_preset: stylePreset,
      });
      return { index: p.index, prompt: p.prompt, result };
    }),
  );

  const carouselImages: CarouselSlideImage[] = [];
  let primaryUrl: string | null = null;
  let primaryMetadata: ImageGenerationResult['metadata'] | null = null;
  const errors: string[] = [];

  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      const { index, prompt, result } = settled.value;
      if (result.success && result.image_url) {
        carouselImages.push({
          index,
          image_url: result.image_url,
          prompt,
          storage_key: result.storage_key,
        });
        if (index === 0 || !primaryUrl) {
          primaryUrl = result.image_url;
          primaryMetadata = result.metadata;
        }
      } else {
        errors.push(`Slide ${index}: ${result.error ?? 'generation failed'}`);
      }
    } else {
      errors.push(`Slide gen error: ${settled.reason}`);
    }
  }

  carouselImages.sort((a, b) => a.index - b.index);

  console.log(`${LOG} carousel_gen_result`, {
    contentId,
    total: prompts.length,
    succeeded: carouselImages.length,
    failed: errors.length,
  });

  if (carouselImages.length > 0) {
    await contentDal.updateContent(caller, contentId, {
      image_url: primaryUrl,
      image_generation_metadata: primaryMetadata,
      carousel_images: carouselImages,
    });
  }

  return {
    success: carouselImages.length > 0,
    imageUrl: primaryUrl,
    metadata: primaryMetadata,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    promptSource: autoSynthesized ? 'synthesized' : 'extracted',
    carouselImages,
  };
}

// ---------------------------------------------------------------------------
// Image variations (A/B)
// ---------------------------------------------------------------------------

/**
 * Generate multiple variations of an image from the same prompt using different
 * style presets. Returns an array of variants the user can pick from.
 */
export async function generateImageVariations(opts: {
  orgId: string;
  contentId: string;
  prompt: string;
  caller: CallerContext;
  stylePresets: StylePreset[];
  aspectRatio?: AspectRatio;
}): Promise<ImageVariant[]> {
  const { orgId, contentId, prompt, caller, stylePresets, aspectRatio } = opts;
  const resolution = resolveResolution(aspectRatio);

  console.log(`${LOG} variants_gen_start`, {
    contentId,
    variantCount: stylePresets.length,
    presets: stylePresets,
  });

  const results = await Promise.allSettled(
    stylePresets.map(async (preset) => {
      const enhanced = enhanceImagePrompt(prompt, preset);
      const result = await generateImage({
        org_id: orgId,
        content_id: contentId,
        prompt: enhanced,
        resolution,
        style_preset: preset,
        aspect_ratio: aspectRatio,
      });
      return { preset, result };
    }),
  );

  const variants: ImageVariant[] = [];
  for (const settled of results) {
    if (settled.status === 'fulfilled' && settled.value.result.success && settled.value.result.image_url) {
      variants.push({
        id: randomUUID(),
        image_url: settled.value.result.image_url,
        style_preset: settled.value.preset,
        prompt,
        generated_at: new Date().toISOString(),
      });
    }
  }

  console.log(`${LOG} variants_gen_result`, {
    contentId,
    requested: stylePresets.length,
    succeeded: variants.length,
  });

  if (variants.length > 0) {
    await contentDal.updateContent(caller, contentId, {
      image_variants: variants,
    });
  }

  return variants;
}
