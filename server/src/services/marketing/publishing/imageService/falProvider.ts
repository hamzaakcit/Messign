// ============================================================================
// fal.ai Image Generation Provider
// ============================================================================
// Uses fal.ai Flux models for high-quality, section-aware image generation.
//
// Environment:
//   FAL_KEY           — fal.ai API key (required to enable this provider)
//   FAL_DEFAULT_MODEL — Override default model (optional, default fal-ai/flux-pro/v1.1)
// ============================================================================

import type { ImageGenContext } from './promptBuilder.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const GENERATION_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

function getFalKey(): string {
  return process.env.FAL_KEY?.trim() ?? '';
}

export function hasFalCredentials(): boolean {
  return Boolean(getFalKey());
}

// ---------------------------------------------------------------------------
// Section-aware model & dimension selection
// ---------------------------------------------------------------------------

export type FalSectionType =
  | 'hero'
  | 'product'
  | 'feature'
  | 'testimonial'
  | 'image_text'
  | 'value_prop'
  | 'social_proof'
  | 'standalone';

interface FalModelConfig {
  model: string;
  width: number;
  height: number;
  numInferenceSteps: number;
  guidanceScale: number;
}

/**
 * Select the optimal fal.ai model and parameters for a given email section type.
 * Hero images get the highest quality; features/icons get fast generation.
 */
export function selectFalConfig(sectionType?: FalSectionType): FalModelConfig {
  const defaultModel = process.env.FAL_DEFAULT_MODEL?.trim() || 'fal-ai/flux-pro/v1.1';

  switch (sectionType) {
    case 'hero':
      return {
        model: defaultModel,
        width: 1344,
        height: 768,
        numInferenceSteps: 40,
        guidanceScale: 3.5,
      };
    case 'product':
      return {
        model: defaultModel,
        width: 1024,
        height: 1024,
        numInferenceSteps: 35,
        guidanceScale: 4.0,
      };
    case 'testimonial':
      return {
        model: defaultModel,
        width: 768,
        height: 768,
        numInferenceSteps: 30,
        guidanceScale: 3.5,
      };
    case 'image_text':
      return {
        model: defaultModel,
        width: 1024,
        height: 768,
        numInferenceSteps: 35,
        guidanceScale: 3.5,
      };
    case 'feature':
    case 'value_prop':
      return {
        model: 'fal-ai/flux/schnell',
        width: 768,
        height: 768,
        numInferenceSteps: 4,
        guidanceScale: 0,
      };
    case 'social_proof':
      return {
        model: 'fal-ai/flux/schnell',
        width: 1024,
        height: 512,
        numInferenceSteps: 4,
        guidanceScale: 0,
      };
    default:
      return {
        model: 'fal-ai/flux/schnell',
        width: 1024,
        height: 1024,
        numInferenceSteps: 4,
        guidanceScale: 0,
      };
  }
}

// ---------------------------------------------------------------------------
// Map ImageGenContext → FalSectionType
// ---------------------------------------------------------------------------

export function contextToFalSection(ctx?: ImageGenContext): FalSectionType {
  if (!ctx?.sectionType) return 'standalone';
  const map: Record<string, FalSectionType> = {
    hero: 'hero',
    product: 'product',
    feature: 'feature',
    testimonial: 'testimonial',
    image_text: 'image_text',
    value_prop: 'value_prop',
    social_proof: 'social_proof',
    lifestyle: 'image_text',
    standalone: 'standalone',
  };
  return map[ctx.sectionType] ?? 'standalone';
}

// ---------------------------------------------------------------------------
// Core: Queue-based fal.ai image generation
// ---------------------------------------------------------------------------

interface FalQueueResponse {
  request_id: string;
  status?: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_url?: string;
}

interface FalResultResponse {
  images?: Array<{ url: string; content_type?: string }>;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate an image using fal.ai queue API.
 * Returns the raw image buffer and model ID used.
 */
export async function callFalImageGeneration(
  prompt: string,
  sectionType?: FalSectionType,
): Promise<{ buffer: Buffer; modelId: string }> {
  const key = getFalKey();
  if (!key) throw new Error('FAL_KEY not set');

  const config = selectFalConfig(sectionType);
  const submitUrl = `${FAL_QUEUE_BASE}/${config.model}`;

  const payload: Record<string, unknown> = {
    prompt: prompt.slice(0, 4000),
    image_size: { width: config.width, height: config.height },
    num_inference_steps: config.numInferenceSteps,
    enable_safety_checker: true,
    output_format: 'png',
    num_images: 1,
  };

  if (config.guidanceScale > 0) {
    payload.guidance_scale = config.guidanceScale;
  }

  // Submit to queue
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`fal.ai submit ${submitRes.status}: ${errText.slice(0, 400)}`);
  }

  const submitData = (await submitRes.json()) as FalQueueResponse;
  const requestId = submitData.request_id;

  if (!requestId) {
    // Synchronous response — some models return result directly
    const directData = submitData as unknown as FalResultResponse;
    if (directData.images?.[0]?.url) {
      return downloadFalImage(directData.images[0].url, config.model);
    }
    throw new Error('fal.ai: no request_id and no direct image in response');
  }

  // Poll for completion
  const statusUrl = `${submitUrl}/requests/${requestId}/status`;
  const resultUrl = `${submitUrl}/requests/${requestId}`;
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${key}` },
    });

    if (!statusRes.ok) {
      console.warn(`[falProvider] Status poll ${statusRes.status}`);
      continue;
    }

    const statusData = (await statusRes.json()) as FalStatusResponse;

    if (statusData.status === 'COMPLETED') {
      // Fetch result
      const resultRes = await fetch(statusData.response_url ?? resultUrl, {
        headers: { Authorization: `Key ${key}` },
      });

      if (!resultRes.ok) {
        throw new Error(`fal.ai result fetch ${resultRes.status}`);
      }

      const resultData = (await resultRes.json()) as FalResultResponse;
      const imageUrl = resultData.images?.[0]?.url;
      if (!imageUrl) throw new Error('fal.ai: no image URL in completed result');

      return downloadFalImage(imageUrl, config.model);
    }

    if (statusData.status === 'FAILED') {
      throw new Error('fal.ai: image generation failed');
    }
  }

  throw new Error(`fal.ai: generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s`);
}

async function downloadFalImage(
  imageUrl: string,
  modelId: string,
): Promise<{ buffer: Buffer; modelId: string }> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`fal.ai image download ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) throw new Error('fal.ai: downloaded empty image');

  return { buffer, modelId: `fal/${modelId}` };
}
