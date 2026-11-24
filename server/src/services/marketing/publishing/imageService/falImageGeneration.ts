// ---------------------------------------------------------------------------
// Fal AI — marketing image generation via @fal-ai/client (subscribe)
// ---------------------------------------------------------------------------
import sharp from 'sharp';
// Env:
//   FAL_KEY, FAL_AI_API_KEY, or FALAI_API_KEY — first non-empty wins
//   FAL_IMAGE_MODEL — default fal-ai/flux/dev (override with fal-ai/flux/schnell, etc.)
//   FAL_EMAIL_IMAGE_MODEL — optional; used when ImageGenerationInput.email_campaign is true
//   FAL_NEGATIVE_PROMPT — default negative prompt for Flux (anti-text / fake UI)
//   FAL_EMAIL_NEGATIVE_PROMPT — appended when technical_platform_topic is true (if set)
//   Email campaigns also merge EMAIL_CAMPAIGN_FAL_NEGATIVE_APPEND (code) on every Fal request when email_campaign is true.
//   FAL_FLUX_GUIDANCE_SCALE, FAL_FLUX_NUM_INFERENCE_STEPS — optional Flux tuning
//   INSTAGRAM_FAL_OUTPUT_JPEG — "1"/"true": request JPEG from Fal for instagram_feed (reduces PNG/alpha luminance quirks)
//   FAL_INSTAGRAM_IMAGE_MODEL — optional; used when instagram_feed=true (quality tier for social stills)
//   FAL_INSTAGRAM_FLUX_GUIDANCE_SCALE, FAL_INSTAGRAM_FLUX_NUM_INFERENCE_STEPS — Instagram defaults when unset globals
//   FAL_OVERLAY_IMAGE_MODEL — optional; VA2 paper-plane overlays (overlay_paper_plane=true); else FAL_IMAGE_MODEL
// ---------------------------------------------------------------------------

import { fal } from '@fal-ai/client';
import { ensurePublicInstagramImageUrl } from '../instagramPublicImage.js';

const DEFAULT_FAL_MODEL = 'fal-ai/flux/dev';

/** When `instagram_feed` and `FAL_INSTAGRAM_IMAGE_MODEL` are unset — Flux Pro tier for feed quality (costlier than flux/dev). */
const DEFAULT_INSTAGRAM_FAL_MODEL = 'fal-ai/flux-pro/v1.1';

/** Instagram-only Flux defaults when global FAL_FLUX_* env vars are unset (quality-first; higher latency/cost than dev defaults). */
const DEFAULT_INSTAGRAM_FLUX_GUIDANCE = 3.75;
const DEFAULT_INSTAGRAM_FLUX_STEPS = 50;

/** Default anti-text / anti-mockup negative when FAL_NEGATIVE_PROMPT is unset. */
export const DEFAULT_FAL_NEGATIVE_PROMPT_FALLBACK =
  'text, typography, letters, words, numbers, watermark, logo, subtitle, headline, signage, billboard, neon text, LED ticker, magazine cover, infographic text, handwriting, caption bar, lower third, marketing slogan, paragraph overlay, UI mockup, screenshot, fake website, app interface, dashboard with labels, lorem ipsum, gibberish text, blurry skin, cartoon, clipart, stock office team, generic smiling people, extreme motion blur on subject, abstract blur-only background, full-frame bokeh mush';

/**
 * Instagram feed generation: same anti-text/UI guardrails, but **no** suppression of “generic people” —
 * those terms were steering Flux away from believable humans. Emphasis on anatomy and render-quality negatives.
 */
export const DEFAULT_FAL_NEGATIVE_PROMPT_INSTAGRAM =
  'text, typography, letters, words, numbers, watermark, logo, subtitle, headline, signage, billboard, neon text, LED ticker, magazine cover, infographic text, handwriting, caption bar, lower third, marketing slogan, paragraph overlay, UI mockup, screenshot, fake website, app interface, dashboard with labels, lorem ipsum, gibberish text, cartoon, clipart, extreme motion blur on subject, abstract blur-only background, full-frame bokeh mush, deformed hands, extra fingers, mangled facial anatomy, asymmetrical eyes, waxy plastic skin, duplicate limbs, low-poly 3D render, video game screenshot, vector illustration props, flat graphic objects, perfectly smooth solid-color props, plastic toy look, glossy fake CGI handheld objects, stick or skewer holding prop, wire or rod mounting, puppet-style prop, floating disconnected prop, mismatched lighting on handheld object, composited cutout, pasted graphic overlay, flat paper plane, vector paper plane, paperplane without folds, featureless colored shape, smooth unfolded paper, 2d paper prop, origami-like geometric simplification, flat origami, illustration-style paper plane';

/**
 * Always merged after base (and before technical / per-request extras) for Fal when `emailCampaign` is true.
 * Suppresses typography and mushy blur-only email heroes without requiring env configuration.
 */
export const EMAIL_CAMPAIGN_FAL_NEGATIVE_APPEND =
  'typography, letters, numerals, glyphs, captions, subtitles, signage, billboards, fake UI, website screenshot, chat bubbles, toast notifications, readable screen text, watermarks, logos, extreme motion blur on subject, abstract blur-only hero, gradient-only mush, full-frame soft bokeh with no subject';

/**
 * Reads Fal API credentials from the environment.
 * Precedence: `FAL_KEY` → `FAL_AI_API_KEY` → `FALAI_API_KEY`.
 */
export function getFalApiKey(): string | undefined {
  const k =
    process.env.FAL_KEY?.trim() ||
    process.env.FAL_AI_API_KEY?.trim() ||
    process.env.FALAI_API_KEY?.trim() ||
    '';
  return k.length > 0 ? k : undefined;
}

export interface FalModelRequestOptions {
  emailCampaign?: boolean;
  /** Prefer FAL_INSTAGRAM_IMAGE_MODEL when set — for feed-quality Flux endpoints. */
  instagramFeed?: boolean;
  /** A reference photo selects Flux Pro Ultra instead of the text-only Pro model. */
  referenceImageUrl?: string | null;
  /** VA2 paper-plane overlays — prefer FAL_OVERLAY_IMAGE_MODEL; preserves PNG alpha in generateImage when set. */
  overlayPaperPlane?: boolean;
}

/**
 * Model id for Fal subscribe: overlay → FAL_OVERLAY_IMAGE_MODEL; email → FAL_EMAIL_IMAGE_MODEL;
 * Instagram feed → FAL_INSTAGRAM_IMAGE_MODEL; else FAL_IMAGE_MODEL.
 */
export function resolveFalModelIdForRequest(opts?: FalModelRequestOptions): string {
  if (opts?.overlayPaperPlane) {
    const overlay = process.env.FAL_OVERLAY_IMAGE_MODEL?.trim();
    if (overlay) return overlay;
    return process.env.FAL_IMAGE_MODEL?.trim() || DEFAULT_FAL_MODEL;
  }
  if (opts?.emailCampaign) {
    const emailModel = process.env.FAL_EMAIL_IMAGE_MODEL?.trim();
    if (emailModel) return emailModel;
  }
  if (opts?.instagramFeed) {
    if (opts.referenceImageUrl?.trim()) return FLUX_PRO_ULTRA_MODEL;
    const ig = process.env.FAL_INSTAGRAM_IMAGE_MODEL?.trim();
    if (ig) return ig;
    return DEFAULT_INSTAGRAM_FAL_MODEL;
  }
  return process.env.FAL_IMAGE_MODEL?.trim() || DEFAULT_FAL_MODEL;
}

/**
 * Maps marketing resolution strings (e.g. 1024x1024) to Fal `image_size` input.
 */
export function resolutionToFalImageSize(
  resolution: string,
): string | { width: number; height: number } {
  const m = resolution.toLowerCase().match(/(\d+)\s*x\s*(\d+)/);
  if (m) {
    const w = Math.min(Math.max(parseInt(m[1]!, 10), 512), 2048);
    const h = Math.min(Math.max(parseInt(m[2]!, 10), 512), 2048);
    return { width: w, height: h };
  }
  return 'square_hd';
}

export interface FalMarketingImageCallOptions {
  /** Use FAL_EMAIL_IMAGE_MODEL when set. */
  emailCampaign?: boolean;
  /** Stronger email negative (FAL_EMAIL_NEGATIVE_PROMPT) when true. */
  technicalPlatformTopic?: boolean;
  /** Merged after env defaults. */
  falNegativePrompt?: string;
  /** Use Instagram-tuned default negative (people-friendly) and optional Flux quality defaults. */
  instagramFeed?: boolean;
  /** Paper-plane VA2 overlay asset — FAL_OVERLAY_IMAGE_MODEL, PNG alpha, no post-flatten to JPEG in generateImage. */
  overlayPaperPlane?: boolean;
  /** Flux `seed` — use per-request values for Instagram to avoid stuck / near-identical outputs. */
  falSeed?: number;
  /** Reference photo. Instagram stills use Flux Pro Ultra and send this as `image_url`. */
  referenceImageUrl?: string | null;
  /** Product named in the scene. When set, Pro and Ultra send `enhance_prompt: false`. */
  sceneProduct?: string;
  /** Place named in the scene. A returned prompt that drops it is retried once. */
  scenePlace?: string;
  /** Ultra `aspect_ratio`. Pixel `image_size` stays on Pro and Dev. */
  aspectRatio?: FalAspectRatio;
  /** Ultra `raw` for a bookstore or florist still. */
  shopStill?: boolean;
  /** Ultra `image_prompt_strength` when a reference photo is set. Omitted uses 0.1. */
  imagePromptStrength?: number;
}

function resolveDefaultNegativeBase(options?: FalMarketingImageCallOptions): string {
  const env = process.env.FAL_NEGATIVE_PROMPT?.trim();
  if (env) return env;
  if (options?.instagramFeed === true) return DEFAULT_FAL_NEGATIVE_PROMPT_INSTAGRAM;
  return DEFAULT_FAL_NEGATIVE_PROMPT_FALLBACK;
}

/**
 * Builds merged negative prompt for Fal from env + flags + per-request override.
 */
/**
 * Prepended for instagram_feed so it survives Fal’s 2000-char `negative_prompt` cap.
 * Avoid literal “black” / “RGB black” — those tokens can still steer Flux/CLIP toward dark frames in practice.
 */
const INSTAGRAM_ANTI_VOID_NEGATIVE =
  'no visible subject, no focal point, illegible blur, no coherent scene, missing subject matter, absence of discernible detail';

export function mergeFalNegativePromptForRequest(options?: FalMarketingImageCallOptions): string | undefined {
  const base = resolveDefaultNegativeBase(options);
  const parts: string[] = [base];
  if (options?.emailCampaign === true) {
    parts.push(EMAIL_CAMPAIGN_FAL_NEGATIVE_APPEND);
  }
  if (options?.technicalPlatformTopic) {
    const extra = process.env.FAL_EMAIL_NEGATIVE_PROMPT?.trim();
    if (extra) parts.push(extra);
  }
  if (options?.falNegativePrompt?.trim()) {
    parts.push(options.falNegativePrompt.trim());
  }
  let merged = parts.join(', ').replace(/,\s*,/g, ',').trim();
  /**
   * Instagram: anti-void terms were previously appended; `buildFluxFalSubscribeInput` sends only the first
   * 2000 characters to Fal. Long bases (custom FAL_NEGATIVE_PROMPT) could truncate them off → solid black frames on dark UIs.
   */
  if (options?.instagramFeed === true) {
    merged = `${INSTAGRAM_ANTI_VOID_NEGATIVE}, ${merged}`;
  }
  /** Fal Flux subscribe passes a shorter `negative_prompt` slice (2000) — see buildFluxFalSubscribeInput. */
  return merged.length > 0 ? merged.slice(0, 4000) : undefined;
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

/**
 * Flux Pro v1.1 Ultra. A reference photo on an Instagram still uses this model.
 * @see https://fal.ai/models/fal-ai/flux-pro/v1.1-ultra/api
 */
export const FLUX_PRO_ULTRA_MODEL = 'fal-ai/flux-pro/v1.1-ultra';

/**
 * Flux Pro and Flux 2–style slugs use `safety_tolerance` (not legacy `enable_safety_checker`) and typically JPEG output
 * when opaque output is desired. Flux Dev keeps `enable_safety_checker` + PNG unless Instagram/email forces JPEG.
 */
export function isFluxProFamilyModel(modelId: string): boolean {
  return /flux-pro/i.test(modelId) || /flux[-/]2\b/i.test(modelId) || /flux2/i.test(modelId);
}

/** Ultra has its own body: `aspect_ratio`, no `image_size`. */
export function isFluxProUltraModel(modelId: string): boolean {
  return /flux-pro\/v1\.1-ultra/i.test(modelId);
}

/** Dev accepts guidance, steps, and `acceleration`. Pro and Ultra do not. */
export function isFluxDevModel(modelId: string): boolean {
  return /\/flux\/dev\b/i.test(modelId);
}

/**
 * Snap a custom Fal size onto a multiple of 64 inside 512–2048.
 * 1080 is divisible by 8 and not by 64, so a Pro size error retries this size.
 */
export function snapFalImageSize(
  imageSize: string | { width: number; height: number },
): string | { width: number; height: number } {
  if (typeof imageSize !== 'object') return imageSize;
  const snap = (value: number): number => {
    const snapped = Math.round(value / 64) * 64;
    return Math.min(2048, Math.max(512, snapped));
  };
  return { width: snap(imageSize.width), height: snap(imageSize.height) };
}

export type FalAspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

/**
 * Ultra `aspect_ratio` for a pixel size. Unknown sizes stay square.
 */
export function aspectRatioForFalSize(resolution: string): FalAspectRatio {
  const match = resolution.toLowerCase().match(/(\d+)\s*x\s*(\d+)/);
  if (!match) return '1:1';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width === height) return '1:1';
  if (width * 5 === height * 4) return '4:5';
  if (width * 16 === height * 9) return '9:16';
  if (width * 9 === height * 16) return '16:9';
  return height > width ? '9:16' : '16:9';
}

/**
 * Context for Fal input shape: email / non–Instagram Flux Pro prefer **opaque JPEG**; Instagram feed uses **PNG**
 * (less over-compressed than tiny JPEGs from Fal) and is flattened to JPEG in `generateImage`.
 * Flux Pro rejects legacy `enable_safety_checker`.
 * @see https://fal.ai/models/fal-ai/flux-pro/v1.1/api — `safety_tolerance` not `enable_safety_checker`.
 */
export interface FalFluxRequestContext {
  instagramFeed?: boolean;
  emailCampaign?: boolean;
  /** When true, prefer PNG + alpha (paper-plane overlays) even for Flux Pro–family models. */
  overlayPaperPlane?: boolean;
}

/**
 * Flux-compatible subscribe input. Pro, Ultra, and Dev each get the fields their schema accepts.
 * Exported for unit tests (no network).
 */
export function buildFluxFalSubscribeInput(
  modelId: string,
  prompt: string,
  imageSize: string | { width: number; height: number },
  fluxOptions: {
    negativePrompt?: string;
    guidanceScale?: number;
    numInferenceSteps?: number;
    seed?: number;
    enhancePrompt?: boolean;
    aspectRatio?: FalAspectRatio;
    referenceImageUrl?: string;
    shopStill?: boolean;
    imagePromptStrength?: number;
  },
  requestContext?: FalFluxRequestContext,
): Record<string, unknown> {
  const isFluxFamily = /flux/i.test(modelId);
  const isUltra = isFluxProUltraModel(modelId);
  const isFluxPro = isFluxProFamilyModel(modelId);
  const isDev = isFluxDevModel(modelId);
  const isOverlay = requestContext?.overlayPaperPlane === true;
  const isInstagramFeed = requestContext?.instagramFeed === true;
  const emailCampaign = requestContext?.emailCampaign === true;

  let outputFormat: 'jpeg' | 'png';
  if (isOverlay) {
    outputFormat = 'png';
  } else if (isInstagramFeed) {
    const jpegOut = process.env.INSTAGRAM_FAL_OUTPUT_JPEG?.trim().toLowerCase();
    outputFormat = jpegOut === '1' || jpegOut === 'true' || jpegOut === 'yes' ? 'jpeg' : 'png';
  } else if (emailCampaign || isFluxPro) {
    outputFormat = 'jpeg';
  } else {
    outputFormat = 'png';
  }

  const seed =
    fluxOptions.seed != null && Number.isFinite(fluxOptions.seed) ? Math.round(fluxOptions.seed) : undefined;

  if (isUltra) {
    const input: Record<string, unknown> = {
      prompt: prompt.slice(0, 8000),
      aspect_ratio: fluxOptions.aspectRatio ?? '1:1',
      num_images: 1,
      output_format: outputFormat,
      safety_tolerance: '2',
      enhance_prompt: fluxOptions.enhancePrompt === true,
    };
    if (seed != null) input.seed = seed;
    if (fluxOptions.shopStill === true) input.raw = true;
    const reference = fluxOptions.referenceImageUrl?.trim();
    if (reference) {
      input.image_url = reference;
      const strength = fluxOptions.imagePromptStrength;
      input.image_prompt_strength =
        strength != null && Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0.1;
    }
    return input;
  }

  const input: Record<string, unknown> = {
    prompt: prompt.slice(0, 8000),
    image_size: imageSize,
    num_images: 1,
    output_format: outputFormat,
  };

  if (isFluxFamily) {
    if (isFluxPro) {
      input.safety_tolerance = '2';
      input.enhance_prompt = fluxOptions.enhancePrompt === true;
    } else {
      input.enable_safety_checker = true;
    }
  } else {
    input.enable_safety_checker = true;
  }

  if (!isFluxFamily) {
    return input;
  }
  if (isDev) {
    input.acceleration = 'none';
    if (fluxOptions.guidanceScale != null && Number.isFinite(fluxOptions.guidanceScale)) {
      input.guidance_scale = fluxOptions.guidanceScale;
    }
    if (fluxOptions.numInferenceSteps != null && Number.isFinite(fluxOptions.numInferenceSteps)) {
      input.num_inference_steps = Math.round(fluxOptions.numInferenceSteps);
    }
  } else if (!isFluxPro) {
    if (fluxOptions.negativePrompt?.trim()) {
      input.negative_prompt = fluxOptions.negativePrompt.trim().slice(0, 2000);
    }
    if (fluxOptions.guidanceScale != null && Number.isFinite(fluxOptions.guidanceScale)) {
      input.guidance_scale = fluxOptions.guidanceScale;
    }
    if (fluxOptions.numInferenceSteps != null && Number.isFinite(fluxOptions.numInferenceSteps)) {
      input.num_inference_steps = Math.round(fluxOptions.numInferenceSteps);
    }
  }
  if (seed != null) input.seed = seed;
  return input;
}

export interface FalSubscribeResult {
  data: unknown;
  requestId?: string;
}

/**
 * Prompt string Fal echoed back. Missing when the payload has no prompt field.
 */
export function extractFalReturnedPrompt(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const prompt = (data as { prompt?: unknown }).prompt;
  return typeof prompt === 'string' ? prompt : null;
}

/**
 * True when Fal flagged any image as unsafe.
 */
export function falResultHasNsfw(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const flags = (data as { has_nsfw_concepts?: unknown }).has_nsfw_concepts;
  return Array.isArray(flags) && flags.some((flag) => flag === true);
}

/**
 * True when a returned prompt string is present and omits the product or the place.
 * A payload with no prompt field is left alone.
 */
export function returnedPromptDropsScene(data: unknown, product: string, place: string): boolean {
  const prompt = extractFalReturnedPrompt(data);
  if (prompt == null) return false;
  const haystack = prompt.toLocaleLowerCase('tr');
  const namedProduct = product.trim();
  const namedPlace = place.trim();
  if (namedProduct && !haystack.includes(namedProduct.toLocaleLowerCase('tr'))) return true;
  if (namedPlace && !haystack.includes(namedPlace.toLocaleLowerCase('tr'))) return true;
  return false;
}

/**
 * One subscribe, then one retry with enhancement off when the returned prompt drops the scene.
 * An unsafe result throws before a buffer is used.
 */
export async function subscribeFalStillWithSceneCheck(params: {
  modelId: string;
  product: string;
  place: string;
  buildInput: (enhancePrompt: boolean) => Record<string, unknown>;
  subscribe: (modelId: string, input: Record<string, unknown>) => Promise<FalSubscribeResult>;
}): Promise<{ data: unknown; requestId?: string; attempts: number; enhancePrompt: boolean }> {
  const product = params.product.trim();
  const place = params.place.trim();
  const watchScene = Boolean(product || place);
  let enhancePrompt = !product;
  let lastData: unknown;
  let lastRequestId: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await params.subscribe(params.modelId, params.buildInput(enhancePrompt));
    lastData = result.data;
    lastRequestId = result.requestId;
    if (falResultHasNsfw(result.data)) {
      throw new Error('Fal marked the image unsafe');
    }
    if (!watchScene || !returnedPromptDropsScene(result.data, product, place)) {
      return { data: result.data, requestId: result.requestId, attempts: attempt, enhancePrompt };
    }
    enhancePrompt = false;
  }
  void lastData;
  void lastRequestId;
  throw new Error('Fal prompt dropped the product or the place');
}

/**
 * Fal queue payloads differ by model (images[] vs image, nested output).
 * Exported for Kontext and tests.
 */
export function extractFalResultImageUrl(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const images = d.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (first && typeof first === 'object') {
      const u = (first as { url?: unknown }).url;
      if (typeof u === 'string' && u.length > 0) return u;
    }
  }
  const image = d.image;
  if (image && typeof image === 'object') {
    const u = (image as { url?: unknown }).url;
    if (typeof u === 'string' && u.length > 0) return u;
  }
  const output = d.output;
  if (typeof output === 'string' && /^https?:\/\//i.test(output)) return output;
  if (output && typeof output === 'object') {
    return extractFalResultImageUrl(output);
  }
  return undefined;
}

function extractFalSubscribeRequestId(result: unknown): string | undefined {
  if (result == null || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const id = r.requestId ?? r.request_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Fal may return `sync_mode: true` output as a data URI instead of a hosted URL — fetch() cannot load those.
 */
function bufferFromDataUri(dataUri: string): Buffer | null {
  const t = dataUri.trim();
  if (!t.toLowerCase().startsWith('data:')) return null;
  const comma = t.indexOf(',');
  if (comma === -1) return null;
  const b64 = t.slice(comma + 1);
  if (!b64) return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/** Reject HTML/JSON error bodies that would pass fetch OK but break Sharp (then raw PNG fallback → black UI). */
function looksLikeRasterImageMagic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  return false;
}

/**
 * Downloads raster bytes from a Fal-hosted HTTPS URL or decodes an inline data URI.
 */
export async function downloadFalImageBytes(urlOrData: string): Promise<Buffer> {
  const fromData = bufferFromDataUri(urlOrData);
  if (fromData && fromData.length > 0) {
    if (!looksLikeRasterImageMagic(fromData)) {
      throw new Error('Fal inline data URI is not a recognized raster image');
    }
    return fromData;
  }
  const imgRes = await fetch(urlOrData.trim());
  if (!imgRes.ok) {
    throw new Error(`Failed to download Fal image: HTTP ${imgRes.status}`);
  }
  const arr = await imgRes.arrayBuffer();
  const buf = Buffer.from(arr);
  if (!looksLikeRasterImageMagic(buf)) {
    const head = buf.slice(0, 120).toString('utf8').replace(/\s+/g, ' ').trim();
    throw new Error(
      `Fal download did not return raster image bytes (magic check failed). Body starts: ${head.slice(0, 80)}`,
    );
  }
  return buf;
}

export interface FalStillCallResult {
  buffer: Buffer;
  modelLabel: string;
  falRequestId?: string;
  returnedPrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  nsfw: boolean;
  enhancePrompt: boolean;
  raw?: boolean;
  aspectRatio?: string;
}

function readFalStillFacts(data: unknown): { seed?: number; width?: number; height?: number } {
  if (data == null || typeof data !== 'object') return {};
  const record = data as { seed?: unknown; images?: unknown };
  const seed = typeof record.seed === 'number' && Number.isFinite(record.seed) ? Math.round(record.seed) : undefined;
  const first = Array.isArray(record.images) ? record.images[0] : undefined;
  const image = first && typeof first === 'object' ? (first as { width?: unknown; height?: unknown }) : undefined;
  const width = typeof image?.width === 'number' ? image.width : undefined;
  const height = typeof image?.height === 'number' ? image.height : undefined;
  return { seed, width, height };
}

/**
 * Runs a Fal text-to-image model and returns a raster buffer from the hosted result URL.
 * Pro and Ultra omit guidance, steps, and negative prompt. A size error snaps Pro dimensions.
 * A returned prompt that drops the product or the place is retried once with enhancement off.
 *
 * @param prompt — Full marketing prompt (truncated to 8000 chars for Fal).
 * @param resolution — e.g. `1024x1024`; mapped to `image_size` for Pro and Dev. Ultra uses `aspect_ratio`.
 */
export async function callFalMarketingImageGeneration(
  prompt: string,
  resolution: string,
  options?: FalMarketingImageCallOptions,
): Promise<FalStillCallResult> {
  const key = getFalApiKey();
  if (!key) {
    throw new Error('Set FAL_KEY, FAL_AI_API_KEY, or FALAI_API_KEY');
  }

  fal.config({ credentials: key });

  const referenceRequested = options?.referenceImageUrl?.trim() || '';
  const modelId = resolveFalModelIdForRequest({
    emailCampaign: options?.emailCampaign === true,
    instagramFeed: options?.instagramFeed === true,
    overlayPaperPlane: options?.overlayPaperPlane === true,
    referenceImageUrl: referenceRequested || null,
  });
  const referenceUrl = referenceRequested
    ? await ensurePublicInstagramImageUrl(referenceRequested)
    : undefined;
  const image_size = resolutionToFalImageSize(resolution);
  const negativeFull = mergeFalNegativePromptForRequest(options);
  const devModel = isFluxDevModel(modelId);

  let guidanceScale = parseOptionalPositiveFloat('FAL_FLUX_GUIDANCE_SCALE');
  if (guidanceScale == null && devModel && options?.instagramFeed === true) {
    guidanceScale =
      parseOptionalPositiveFloat('FAL_INSTAGRAM_FLUX_GUIDANCE_SCALE') ?? DEFAULT_INSTAGRAM_FLUX_GUIDANCE;
  }

  let numInferenceSteps = parseOptionalPositiveInt('FAL_FLUX_NUM_INFERENCE_STEPS');
  if (numInferenceSteps == null && devModel && options?.instagramFeed === true) {
    numInferenceSteps =
      parseOptionalPositiveInt('FAL_INSTAGRAM_FLUX_NUM_INFERENCE_STEPS') ?? DEFAULT_INSTAGRAM_FLUX_STEPS;
  }

  const fluxRequestContext: FalFluxRequestContext = {
    instagramFeed: options?.instagramFeed === true,
    emailCampaign: options?.emailCampaign === true,
    overlayPaperPlane: options?.overlayPaperPlane === true,
  };
  const aspectRatio = options?.aspectRatio ?? aspectRatioForFalSize(resolution);

  const buildInput = (enhancePrompt: boolean): Record<string, unknown> =>
    buildFluxFalSubscribeInput(
      modelId,
      prompt,
      image_size,
      {
        negativePrompt: negativeFull,
        guidanceScale: devModel ? guidanceScale : undefined,
        numInferenceSteps: devModel ? numInferenceSteps : undefined,
        seed: options?.falSeed,
        enhancePrompt,
        aspectRatio,
        referenceImageUrl: referenceUrl,
        shopStill: options?.shopStill === true,
        imagePromptStrength: options?.imagePromptStrength,
      },
      fluxRequestContext,
    );

  const subscribeOnce = async (input: Record<string, unknown>): Promise<FalSubscribeResult> => {
    const result = await fal.subscribe(modelId, { input, logs: false });
    return { data: result.data, requestId: extractFalSubscribeRequestId(result) };
  };

  const subscribe = async (
    _modelId: string,
    input: Record<string, unknown>,
  ): Promise<FalSubscribeResult> => {
    try {
      return await subscribeOnce(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const size = input.image_size;
      const needsSnap =
        size != null &&
        typeof size === 'object' &&
        (((size as { width?: number }).width ?? 0) % 64 !== 0 ||
          ((size as { height?: number }).height ?? 0) % 64 !== 0);
      if (needsSnap && /422|400|image_size|dimension|multiple|divisible/i.test(msg)) {
        console.warn('[falImageGeneration] snapping Fal image_size after size error');
        return await subscribeOnce({
          ...input,
          image_size: snapFalImageSize(size as { width: number; height: number }),
        });
      }
      if (devModel && /422|400|validation|unknown|negative|guidance|inference|unexpected/i.test(msg)) {
        console.warn('[falImageGeneration] Retrying Fal Dev with a smaller input after error:', msg.slice(0, 200));
        const minimal = buildFluxFalSubscribeInput(
          modelId,
          prompt,
          image_size,
          options?.falSeed != null ? { seed: options.falSeed } : {},
          fluxRequestContext,
        );
        return await subscribeOnce(minimal);
      }
      throw err;
    }
  };

  const checked = await subscribeFalStillWithSceneCheck({
    modelId,
    product: options?.sceneProduct ?? '',
    place: options?.scenePlace ?? '',
    buildInput,
    subscribe,
  });
  const url = extractFalResultImageUrl(checked.data);
  if (!url) {
    throw new Error('Fal returned no image URL in response');
  }
  const buffer = await downloadFalImageBytes(url);
  const facts = readFalStillFacts(checked.data);
  const returnedPrompt = extractFalReturnedPrompt(checked.data) ?? undefined;
  console.log('[falImageGeneration] fal_subscribe_ok', {
    modelId,
    falRequestId: checked.requestId,
    bufferBytes: buffer.length,
    attempts: checked.attempts,
    enhancePrompt: checked.enhancePrompt,
  });
  return {
    buffer,
    modelLabel: `fal/${modelId}`,
    falRequestId: checked.requestId,
    returnedPrompt,
    seed: facts.seed ?? options?.falSeed,
    width: facts.width,
    height: facts.height,
    nsfw: false,
    enhancePrompt: checked.enhancePrompt,
    ...(isFluxProUltraModel(modelId) && options?.shopStill === true ? { raw: true } : {}),
    ...(isFluxProUltraModel(modelId) ? { aspectRatio } : {}),
  };
}
