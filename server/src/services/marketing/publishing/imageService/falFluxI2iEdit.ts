// ---------------------------------------------------------------------------
// Fal — FLUX image-to-image (reference JPEG + prompt → edited image)
// Optional path when INSTAGRAM_REFERENCE_EDIT_BACKEND=flux_i2i (same Fal key as T2I).
// Env: FAL_INSTAGRAM_REFERENCE_I2I_MODEL or FAL_FLUX_I2I_MODEL — default fal-ai/flux/dev/image-to-image
// ---------------------------------------------------------------------------

import { fal } from '@fal-ai/client';
import { downloadFalImageBytes, extractFalResultImageUrl, getFalApiKey } from './falImageGeneration.js';
import type { PreparedReferenceForFal } from './falReferenceImage.js';
import { meterAiCall, IMAGE_FALLBACK_COST_USD } from '../../../ai/metering.js';

const DEFAULT_FLUX_I2I_MODEL = 'fal-ai/flux/dev/image-to-image';

function parseOptionalPositiveFloat(name: string): number | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseOptionalPositiveInt(name: string): number | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractSubscribeRequestId(result: unknown): string | undefined {
  if (result == null || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const id = r.requestId ?? r.request_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Model for Instagram-style edits from an uploaded reference (img2img). Override via env.
 */
export function resolveFluxI2iEditModelId(): string {
  return (
    process.env.FAL_INSTAGRAM_REFERENCE_I2I_MODEL?.trim() ||
    process.env.FAL_FLUX_I2I_MODEL?.trim() ||
    DEFAULT_FLUX_I2I_MODEL
  );
}

export interface CallFalFluxI2iEditResult {
  buffer: Buffer;
  modelLabel: string;
  falRequestId?: string;
}

/**
 * Runs Fal Flux image-to-image: sends a prepared data URI (same pipeline as Kontext) and a text prompt.
 * Lower strength preserves more of the original photo; higher follows the prompt more.
 */
async function callFalFluxImageToImageEditCore(
  prepared: PreparedReferenceForFal,
  prompt: string,
): Promise<CallFalFluxI2iEditResult> {
  const key = getFalApiKey();
  if (!key) {
    throw new Error('Set FAL_KEY, FAL_AI_API_KEY, or FALAI_API_KEY');
  }

  fal.config({ credentials: key });

  const mid = resolveFluxI2iEditModelId();
  const rawStrength = process.env.FAL_FLUX_I2I_STRENGTH?.trim();
  const strengthParsed = rawStrength ? Number(rawStrength) : 0.65;
  const strength = Number.isFinite(strengthParsed)
    ? Math.min(0.99, Math.max(0.05, strengthParsed))
    : 0.65;

  const input: Record<string, unknown> = {
    image_url: prepared.dataUri,
    prompt: prompt.slice(0, 8000),
    strength,
    num_images: 1,
  };

  const gs = parseOptionalPositiveFloat('FAL_FLUX_I2I_GUIDANCE_SCALE');
  if (gs != null) input.guidance_scale = gs;

  const steps = parseOptionalPositiveInt('FAL_FLUX_I2I_NUM_INFERENCE_STEPS');
  if (steps != null) input.num_inference_steps = steps;

  const subscribeTimeoutMs = parseOptionalPositiveInt('FAL_FLUX_I2I_SUBSCRIBE_TIMEOUT_MS') ?? 600_000;

  console.log('[falFluxI2i] subscribe', {
    model: mid,
    strength,
    promptLen: prompt.length,
    dataUriChars: prepared.dataUri.length,
  });

  const result = await fal.subscribe(mid, {
    input,
    logs: false,
    timeout: subscribeTimeoutMs,
  });

  const falRequestId = extractSubscribeRequestId(result);
  const url = extractFalResultImageUrl(result.data);
  if (!url || typeof url !== 'string') {
    throw new Error('Fal Flux image-to-image returned no image URL in response');
  }

  const buffer = await downloadFalImageBytes(url);
  return {
    buffer,
    modelLabel: `fal/${mid}`,
    falRequestId,
  };
}

/* Metered entry point (WP-23): one ai_call_telemetry row per image request. */

export function callFalFluxImageToImageEdit(...args: Parameters<typeof callFalFluxImageToImageEditCore>): ReturnType<typeof callFalFluxImageToImageEditCore> {
  return meterAiCall({ kind: 'image', fallbackCostUsd: IMAGE_FALLBACK_COST_USD }, () => callFalFluxImageToImageEditCore(...args));
}
