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
import {
  generateImage,
  resolveStockImageUrl,
} from '../publishing/imageService.js';
import { parseOfferSheet } from '../offerSheet.js';
import { resolveStillLook } from '../publishing/imageService/promptBuilder.js';
import { inferEcommerceVertical } from '../../../modules/marketing/prompts/ecommercePromptPack.js';
import {
  buildInstagramFeedT2iPrompt,
  isInstagramImageFalOnlyFromEnv,
  type InstagramPromptIntentContext,
} from './instagramFeedT2i.js';
import { carouselProRequest, carouselRole, MAX_CAROUSEL_SLIDES, promptWithProduct, returnedPromptOmitsProduct } from './carouselSlides.js';
import { aspectRatioForInstagramFormat, instagramFormatFromTags } from './instagramFormat.js';
import { checkFeedPackage, feedFrameAspect, formatFeedPackageErrors } from '../feedPackage.js';
import { reelCoverRequest, reelPackageFromSheet } from './reelStoryboard.js';
import { resolveMockPreviewUrl, shouldUseMockImage } from '../imageGenMode.js';

export type { InstagramPromptIntentContext } from './instagramFeedT2i.js';

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
 *
 * @param intentContext When set, the user's title/brief is used to bias synthesis (and
 *   to prepend alignment when the extracted [IMAGE_PROMPT] is thin vs. the original ask).
 */
export function parseInstagramDraft(
  rawDraft: string,
  intentContext?: InstagramPromptIntentContext,
): InstagramDraftParseResult {
  const caption = extractCaption(rawDraft);
  const prompts = extractImagePrompts(rawDraft);
  const altText = extractAltText(rawDraft);

  const extractedPrompt = prompts[0]?.prompt ?? null;

  if (extractedPrompt) {
    const carouselMerged = prompts.map((p, i) =>
      i === 0
        ? { ...p, prompt: mergeIntentWithExtractedPrompt(p.prompt, intentContext) }
        : p,
    );
    const merged = carouselMerged[0]!.prompt;
    console.log(`${LOG} parse_ok`, {
      promptLen: merged.length,
      captionLen: caption.length,
      carouselSlides: prompts.length,
      intentMerged: merged !== extractedPrompt,
    });
    return {
      caption: caption || rawDraft.trim(),
      imagePrompt: merged,
      allImagePrompts: carouselMerged,
      visualDescription: altText ?? merged,
      autoSynthesized: false,
    };
  }

  // Auto-synthesize: build a visual prompt from the caption text
  const synthesized = synthesizeImagePromptFromCaption(caption || rawDraft.trim(), intentContext);
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
 * When the strategist's [IMAGE_PROMPT] is present but misses the user's stated topic,
 * prepend the original ask so the image model stays aligned.
 */
const INTENT_MERGE_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'your',
  'our',
  'are',
  'was',
  'has',
  'have',
  'been',
  'will',
  'can',
  'not',
  'but',
  'any',
  'all',
]);

function squareAspect(returned: string | undefined, requested: AspectRatio): AspectRatio {
  return feedFrameAspect(returned, requested);
}

function mergeIntentWithExtractedPrompt(
  extracted: string,
  intentContext?: InstagramPromptIntentContext,
): string {
  const title = intentContext?.title?.trim() ?? '';
  const brief = intentContext?.userBrief?.trim() ?? '';
  const combined = [title, brief].filter(Boolean).join(' — ');
  if (combined.length < 12) return extracted;

  const extLower = extracted.toLowerCase();
  const words = combined
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 3 && !INTENT_MERGE_STOPWORDS.has(w));
  if (words.length === 0) return extracted;
  const matches = words.filter((w) => extLower.includes(w)).length;
  const ratio = matches / words.length;
  /** Brand names (e.g. Mavi) are length 4; older logic used >4 and skipped them. */
  if (ratio >= 0.4 && matches >= Math.min(4, Math.max(1, words.length))) return extracted;

  return [
    "User's request — the image must reflect this:",
    combined.slice(0, 800),
    '',
    'Scene / composition to generate:',
    extracted.trim(),
  ].join('\n');
}

function buildIntentTopicLine(intent?: InstagramPromptIntentContext): string {
  const parts = [intent?.title?.trim(), intent?.userBrief?.trim()].filter(Boolean);
  return parts.join(' — ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

/**
 * Build a reasonable image generation prompt from a caption when the LLM
 * forgot to include [IMAGE_PROMPT]. Prefer the user's title/brief when provided,
 * then the caption hook — and ask for **literal** subjects (not abstract metaphors).
 */
function synthesizeImagePromptFromCaption(caption: string, intent?: InstagramPromptIntentContext): string {
  const fromIntent = buildIntentTopicLine(intent);
  const hookLine = caption.split('\n').find((l) => l.trim().length > 10) ?? caption.slice(0, 220);
  const fromCaption = hookLine
    .replace(/#[\w\u00C0-\u024F]+/g, '')
    // Strip emoji (supplementary plane + common emoji ranges)
    .replace(/[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\w\s.,!?'-]/g, '')
    .trim()
    .slice(0, 220);

  const primaryTopic =
    fromIntent.length >= 15 ? fromIntent : fromCaption || 'the subject described in the post caption';

  return [
    `Create a photorealistic marketing photograph that literally depicts: ${primaryTopic}.`,
    'Show concrete, specific subjects that match the topic — products, locations, environments, or people only when the topic explicitly involves humans.',
    'Do not default to generic office meetings, conference rooms, coworking tables, or anonymous “team” stock.',
    '',
    'Visual direction:',
    '- One clear hero subject that communicates the topic at a glance.',
    '- Composition: square 1:1 frame, scroll-stopping with bold contrast or vivid color.',
    '- Lighting: natural daylight or scene-appropriate ambient — avoid forced purple/dark “tech” palette.',
    '- No overlaid text, logos, watermarks, or readable signage.',
    '- Sharp focus on the main subject with shallow depth-of-field bokeh on background.',
    '- Color grading: vibrant but realistic — not over-saturated or flat.',
  ].join('\n');
}

/** Resolve the resolution string from an aspect ratio. */
function resolveResolution(
  aspectRatio?: AspectRatio,
): ImageGenerationInput['resolution'] {
  if (!aspectRatio) return '1080x1080';
  const r = ASPECT_RATIO_RESOLUTIONS[aspectRatio];
  return (r as ImageGenerationInput['resolution']) ?? '1080x1080';
}

/**
 * Puts a picture on the post when generation does not run.
 * A saved local photo is used as-is. A mock-tagged draft gets a local preview.
 */
export async function ensureInstagramPreview(opts: {
  caller: CallerContext;
  contentId: string;
  imagePrompt: string | null;
}): Promise<string | null> {
  const row = await contentDal.getContentById(opts.caller, opts.contentId);
  if (!row) return null;
  if (row.image_url?.trim()) return row.image_url;
  const hasLocalPhoto = Boolean(row.reference_image_url?.trim().startsWith('/uploads/'));
  const mock = shouldUseMockImage({ tags: row.tags });
  if (!hasLocalPhoto && !mock) return null;
  const url = await resolveMockPreviewUrl(
    opts.contentId,
    opts.imagePrompt ?? row.image_prompt ?? '',
    row.reference_image_url,
  );
  await contentDal.updateContent(opts.caller, opts.contentId, { image_url: url });
  return url;
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
 *
 * **Fal routing:** every Instagram T2I `generateImage` call in this module passes
 * `instagram_feed: true` so `FAL_INSTAGRAM_IMAGE_MODEL` / Instagram-tuned negatives apply (orchestrator included).
 */
export async function runInstagramImageGeneration(opts: {
  orgId: string;
  contentId: string;
  rawDraft: string;
  caller: CallerContext;
  stylePreset?: StylePreset;
  aspectRatio?: AspectRatio;
  /** Optional: original user ask — improves prompt alignment when the draft is generic. */
  intentContext?: InstagramPromptIntentContext;
  /** Ultra reference strength for this still. Omitted keeps 0.1. */
  imagePromptStrength?: number;
}): Promise<InstagramImageGenResult> {
  const { orgId, contentId, rawDraft, caller, stylePreset = 'photoreal', aspectRatio, intentContext } = opts;

  const parsed = parseInstagramDraft(rawDraft, intentContext);

  if (!parsed.imagePrompt) {
    console.warn(`${LOG} gen_skipped — no prompt even after synthesis`, { contentId });
    return { success: false, imageUrl: null, metadata: null, promptSource: 'none' };
  }

  // Persist the image prompt and visual description regardless of gen outcome
  await contentDal.updateContent(caller, contentId, {
    image_prompt: parsed.imagePrompt,
    visual_description: parsed.visualDescription,
  });

  const contentRow = await contentDal.getContentById(caller, contentId);
  if (shouldUseMockImage({ tags: contentRow?.tags })) {
    const url = await resolveMockPreviewUrl(contentId, parsed.imagePrompt, contentRow?.reference_image_url);
    await contentDal.updateContent(caller, contentId, { image_url: url });
    return {
      success: true,
      imageUrl: url,
      metadata: null,
      promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
    };
  }
  const refUrl = contentRow?.reference_image_url?.trim() ?? null;
  /** Carousel multi-gen does not use a single reference upload; force single-image path when ref is set. */
  const isCarousel = parsed.allImagePrompts.length > 1 && !refUrl;

  const format = instagramFormatFromTags(contentRow?.tags);
  const sheet = parseOfferSheet(intentContext?.userBrief);
  const look = resolveStillLook(sheet.sheet.style || stylePreset);
  const sceneProduct = sheet.sheet.product.trim();
  const scenePlace = sheet.sheet.place.trim();
  const reelPack = format === 'reel' && sceneProduct ? reelPackageFromSheet(sheet.sheet) : null;
  const cover = reelPack && !aspectRatio ? reelCoverRequest(reelPack.coverPrompt) : null;
  const resolvedAspect = aspectRatio ?? cover?.aspect_ratio ?? aspectRatioForInstagramFormat(format);
  const resolution = cover?.resolution ?? resolveResolution(resolvedAspect);
  const stillPrompt = reelPack?.coverPrompt ?? parsed.imagePrompt;
  const shopStill = inferEcommerceVertical([sceneProduct, scenePlace].filter(Boolean).join('\n')) != null;
  const brandLogoUrl = contentRow?.brand_logo_url?.trim() || undefined;
  const stillIntent = { ...intentContext, brandLogoAttached: Boolean(brandLogoUrl) };

  console.log(`${LOG} gen_start`, {
    contentId,
    promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
    stylePreset: look,
    aspectRatio: resolvedAspect,
    resolution,
    slides: parsed.allImagePrompts.length,
    referencePhoto: Boolean(refUrl),
    promptPreview: parsed.imagePrompt.slice(0, 120),
  });

  // A reference photo is a new Ultra still. Kontext stays on the edit path.
  if (refUrl) {
    const t2i = buildInstagramFeedT2iPrompt(stillPrompt, look, stillIntent, resolvedAspect);
    const genResult = await generateImage({
      org_id: orgId,
      content_id: contentId,
      prompt: t2i.prompt,
      resolution,
      style_preset: look,
      aspect_ratio: resolvedAspect,
      instagram_feed: true,
      instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
      instagram_direct_prompt: t2i.instagram_direct_prompt,
      reference_image_url: refUrl,
      scene_product: sceneProduct || undefined,
      scene_place: scenePlace || undefined,
      shop_still: shopStill,
      image_prompt_strength: opts.imagePromptStrength,
      ...(brandLogoUrl ? { brand_logo_url: brandLogoUrl } : {}),
    });
    if (genResult.success && genResult.image_url) {
      const packageErrors = checkFeedPackage({
        brief: intentContext?.userBrief,
        returnedPrompt: genResult.metadata?.fal_returned_prompt,
        aspectRatio: squareAspect(genResult.metadata?.fal_aspect_ratio, resolvedAspect),
        caption: parsed.caption,
        format: instagramFormatFromTags(contentRow?.tags),
      });
      if (packageErrors.length > 0) {
        return {
          success: false,
          imageUrl: null,
          metadata: genResult.metadata,
          error: formatFeedPackageErrors(packageErrors),
          promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
        };
      }
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

  // --- Carousel: generate all slide images in parallel ---
  if (isCarousel) {
    return runCarouselGeneration({
      orgId,
      contentId,
      prompts: parsed.allImagePrompts,
      caller,
      stylePreset: look,
      resolution,
      aspectRatio: resolvedAspect,
      autoSynthesized: parsed.autoSynthesized,
      product: sceneProduct,
      place: scenePlace,
      claim: sheet.sheet.claim,
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

  const t2i = buildInstagramFeedT2iPrompt(stillPrompt, look, stillIntent, resolvedAspect);
  const genResult = await generateImage({
    org_id: orgId,
    content_id: contentId,
    prompt: t2i.prompt,
    resolution,
    style_preset: look,
    aspect_ratio: resolvedAspect,
    instagram_feed: true,
    instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
    instagram_direct_prompt: t2i.instagram_direct_prompt,
    scene_product: sceneProduct || undefined,
    scene_place: scenePlace || undefined,
    shop_still: shopStill,
    ...(brandLogoUrl ? { brand_logo_url: brandLogoUrl } : {}),
  });

  console.log(`${LOG} gen_result`, {
    contentId,
    success: genResult.success,
    imageUrl: genResult.image_url?.slice(0, 80),
    error: genResult.error,
    durationMs: genResult.metadata?.duration_ms,
  });

  if (genResult.success && genResult.image_url) {
    const packageErrors = checkFeedPackage({
      brief: intentContext?.userBrief,
      returnedPrompt: genResult.metadata?.fal_returned_prompt,
      aspectRatio: squareAspect(genResult.metadata?.fal_aspect_ratio, resolvedAspect),
      caption: parsed.caption,
      format: instagramFormatFromTags(contentRow?.tags),
    });
    if (packageErrors.length > 0) {
      return {
        success: false,
        imageUrl: null,
        metadata: genResult.metadata,
        error: formatFeedPackageErrors(packageErrors),
        promptSource: parsed.autoSynthesized ? 'synthesized' : 'extracted',
      };
    }
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
  aspectRatio?: AspectRatio;
  autoSynthesized: boolean;
  product: string;
  place: string;
  claim: string;
}): Promise<InstagramImageGenResult> {
  const { orgId, contentId, prompts, caller, stylePreset, resolution, aspectRatio, autoSynthesized, product, place, claim } = opts;

  if (prompts.length > MAX_CAROUSEL_SLIDES) {
    return {
      success: false,
      imageUrl: null,
      metadata: null,
      error: 'A carousel can have at most 5 slides.',
      promptSource: autoSynthesized ? 'synthesized' : 'extracted',
    };
  }

  console.log(`${LOG} carousel_gen_start`, { contentId, slides: prompts.length });
  const pro = carouselProRequest(product, place);

  const results = await Promise.allSettled(
    prompts.map(async (p) => {
      const prompt = promptWithProduct(p.prompt, product);
      const stockUrl = resolveStockImageUrl(prompt);
      if (stockUrl) {
        return {
          index: p.index,
          prompt,
          result: {
            success: true as const,
            image_url: stockUrl,
            storage_key: null,
            metadata: null,
            error: undefined,
          },
        };
      }
      const t2i = buildInstagramFeedT2iPrompt(prompt, stylePreset, undefined, aspectRatio);
      const result = await generateImage({
        org_id: orgId,
        content_id: contentId,
        prompt: t2i.prompt,
        resolution,
        style_preset: stylePreset,
        aspect_ratio: aspectRatio,
        instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
        instagram_direct_prompt: t2i.instagram_direct_prompt,
        ...pro,
      });
      return { index: p.index, prompt, result };
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
        if (returnedPromptOmitsProduct(result.metadata?.fal_returned_prompt, product)) {
          errors.push(`Slide ${index}: Returned prompt must name the product.`);
          continue;
        }
        carouselImages.push({
          index,
          image_url: result.image_url,
          prompt,
          storage_key: result.storage_key,
          role: carouselRole(index) ?? 'close',
          claim,
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
      const t2i = buildInstagramFeedT2iPrompt(prompt, preset, undefined, aspectRatio);
      const result = await generateImage({
        org_id: orgId,
        content_id: contentId,
        prompt: t2i.prompt,
        resolution,
        style_preset: preset,
        aspect_ratio: aspectRatio,
        instagram_feed: true,
        instagram_fal_only: isInstagramImageFalOnlyFromEnv(),
        instagram_direct_prompt: t2i.instagram_direct_prompt,
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
