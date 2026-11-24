// ---------------------------------------------------------------------------
// Fal — FLUX Kontext (image + instruction → edited image)
// Env: FAL_IMAGE_EDIT_MODEL — default fal-ai/flux-pro/kontext
// Optional: FAL_KONTEXT_GUIDANCE_SCALE, FAL_KONTEXT_NUM_INFERENCE_STEPS, FAL_KONTEXT_ENHANCE_PROMPT
// Optional: FAL_KONTEXT_SUBSCRIBE_TIMEOUT_MS, FAL_KONTEXT_START_TIMEOUT_SEC, FAL_KONTEXT_MAX_ATTEMPTS
// ---------------------------------------------------------------------------

import { fal } from '@fal-ai/client';
import { downloadFalImageBytes, extractFalResultImageUrl, getFalApiKey } from './falImageGeneration.js';
import { prepareReferenceImageDataUriForFal, type PreparedReferenceForFal } from './falReferenceImage.js';
import { mapDimensionsToFalKontextAspectRatio } from './falKontextAspectRatio.js';
import { meterAiCall, IMAGE_FALLBACK_COST_USD } from '../../../ai/metering.js';

const DEFAULT_KONTEXT_MODEL = 'fal-ai/flux-pro/kontext';

/** Default client-side wait for Fal queue + inference (ms). */
const DEFAULT_KONTEXT_SUBSCRIBE_TIMEOUT_MS = 600_000;

/** Server-side: max seconds waiting in queue before processing starts (Fal `startTimeout`). */
const DEFAULT_KONTEXT_START_TIMEOUT_SEC = 600;

const DEFAULT_KONTEXT_MAX_ATTEMPTS = 3;

/** When env `FAL_KONTEXT_GUIDANCE_SCALE` is unset — slightly below Fal’s 3.5 default can reduce stiff / “illustrated” inserts. */
const DEFAULT_KONTEXT_GUIDANCE_SCALE = 3;

/**
 * Model id for photo edits (additive / compositing on a user upload).
 */
export function resolveFalImageEditModelId(): string {
  return process.env.FAL_IMAGE_EDIT_MODEL?.trim() || DEFAULT_KONTEXT_MODEL;
}

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

function parseKontextSubscribeTimeoutMs(): number {
  const n = parseOptionalPositiveInt('FAL_KONTEXT_SUBSCRIBE_TIMEOUT_MS');
  return n ?? DEFAULT_KONTEXT_SUBSCRIBE_TIMEOUT_MS;
}

function parseKontextStartTimeoutSec(): number {
  const n = parseOptionalPositiveInt('FAL_KONTEXT_START_TIMEOUT_SEC');
  return n ?? DEFAULT_KONTEXT_START_TIMEOUT_SEC;
}

function parseKontextMaxAttempts(): number {
  const n = parseOptionalPositiveInt('FAL_KONTEXT_MAX_ATTEMPTS');
  const v = n ?? DEFAULT_KONTEXT_MAX_ATTEMPTS;
  return Math.min(5, Math.max(1, v));
}

/**
 * Whether Fal should run prompt enhancement for Kontext.
 * Default `false` — scene-locked photoreal edits often work better without Fal’s paraphrase.
 * Set `FAL_KONTEXT_ENHANCE_PROMPT=1` to enable.
 */
export function resolveKontextEnhancePrompt(): boolean {
  const v = process.env.FAL_KONTEXT_ENHANCE_PROMPT?.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return false;
}

/**
 * Whether a Fal Kontext error is worth retrying (transient gateway / queue / rate limits).
 * Exported for unit tests.
 */
export function isRetryableFalKontextError(message: string): boolean {
  return /Gateway Timeout|504|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|502|503|429|rate|temporarily|unavailable|overloaded/i.test(
    message,
  );
}

/**
 * Fal Kontext defaults to JPEG (opaque). PNG can include alpha; on dark UIs that reads as a "black" image.
 * Set FAL_KONTEXT_OUTPUT_FORMAT=png to force PNG.
 */
export function resolveKontextOutputFormat(): 'jpeg' | 'png' {
  const v = process.env.FAL_KONTEXT_OUTPUT_FORMAT?.trim().toLowerCase();
  if (v === 'png') return 'png';
  return 'jpeg';
}

export interface KontextFalSubscribeInputOptions {
  guidanceScale?: number;
  /** Overrides {@link resolveKontextEnhancePrompt} when set. */
  enhancePrompt?: boolean;
  /** Fal enum string, e.g. `4:3` — usually set from reference dimensions. */
  aspectRatio?: string;
  /** When set, overrides env `FAL_KONTEXT_NUM_INFERENCE_STEPS` (if supported by the endpoint). */
  numInferenceSteps?: number;
}

/**
 * Builds Fal subscribe input for FLUX Kontext–style endpoints (image_url + prompt).
 * Exported for unit tests (no network).
 *
 * @param imageUrlOrDataUri — Public HTTPS URL or `data:image/...;base64,...` (Fal accepts both).
 * @see https://fal.ai/models/fal-ai/flux-pro/kontext/api
 */
export function buildKontextFalSubscribeInput(
  imageUrlOrDataUri: string,
  prompt: string,
  options?: KontextFalSubscribeInputOptions,
): Record<string, unknown> {
  const enhance =
    options?.enhancePrompt !== undefined ? options.enhancePrompt : resolveKontextEnhancePrompt();
  const input: Record<string, unknown> = {
    image_url: imageUrlOrDataUri,
    prompt: prompt.slice(0, 8000),
    num_images: 1,
    output_format: resolveKontextOutputFormat(),
    /** Official Flux Kontext API field (not `enable_safety_checker`, which is for other Fal models). */
    safety_tolerance: '2',
    enhance_prompt: enhance,
  };
  const gs =
    options?.guidanceScale ??
    parseOptionalPositiveFloat('FAL_KONTEXT_GUIDANCE_SCALE') ??
    DEFAULT_KONTEXT_GUIDANCE_SCALE;
  input.guidance_scale = gs;

  const ar = options?.aspectRatio?.trim();
  if (ar) input.aspect_ratio = ar;

  const steps =
    options?.numInferenceSteps ?? parseOptionalPositiveInt('FAL_KONTEXT_NUM_INFERENCE_STEPS');
  if (steps != null) input.num_inference_steps = steps;

  return input;
}

async function downloadKontextResultImage(url: string): Promise<Buffer> {
  try {
    return await downloadFalImageBytes(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to download Fal Kontext image: ${msg}`);
  }
}

export interface CallFalKontextImageEditOptions {
  modelId?: string;
  /** Merged into Fal input; `aspectRatio` is set from the prepared reference unless overridden here. */
  kontextInput?: KontextFalSubscribeInputOptions;
  /**
   * When set, skips downloading `referenceImageHttpsUrl` (caller already ran {@link prepareReferenceImageDataUriForFal}).
   */
  prepared?: PreparedReferenceForFal;
}

export interface CallFalKontextImageEditResult {
  buffer: Buffer;
  modelLabel: string;
  /** Fal `aspect_ratio` sent with the request. */
  kontext_aspect_ratio: string;
  enhance_prompt: boolean;
  /** Present when @fal-ai/client returns a queue request id. */
  falRequestId?: string;
}

/**
 * Runs Kontext: reference image is fetched on this server and sent as a data URI so Fal always receives the real pixels
 * (Supabase URLs are not always fetchable from Fal's infrastructure).
 */
async function callFalKontextImageEditCore(
  referenceImageHttpsUrl: string,
  prompt: string,
  options?: CallFalKontextImageEditOptions,
): Promise<CallFalKontextImageEditResult> {
  const key = getFalApiKey();
  if (!key) {
    throw new Error('Set FAL_KEY, FAL_AI_API_KEY, or FALAI_API_KEY');
  }

  fal.config({ credentials: key });

  const mid = options?.modelId?.trim() || resolveFalImageEditModelId();
  let prepared: PreparedReferenceForFal;
  try {
    prepared =
      options?.prepared ??
      (await prepareReferenceImageDataUriForFal(referenceImageHttpsUrl.trim()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[falKontext] reference_prepare_failed', { message: msg });
    throw new Error(msg);
  }

  const aspectFromImage = mapDimensionsToFalKontextAspectRatio(prepared.width, prepared.height);
  const aspectRatio = options?.kontextInput?.aspectRatio?.trim() || aspectFromImage;

  const mergedInput: KontextFalSubscribeInputOptions = {
    ...options?.kontextInput,
    aspectRatio,
  };

  const input = buildKontextFalSubscribeInput(prepared.dataUri, prompt, mergedInput);
  const enhance_prompt = Boolean(input.enhance_prompt);

  console.log('[falKontext] reference_prepared', {
    model: mid,
    dataUriChars: prepared.dataUri.length,
    promptLen: prompt.length,
    width: prepared.width,
    height: prepared.height,
    kontext_aspect_ratio: aspectRatio,
    enhance_prompt,
    guidance_scale: input.guidance_scale,
    num_inference_steps: input.num_inference_steps,
  });

  const subscribeTimeoutMs = parseKontextSubscribeTimeoutMs();
  const startTimeoutSec = parseKontextStartTimeoutSec();
  const maxAttempts = parseKontextMaxAttempts();

  function extractSubscribeRequestId(result: unknown): string | undefined {
    if (result == null || typeof result !== 'object') return undefined;
    const r = result as Record<string, unknown>;
    const id = r.requestId ?? r.request_id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const subscribeStarted = Date.now();
      const result = await fal.subscribe(mid, {
        input,
        logs: false,
        timeout: subscribeTimeoutMs,
        startTimeout: startTimeoutSec,
      });

      const falRequestId = extractSubscribeRequestId(result);
      const url = extractFalResultImageUrl(result.data);
      if (!url || typeof url !== 'string') {
        throw new Error('Fal Kontext returned no image URL in response');
      }

      const buffer = await downloadKontextResultImage(url);
      const durationMs = Date.now() - subscribeStarted;
      console.log('[falKontext] fal_subscribe_ok', {
        modelId: mid,
        falRequestId,
        durationMs,
        bufferBytes: buffer.length,
      });
      return {
        buffer,
        modelLabel: `fal/${mid}`,
        kontext_aspect_ratio: aspectRatio,
        enhance_prompt,
        falRequestId,
      };
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = isRetryableFalKontextError(message);
      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }
      const delayMs = Math.min(2000 * attempt, 15_000);
      console.warn(
        `[falKontext] subscribe attempt ${attempt}/${maxAttempts} failed: ${message.slice(0, 200)}. Retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* Metered entry point (WP-23): one ai_call_telemetry row per image request. */

export function callFalKontextImageEdit(...args: Parameters<typeof callFalKontextImageEditCore>): ReturnType<typeof callFalKontextImageEditCore> {
  return meterAiCall({ kind: 'image', fallbackCostUsd: IMAGE_FALLBACK_COST_USD }, () => callFalKontextImageEditCore(...args));
}
