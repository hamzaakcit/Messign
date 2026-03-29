// ============================================================================
// Core image generation orchestrator + backend callers
// ============================================================================
// Generates marketing images: Fal (FAL_KEY) first → Gemini (global / Vertex / AI Studio) → OpenAI Images → LiteLLM — then Supabase upload.
// Per-request `skip_fal: true` skips Fal (e.g. overlay policy). Env `IMAGE_GEN_DISABLE_FAL=1` skips Fal globally while keeping Gemini/OpenAI/LiteLLM.
//
// Environment (see also .env.example):
//   FAL_KEY / FAL_AI_API_KEY / FALAI_API_KEY — Fal AI; FAL_IMAGE_MODEL optional (default fal-ai/flux/dev)
//   IMAGE_GEN_DISABLE_FAL — "1"/"true": do not call Fal even if FAL_KEY is set (Gemini/OpenAI/LiteLLM only).
//   IMAGE_GEN_OPENAI_GEMINI_ONLY — "1"/"true": OpenAI + Gemini only (skips Fal and LiteLLM for images)
//   LITELLM_GATEWAY_URL  — optional base, e.g. http://host:4000 (no /v1 required)
//   LITELLM_URL          — fallback if GATEWAY unset; may include /v1
//   LITELLM_MASTER_KEY   — Bearer token for LiteLLM (skipped for images when IMAGE_GEN_OPENAI_GEMINI_ONLY is set)
//   GOOGLE_GEMINI_API_KEY — direct Gemini image gen when LiteLLM is not used or not configured
//   OPENAI_API_KEY — optional; used after Fal + Gemini when set
//   OPENAI_IMAGE_MODEL — optional (default dall-e-3)
//   OPENAI_IMAGE_QUALITY — dall-e-3 only: standard | hd (default hd)
//   OPENAI_IMAGE_STYLE — dall-e-3 only: vivid | natural (optional; API default if unset)
//   GEMINI_IMAGE_GEN_MODEL — optional; if unset, tries several candidate ids
//   IMAGE_GEN_MODEL      — LiteLLM model id (default gemini/gemini-2.0-flash-exp)
//   IMAGE_GEN_DEV_FALLBACK — "true"/"1" → immediate placehold.co
//   IMAGE_GEN_PLACEHOLDER_URL — override placeholder image URL
// ============================================================================

import { randomInt } from 'crypto';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageGenerationMetadata,
} from '../../../../dal/marketing/instagramTypes.js';

import { buildMarketingImageSystemText } from './promptBuilder.js';
import sharp from 'sharp';

import {
  validateImageGenerationInput,
  validateRasterImageBuffer,
  ALLOWED_RESOLUTIONS,
  parseResolutionDimensions,
} from './validation.js';
import {
  estimateRgbMeanLuminance,
  flattenInstagramFeedToOpaqueJpeg,
  flattenKontextToOpaqueJpeg,
  getRasterDimensions,
} from './kontextRasterNormalize.js';
import { buildStorageKey, uploadToStorage } from './storage.js';
import { callFalMarketingImageGeneration, getFalApiKey } from './falImageGeneration.js';
import {
  buildGlobalPublisherGeminiGenerateContentUrl,
  buildVertexGeminiGenerateContentUrl,
  getGlobalAiplatformApiKey,
  getVertexAccessToken,
  getVertexLocation,
  getVertexProjectId,
} from './vertexGeminiAuth.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL ?? 'gemini/gemini-2.0-flash-exp';

const LITELLM_API_KEY = process.env.LITELLM_MASTER_KEY?.trim() ?? '';

/** Direct Google AI Studio / Gemini API key — used when LiteLLM is unavailable. */
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY?.trim() ?? '';

/** Read at call time so tests and late env injection see current `process.env`. */
function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

function getOpenAiImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || 'dall-e-3';
}

/** DALL·E 3 only: `hd` = finer detail (default for marketing); `standard` = faster/cheaper. */
function getOpenAiImageQualityForDalle3(): 'standard' | 'hd' {
  const q = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  return q === 'standard' ? 'standard' : 'hd';
}

/** DALL·E 3 only: optional `vivid` | `natural`; unset = API default (vivid). */
function getOpenAiImageStyleForDalle3(): 'vivid' | 'natural' | undefined {
  const s = process.env.OPENAI_IMAGE_STYLE?.trim().toLowerCase();
  if (s === 'vivid' || s === 'natural') return s;
  return undefined;
}

/**
 * Preferred native `generateContent` model (IMAGE modality). If unset,
 * {@link geminiImageModelCandidates} tries several ids.
 */
const GEMINI_IMAGE_GEN_MODEL_EXPLICIT = process.env.GEMINI_IMAGE_GEN_MODEL?.trim() ?? '';

/** Comma-separated extra model ids after the primary (explicit or default). */
function parseGeminiImageGenModelFallbacks(): string[] {
  const raw = process.env.GEMINI_IMAGE_GEN_MODEL_FALLBACKS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Native `generateContent` models that return IMAGE bytes (not text/tool JSON).
 * Default is a single id: `gemini-2.0-flash-preview-image-generation`. Older Flash
 * aliases (`gemini-2.0-flash`, `gemini-flash-latest`, …) typically return 400
 * (“does not support response modalities”) or prose instead of inline images — iterating
 * them wasted minutes and log noise before OpenAI fallback.
 */
function geminiImageModelCandidates(): string[] {
  if (GEMINI_IMAGE_GEN_MODEL_EXPLICIT) {
    return dedupeModelIds([
      GEMINI_IMAGE_GEN_MODEL_EXPLICIT,
      ...parseGeminiImageGenModelFallbacks(),
    ]);
  }
  return dedupeModelIds([
    'gemini-2.0-flash-preview-image-generation',
    ...parseGeminiImageGenModelFallbacks(),
  ]);
}

/** Vertex publishers/google/models ids — same defaults as AI Studio unless GEMINI_VERTEX_IMAGE_MODEL is set. */
function vertexGeminiImageModelCandidates(): string[] {
  const explicit = process.env.GEMINI_VERTEX_IMAGE_MODEL?.trim() || GEMINI_IMAGE_GEN_MODEL_EXPLICIT;
  if (explicit) return [explicit];
  return geminiImageModelCandidates();
}

const MAX_RETRIES = 2;
const GENERATION_TIMEOUT_MS = 60_000;

/** Lower variance — reduces tool-style / prose "plans" instead of image output. */
const IMAGE_GEN_TEMPERATURE = 0.25;

// ---------------------------------------------------------------------------
// Dev fallback helpers
// ---------------------------------------------------------------------------

function isExplicitImageGenDevFallback(): boolean {
  const v = process.env.IMAGE_GEN_DEV_FALLBACK?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Sprint 3: placehold.co URL with prompt snippet (no LiteLLM/Supabase required when dev fallback is on).
 */
export function buildDevPlaceholderImageUrl(prompt: string): string {
  const custom = process.env.IMAGE_GEN_PLACEHOLDER_URL?.trim();
  if (custom) return custom;
  const slice = (prompt?.trim() || 'Instagram').slice(0, 40);
  return `https://placehold.co/1024x1024/1a1a2e/c084fc/png?text=${encodeURIComponent(slice)}`;
}

function isDevPlaceholderFallbackEnabled(): boolean {
  const v = process.env.IMAGE_GEN_DEV_FALLBACK?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * OpenAI-style chat completions URL for LiteLLM.
 * Prefer LITELLM_GATEWAY_URL; else LITELLM_URL (same as services/ai/gateway.ts).
 */
function getLiteLLMChatCompletionsUrl(): string {
  const gw = process.env.LITELLM_GATEWAY_URL?.trim();
  if (gw) {
    const base = gw.replace(/\/+$/, '');
    return base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  }
  const url = process.env.LITELLM_URL?.trim() ?? '';
  if (!url) return 'http://localhost:4000/v1/chat/completions';
  const base = url.replace(/\/+$/, '');
  return base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function hasLiteLLMCredentials(): boolean {
  return Boolean(LITELLM_API_KEY);
}

/**
 * When set, marketing images use only OpenAI Images and Gemini paths — not LiteLLM or Fal.
 * Other features (chat gateway, embeddings) are unaffected.
 */
function isOpenAiGeminiImageOnlyMode(): boolean {
  const v = process.env.IMAGE_GEN_OPENAI_GEMINI_ONLY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * After Fal (or when Fal is skipped), run OpenAI Images before Vertex/Gemini when both are configured.
 * Cuts latency when Gemini models 404 or return NO_IMAGE (common) and OpenAI is the reliable path.
 */
function isOpenAiBeforeGeminiImage(): boolean {
  const v = process.env.IMAGE_GEN_OPENAI_BEFORE_GEMINI?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** LiteLLM chat completions for images — disabled in OpenAI+Gemini-only mode. */
function useLiteLLMForImages(): boolean {
  return hasLiteLLMCredentials() && !isOpenAiGeminiImageOnlyMode();
}

function hasDirectGeminiImageCredentials(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/** Global aiplatform ?key=, regional Vertex OAuth, or Gemini AI Studio — at least one path available. */
function hasGeminiImageBackend(): boolean {
  return Boolean(getGlobalAiplatformApiKey()) || Boolean(getVertexProjectId()) || hasDirectGeminiImageCredentials();
}

function hasOpenAiImageCredentials(): boolean {
  return Boolean(getOpenAiApiKey());
}

/**
 * Fal is the default first backend when `FAL_KEY` (or alias) is set.
 * Skipped when: `IMAGE_GEN_OPENAI_GEMINI_ONLY`, `IMAGE_GEN_DISABLE_FAL`, or per-request `skip_fal`.
 */
function isFalDisabledByEnv(): boolean {
  const v = process.env.IMAGE_GEN_DISABLE_FAL?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function useFalForImages(): boolean {
  return (
    Boolean(getFalApiKey()) &&
    !isOpenAiGeminiImageOnlyMode() &&
    !isFalDisabledByEnv()
  );
}

function hasAnyImageBackend(): boolean {
  return (
    useLiteLLMForImages() ||
    hasGeminiImageBackend() ||
    useFalForImages() ||
    hasOpenAiImageCredentials()
  );
}

function imageBackendMissingHint(): string {
  if (isOpenAiGeminiImageOnlyMode()) {
    return 'No image backend: set OPENAI_API_KEY and/or Vertex (VERTEX_AI_PROJECT + ADC) or GOOGLE_GEMINI_API_KEY (IMAGE_GEN_OPENAI_GEMINI_ONLY disables LiteLLM and Fal for images)';
  }
  return 'No image backend: set OPENAI_API_KEY, FAL_KEY / FALAI_API_KEY (Fal AI), LITELLM_MASTER_KEY (LiteLLM), GEMINI_AIPLATFORM_API_KEY, Vertex, or GOOGLE_GEMINI_API_KEY';
}

function imageBackendMissingError(): string {
  if (isOpenAiGeminiImageOnlyMode()) {
    return 'Image generation requires OPENAI_API_KEY and/or Vertex / Gemini (see IMAGE_GEN_OPENAI_GEMINI_ONLY) — no backend is set';
  }
  return 'Image generation requires OPENAI_API_KEY, FAL_KEY (or FALAI_API_KEY), LITELLM_MASTER_KEY, Vertex, or GOOGLE_GEMINI_API_KEY — none are set';
}

/** Returns `success: true` + `image_url` so marketing orchestration continues when no backend (dev). */
function devPlaceholderResult(
  input: ImageGenerationInput,
  startMs: number,
  reason: string,
): ImageGenerationResult {
  const url = buildDevPlaceholderImageUrl(input.prompt);
  const metadata: ImageGenerationMetadata = {
    model: 'dev-fallback',
    resolution: input.resolution ?? '1024x1024',
    retries: 0,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
    dev_placeholder: true,
  };
  console.warn('[imageService] Dev placeholder image (workflow continues)', {
    content_id: input.content_id,
    reason,
    url,
  });
  return {
    success: true,
    image_url: url,
    storage_key: null,
    metadata,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Response extractors
// ---------------------------------------------------------------------------

function isValidBase64(str: string): boolean {
  if (str.length < 100) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(str.slice(0, 200));
}

/**
 * Extracts base64 image data from various response formats.
 * Gemini via LiteLLM can return images in several structures.
 */
function extractImageFromResponse(data: unknown): string | null {
  const d = data as {
    choices?: Array<{
      message?: {
        content?: string | Array<Record<string, unknown>>;
      };
    }>;
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const choices = d?.choices ?? [];
  for (const choice of choices) {
    const message = choice?.message;

    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === 'image' && (part as { source?: { data?: string } }).source?.data) {
          return (part as { source: { data: string } }).source.data;
        }
        if ((part as { inline_data?: { data?: string } })?.inline_data?.data) {
          return (part as { inline_data: { data: string } }).inline_data.data;
        }
        if (
          part?.type === 'image_url' &&
          (part as { image_url?: { url?: string } }).image_url?.url?.startsWith('data:image')
        ) {
          return (part as { image_url: { url: string } }).image_url.url.split(',')[1] ?? null;
        }
      }
    }

    if (typeof message?.content === 'string' && message.content.length > 1000) {
      const cleaned = message.content.replace(/^data:image\/\w+;base64,/, '');
      if (isValidBase64(cleaned)) {
        return cleaned;
      }
    }
  }

  if (Array.isArray(d?.data)) {
    for (const item of d.data) {
      if (item?.b64_json) return item.b64_json;
      if (item?.url?.startsWith('data:image')) {
        return item.url.split(',')[1] ?? null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Gemini response helpers
// ---------------------------------------------------------------------------

function extractInlineImageBase64FromGemini(data: unknown): string | null {
  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<Record<string, unknown>> };
    }>;
  };
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline =
      (part as { inlineData?: { data?: string } }).inlineData ??
      (part as { inline_data?: { data?: string } }).inline_data;
    if (inline?.data && typeof inline.data === 'string') {
      return inline.data;
    }
  }
  return null;
}

function extractGeminiTextFromCandidates(data: unknown): string {
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
  };
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    const txt = (part as { text?: string }).text;
    if (typeof txt === 'string' && txt.length) texts.push(txt);
  }
  return texts.join('\n');
}

/**
 * Gemini 3 Flash sometimes returns JSON text with `action: "dalle.text2im"` instead of inline image bytes.
 * Parse the nested prompt when present.
 * @internal exported for unit tests
 */
export function extractDalleStylePromptFromGeminiText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const tryParse = (raw: string): string | null => {
    try {
      const parsed = JSON.parse(raw) as {
        action?: string;
        action_input?: string;
      };
      if (parsed?.action === 'dalle.text2im' && typeof parsed.action_input === 'string') {
        const inner = JSON.parse(parsed.action_input) as { prompt?: string };
        if (typeof inner?.prompt === 'string' && inner.prompt.length > 10) return inner.prompt;
      }
    } catch {
      /* try next */
    }
    return null;
  };

  const fromOuter = tryParse(t);
  if (fromOuter) return fromOuter;

  const unescaped = t.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (unescaped !== t) {
    const fromInner = tryParse(unescaped);
    if (fromInner) return fromInner;
  }

  const m = t.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }

  return null;
}

function getGeminiFinishReason(data: unknown): string | null {
  const d = data as { candidates?: Array<{ finishReason?: string }> };
  return d?.candidates?.[0]?.finishReason ?? null;
}

function looksLikeGeminiToolImageJson(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes('dalle.text2im')) return true;
  if (/["']action["']\s*:\s*["'][^"']*dalle/i.test(t)) return true;
  return false;
}

/**
 * When Gemini returns NO_IMAGE or tool-style JSON instead of bytes, skip the second modality
 * attempt and go straight to OpenAI (caller must check getOpenAiApiKey()).
 * @internal exported for unit tests
 */
export function shouldOpenAiFastPathAfterGeminiNoImage(data: unknown, geminiText: string): boolean {
  if (getGeminiFinishReason(data) === 'NO_IMAGE') return true;
  if (geminiText && extractDalleStylePromptFromGeminiText(geminiText)) return true;
  if (looksLikeGeminiToolImageJson(geminiText)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Backend: OpenAI Images
// ---------------------------------------------------------------------------

/**
 * DALL·E and some Gemini paths emit 1024² max; Instagram asks for 1080² — upscale so previews are not soft 1024→1080 browser scales.
 */
async function upscaleRasterToTargetDimensions(
  buffer: Buffer,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return buffer;
  if (meta.width === targetW && meta.height === targetH) return buffer;
  if (meta.width >= targetW && meta.height >= targetH) return buffer;
  return sharp(buffer)
    .resize(targetW, targetH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

function openaiImageSizeFromResolution(resolution: string): '1024x1024' | '1024x1792' | '1792x1024' {
  const r = resolution.toLowerCase();
  if (r.includes('1792') && r.includes('1024')) {
    if (r.startsWith('1792') || r.indexOf('1792') < r.indexOf('1024')) return '1792x1024';
    return '1024x1792';
  }
  return '1024x1024';
}

async function callOpenAIImagesGeneration(
  imagePrompt: string,
  resolution: string,
  stylePreset?: ImageGenerationInput['style_preset'],
): Promise<Buffer> {
  const openaiKey = getOpenAiApiKey();
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const size = openaiImageSizeFromResolution(resolution);
  const prompt = imagePrompt.slice(0, 4000);
  const model = getOpenAiImageModel();
  const payload: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size,
    response_format: 'b64_json',
  };
  if (model === 'dall-e-3') {
    payload.quality = getOpenAiImageQualityForDalle3();
    const style = stylePreset === 'photoreal' ? 'natural' : getOpenAiImageStyleForDalle3();
    if (style) payload.style = style;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const bodyText = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`OpenAI images ${response.status}: ${bodyText.slice(0, 400)}`);
    }

    const data = JSON.parse(bodyText) as { data?: Array<{ b64_json?: string }> };
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI images: no b64_json in response');
    }
    return Buffer.from(b64, 'base64');
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Backend: LiteLLM /v1/chat/completions
// ---------------------------------------------------------------------------

async function callImageModelLiteLLM(
  prompt: string,
  resolution: string,
  stylePreset?: ImageGenerationInput['style_preset'],
): Promise<Buffer> {
  const url = getLiteLLMChatCompletionsUrl();

  const systemPrompt = buildMarketingImageSystemText(resolution, undefined, { style_preset: stylePreset });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LITELLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1,
          response_modalities: ['IMAGE', 'TEXT'],
          generation_config: {
            response_mime_type: 'image/png',
          },
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const name = fetchErr instanceof Error ? fetchErr.name : 'Error';
      console.error('[imageService] fetch failed (network / DNS / TLS)', {
        url,
        errorName: name,
        message: msg,
        hint: 'Check LITELLM_GATEWAY_URL or LITELLM_URL, and that LiteLLM is running/reachable',
      });
      throw fetchErr instanceof Error ? fetchErr : new Error(msg);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[imageService] LiteLLM HTTP error', {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorBody.slice(0, 800),
      });
      throw new Error(
        `LiteLLM ${response.status} ${response.statusText}: ${errorBody.slice(0, 400)}`,
      );
    }

    const data: unknown = await response.json();

    const imageContent = extractImageFromResponse(data);
    if (!imageContent) {
      throw new Error('No image content found in model response');
    }

    return Buffer.from(imageContent, 'base64');
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Backend: Global Publisher API — aiplatform.googleapis.com/v1/publishers/google/models/...?key=
// (same multimodal generateContent as curl; highest priority when GEMINI_AIPLATFORM_API_KEY is set)
// ---------------------------------------------------------------------------

async function callGlobalAiplatformGeminiNativeImageSingleModel(
  prompt: string,
  resolution: string,
  modelId: string,
  apiKey: string,
  skipOpenAiFallback = false,
  stylePreset?: ImageGenerationInput['style_preset'],
): Promise<{ buffer: Buffer; label: string }> {
  const modalityChains: Array<Array<'TEXT' | 'IMAGE'>> = [['IMAGE'], ['TEXT', 'IMAGE']];
  let lastErr: Error | null = null;
  let bestRefinedPrompt: string | null = null;

  for (let mi = 0; mi < modalityChains.length; mi++) {
    const responseModalities = modalityChains[mi]!;
    const url = buildGlobalPublisherGeminiGenerateContentUrl(modelId, apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildMarketingImageSystemText(resolution, undefined, { style_preset: stylePreset }) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities,
            temperature: IMAGE_GEN_TEMPERATURE,
          },
        }),
        signal: controller.signal,
      });

      const errText = response.ok ? '' : await response.text().catch(() => '');

      if (!response.ok) {
        console.warn('[imageService] Global aiplatform (API key) HTTP error', {
          model: modelId,
          responseModalities,
          status: response.status,
          bodyPreview: errText.slice(0, 600),
        });
        lastErr = new Error(`Global aiplatform Gemini ${response.status}: ${errText.slice(0, 400)}`);
        if (isGeminiModalityError(response.status, errText) && mi < modalityChains.length - 1) {
          continue;
        }
        throw lastErr;
      }

      const data: unknown = await response.json();
      const b64 = extractInlineImageBase64FromGemini(data);
      if (b64) {
        return { buffer: Buffer.from(b64, 'base64'), label: `aiplatform/${modelId}` };
      }

      const geminiText = extractGeminiTextFromCandidates(data);
      const refined = geminiText ? extractDalleStylePromptFromGeminiText(geminiText) : null;
      if (refined && refined.length > (bestRefinedPrompt?.length ?? 0)) {
        bestRefinedPrompt = refined;
      }

      console.warn('[imageService] Global aiplatform: no image in response', {
        model: modelId,
        responseModalities,
        preview: JSON.stringify(data).slice(0, 800),
      });
      lastErr = new Error(
        'Global aiplatform returned no inline image — set GEMINI_VERTEX_IMAGE_MODEL or GEMINI_IMAGE_GEN_MODEL',
      );
      if (
        getOpenAiApiKey() &&
        !skipOpenAiFallback &&
        shouldOpenAiFastPathAfterGeminiNoImage(data, geminiText) &&
        mi < modalityChains.length - 1
      ) {
        console.warn(
          '[imageService] Global aiplatform NO_IMAGE; fast-path to OpenAI (skip modality retry)',
          {
            model: modelId,
            finishReason: getGeminiFinishReason(data) ?? undefined,
          },
        );
        break;
      }
      if (mi < modalityChains.length - 1) continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  const openaiPrompt = bestRefinedPrompt ?? prompt;
  if (getOpenAiApiKey() && !skipOpenAiFallback) {
    try {
      console.warn('[imageService] Global aiplatform returned no inline image; trying OpenAI images fallback', {
        model: modelId,
        openaiModel: getOpenAiImageModel(),
        usedRefinedPrompt: Boolean(bestRefinedPrompt),
      });
      const buffer = await callOpenAIImagesGeneration(openaiPrompt, resolution, stylePreset);
      return { buffer, label: `openai/${getOpenAiImageModel()}` };
    } catch (openaiErr) {
      console.error('[imageService] OpenAI images fallback failed (after global aiplatform)', {
        model: modelId,
        message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
      });
    }
  }

  throw lastErr ?? new Error('Global aiplatform Gemini image generation failed for this model');
}

// ---------------------------------------------------------------------------
// Backend: Vertex AI Gemini — {location}-aiplatform.googleapis.com (regional OAuth)
// ---------------------------------------------------------------------------

async function callVertexGeminiNativeImageSingleModel(
  prompt: string,
  resolution: string,
  modelId: string,
  accessToken: string,
  skipOpenAiFallback = false,
  stylePreset?: ImageGenerationInput['style_preset'],
): Promise<{ buffer: Buffer; label: string }> {
  const projectId = getVertexProjectId();
  if (!projectId) {
    throw new Error('VERTEX_AI_PROJECT (or GOOGLE_CLOUD_PROJECT) is not set');
  }
  const location = getVertexLocation();
  const modalityChains: Array<Array<'TEXT' | 'IMAGE'>> = [['IMAGE'], ['TEXT', 'IMAGE']];
  let lastErr: Error | null = null;
  let bestRefinedPrompt: string | null = null;

  for (let mi = 0; mi < modalityChains.length; mi++) {
    const responseModalities = modalityChains[mi]!;
    const url = buildVertexGeminiGenerateContentUrl(projectId, location, modelId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildMarketingImageSystemText(resolution, undefined, { style_preset: stylePreset }) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities,
            temperature: IMAGE_GEN_TEMPERATURE,
          },
        }),
        signal: controller.signal,
      });

      const errText = response.ok ? '' : await response.text().catch(() => '');

      if (!response.ok) {
        console.warn('[imageService] Vertex Gemini HTTP error', {
          model: modelId,
          responseModalities,
          status: response.status,
          bodyPreview: errText.slice(0, 600),
        });
        lastErr = new Error(`Vertex Gemini ${response.status}: ${errText.slice(0, 400)}`);
        if (isGeminiModalityError(response.status, errText) && mi < modalityChains.length - 1) {
          continue;
        }
        throw lastErr;
      }

      const data: unknown = await response.json();
      const b64 = extractInlineImageBase64FromGemini(data);
      if (b64) {
        return { buffer: Buffer.from(b64, 'base64'), label: `vertex/${modelId}` };
      }

      const geminiText = extractGeminiTextFromCandidates(data);
      const refined = geminiText ? extractDalleStylePromptFromGeminiText(geminiText) : null;
      if (refined && refined.length > (bestRefinedPrompt?.length ?? 0)) {
        bestRefinedPrompt = refined;
      }

      console.warn('[imageService] Vertex Gemini: no image in response', {
        model: modelId,
        responseModalities,
        preview: JSON.stringify(data).slice(0, 800),
      });
      lastErr = new Error(
        'Vertex Gemini returned no inline image — set GEMINI_VERTEX_IMAGE_MODEL or GEMINI_IMAGE_GEN_MODEL',
      );
      if (
        getOpenAiApiKey() &&
        !skipOpenAiFallback &&
        shouldOpenAiFastPathAfterGeminiNoImage(data, geminiText) &&
        mi < modalityChains.length - 1
      ) {
        console.warn(
          '[imageService] Vertex Gemini NO_IMAGE; fast-path to OpenAI (skip modality retry)',
          {
            model: modelId,
            finishReason: getGeminiFinishReason(data) ?? undefined,
          },
        );
        break;
      }
      if (mi < modalityChains.length - 1) continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  const openaiPrompt = bestRefinedPrompt ?? prompt;
  if (getOpenAiApiKey() && !skipOpenAiFallback) {
    try {
      console.warn('[imageService] Vertex Gemini returned no inline image; trying OpenAI images fallback', {
        model: modelId,
        openaiModel: getOpenAiImageModel(),
        usedRefinedPrompt: Boolean(bestRefinedPrompt),
      });
      const buffer = await callOpenAIImagesGeneration(openaiPrompt, resolution, stylePreset);
      return { buffer, label: `openai/${getOpenAiImageModel()}` };
    } catch (openaiErr) {
      console.error('[imageService] OpenAI images fallback failed (after Vertex)', {
        model: modelId,
        message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
      });
    }
  }

  throw lastErr ?? new Error('Vertex Gemini image generation failed for this model');
}

// ---------------------------------------------------------------------------
// Backend: Direct Gemini — generativelanguage.googleapis.com (AI Studio API key)
// ---------------------------------------------------------------------------

type GeminiNativeImageOptions = {
  /**
   * When true, Gemini does not call OpenAI internally — use when OpenAI is the explicit next step
   * at the top level (Gemini-first routing).
   */
  skipOpenAiFallback?: boolean;
  /** Passed to system instructions (e.g. photoreal) and OpenAI fallback styling. */
  stylePreset?: ImageGenerationInput['style_preset'];
};

async function callGeminiNativeImageGeneration(
  prompt: string,
  resolution: string,
  options?: GeminiNativeImageOptions,
): Promise<{ buffer: Buffer; modelId: string }> {
  const skipOpenAiFallback = options?.skipOpenAiFallback ?? false;
  const stylePreset = options?.stylePreset;

  const globalApiKey = getGlobalAiplatformApiKey();
  if (globalApiKey) {
    const gCandidates = vertexGeminiImageModelCandidates();
    let lastGlobalErr: Error | null = null;
    for (let i = 0; i < gCandidates.length; i++) {
      const modelId = gCandidates[i]!;
      try {
        const { buffer, label } = await callGlobalAiplatformGeminiNativeImageSingleModel(
          prompt,
          resolution,
          modelId,
          globalApiKey,
          skipOpenAiFallback,
          stylePreset,
        );
        return { buffer, modelId: label };
      } catch (err) {
        lastGlobalErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastGlobalErr.message;
        const notFound =
          msg.includes('404') || msg.includes('NOT_FOUND') || /not found for API version/i.test(msg);
        const noImage = msg.includes('no inline image');
        const modalityUnsupported =
          msg.includes('does not support the requested response modalities') ||
          msg.includes('INVALID_ARGUMENT');
        const canTryNext =
          i < gCandidates.length - 1 && (notFound || noImage || modalityUnsupported);
        if (canTryNext) {
          console.warn(`[imageService] Global aiplatform: model ${modelId} failed, trying next candidate`, {
            detail: msg.slice(0, 200),
          });
          continue;
        }
        break;
      }
    }
    if (lastGlobalErr) {
      console.warn('[imageService] Global aiplatform (API key) failed; trying regional Vertex / AI Studio', {
        message: lastGlobalErr.message.slice(0, 240),
      });
    }
  }

  const vertexProject = getVertexProjectId();
  if (vertexProject) {
    const token = await getVertexAccessToken();
    if (token) {
      const vCandidates = vertexGeminiImageModelCandidates();
      let lastVertexErr: Error | null = null;
      for (let i = 0; i < vCandidates.length; i++) {
        const modelId = vCandidates[i]!;
        try {
          const { buffer, label } = await callVertexGeminiNativeImageSingleModel(
            prompt,
            resolution,
            modelId,
            token,
            skipOpenAiFallback,
            stylePreset,
          );
          return { buffer, modelId: label };
        } catch (err) {
          lastVertexErr = err instanceof Error ? err : new Error(String(err));
          const msg = lastVertexErr.message;
          const notFound =
            msg.includes('404') || msg.includes('NOT_FOUND') || /not found for API version/i.test(msg);
          const noImage = msg.includes('no inline image');
          const modalityUnsupported =
            msg.includes('does not support the requested response modalities') ||
            msg.includes('INVALID_ARGUMENT');
          const canTryNext =
            i < vCandidates.length - 1 && (notFound || noImage || modalityUnsupported);
          if (canTryNext) {
            console.warn(`[imageService] Vertex Gemini: model ${modelId} failed, trying next candidate`, {
              detail: msg.slice(0, 200),
            });
            continue;
          }
          break;
        }
      }
      if (GEMINI_API_KEY) {
        console.warn('[imageService] Vertex Gemini failed; falling back to Gemini AI Studio', {
          message: lastVertexErr?.message?.slice(0, 240),
        });
      } else {
        throw lastVertexErr ?? new Error('Vertex Gemini image generation failed');
      }
    } else {
      console.warn(
        '[imageService] VERTEX_AI_PROJECT is set but no OAuth token — set VERTEX_AI_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS; trying Gemini AI Studio if configured',
      );
    }
  }

  if (!GEMINI_API_KEY) {
    if (vertexProject) {
      throw new Error(
        'Vertex Gemini failed or unavailable and GOOGLE_GEMINI_API_KEY is not set for Gemini AI Studio fallback',
      );
    }
    throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
  }

  const candidates = geminiImageModelCandidates();
  let lastErr: Error | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i]!;
    try {
      const { buffer, label } = await callGeminiNativeImageSingleModel(
        prompt,
        resolution,
        modelId,
        skipOpenAiFallback,
        stylePreset,
      );
      return { buffer, modelId: label };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      const notFound =
        msg.includes('404') || msg.includes('NOT_FOUND') || /not found for API version/i.test(msg);
      const noImage = msg.includes('no inline image');
      const modalityUnsupported =
        msg.includes('does not support the requested response modalities') || msg.includes('INVALID_ARGUMENT');
      const canTryNext =
        i < candidates.length - 1 && (notFound || noImage || modalityUnsupported);
      if (canTryNext) {
        console.warn(`[imageService] Gemini direct: model ${modelId} failed, trying next candidate`, {
          detail: msg.slice(0, 200),
        });
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ?? new Error('Gemini image generation failed');
}

function isGeminiModalityError(status: number, errText: string): boolean {
  if (status !== 400) return false;
  return (
    errText.includes('response modalities') ||
    errText.includes('INVALID_ARGUMENT') ||
    errText.includes('does not support')
  );
}

async function callGeminiNativeImageSingleModel(
  prompt: string,
  resolution: string,
  modelId: string,
  skipOpenAiFallback = false,
  stylePreset?: ImageGenerationInput['style_preset'],
): Promise<{ buffer: Buffer; label: string }> {
  /** Many models accept IMAGE-only; some expect TEXT+IMAGE. Try both before failing the model id. */
  const modalityChains: Array<Array<'TEXT' | 'IMAGE'>> = [['IMAGE'], ['TEXT', 'IMAGE']];
  let lastErr: Error | null = null;
  let bestRefinedPrompt: string | null = null;

  for (let mi = 0; mi < modalityChains.length; mi++) {
    const responseModalities = modalityChains[mi]!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId,
    )}:generateContent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildMarketingImageSystemText(resolution, undefined, { style_preset: stylePreset }) }],
          },
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities,
            temperature: IMAGE_GEN_TEMPERATURE,
          },
        }),
        signal: controller.signal,
      });

      const errText = response.ok ? '' : await response.text().catch(() => '');

      if (!response.ok) {
        console.warn('[imageService] Gemini direct HTTP error', {
          model: modelId,
          responseModalities,
          status: response.status,
          bodyPreview: errText.slice(0, 600),
        });
        lastErr = new Error(`Gemini image ${response.status}: ${errText.slice(0, 400)}`);
        if (isGeminiModalityError(response.status, errText) && mi < modalityChains.length - 1) {
          continue;
        }
        throw lastErr;
      }

      const data: unknown = await response.json();
      const b64 = extractInlineImageBase64FromGemini(data);
      if (b64) {
        return { buffer: Buffer.from(b64, 'base64'), label: modelId };
      }

      const geminiText = extractGeminiTextFromCandidates(data);
      const refined = geminiText ? extractDalleStylePromptFromGeminiText(geminiText) : null;
      if (refined && refined.length > (bestRefinedPrompt?.length ?? 0)) {
        bestRefinedPrompt = refined;
      }

      console.warn('[imageService] Gemini direct: no image in response', {
        model: modelId,
        responseModalities,
        preview: JSON.stringify(data).slice(0, 800),
      });
      lastErr = new Error(
        'Gemini returned no inline image — set GEMINI_IMAGE_GEN_MODEL to a model that supports IMAGE output',
      );
      if (
        getOpenAiApiKey() &&
        !skipOpenAiFallback &&
        shouldOpenAiFastPathAfterGeminiNoImage(data, geminiText) &&
        mi < modalityChains.length - 1
      ) {
        console.warn(
          '[imageService] Gemini NO_IMAGE or tool-style JSON; fast-path to OpenAI (skip modality retry)',
          {
            model: modelId,
            finishReason: getGeminiFinishReason(data) ?? undefined,
          },
        );
        break;
      }
      if (mi < modalityChains.length - 1) continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  const openaiPrompt = bestRefinedPrompt ?? prompt;
  if (getOpenAiApiKey() && !skipOpenAiFallback) {
    try {
      console.warn('[imageService] Gemini returned no inline image; trying OpenAI images fallback', {
        model: modelId,
        openaiModel: getOpenAiImageModel(),
        usedRefinedPrompt: Boolean(bestRefinedPrompt),
      });
      const buffer = await callOpenAIImagesGeneration(openaiPrompt, resolution, stylePreset);
      return { buffer, label: `openai/${getOpenAiImageModel()}` };
    } catch (openaiErr) {
      console.error('[imageService] OpenAI images fallback failed', {
        model: modelId,
        message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
      });
    }
  }

  throw lastErr ?? new Error('Gemini image generation failed for this model');
}

// ---------------------------------------------------------------------------
// Core: generateImage
// ---------------------------------------------------------------------------

export async function generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  const startMs = Date.now();

  console.log('[imageService] generate_start', {
    content_id: input.content_id,
    org_id: input.org_id?.slice(0, 8),
    resolution: input.resolution ?? '1024x1024',
    style_preset: input.style_preset,
    promptPreview: input.prompt?.slice(0, 100),
    instagram_fal_only: input.instagram_feed && input.instagram_fal_only === true,
    instagram_direct_prompt: input.instagram_direct_prompt === true,
    /** True when step 1 will call Fal (Flux) before any Gemini/OpenAI path. */
    fal_first:
      useFalForImages() && input.skip_fal !== true,
    backends: {
      openai: hasOpenAiImageCredentials(),
      litellm: useLiteLLMForImages(),
      litellm_key_present: hasLiteLLMCredentials(),
      openai_gemini_only: isOpenAiGeminiImageOnlyMode(),
      fal_disabled_by_env: isFalDisabledByEnv(),
      global_aiplatform_key: Boolean(getGlobalAiplatformApiKey()),
      vertex_project: Boolean(getVertexProjectId()),
      gemini_studio: hasDirectGeminiImageCredentials(),
      gemini_any: hasGeminiImageBackend(),
      fal: useFalForImages(),
      devFallback: isDevPlaceholderFallbackEnabled(),
    },
  });

  const validated = validateImageGenerationInput(input);
  if (!validated.ok) {
    console.warn('[imageService] validation_failed', {
      content_id: input.content_id,
      error: validated.error,
    });
    const resolution = input.resolution ?? '1024x1024';
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: {
        model: IMAGE_MODEL,
        resolution: ALLOWED_RESOLUTIONS.has(resolution) ? resolution : '1024x1024',
        retries: 0,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
      },
      error: validated.error,
    };
  }

  const normalized = validated.normalized;
  const resolution = normalized.resolution ?? '1024x1024';
  let lastError = '';

  const instagramFalOnlyMode =
    normalized.instagram_feed === true && normalized.instagram_fal_only === true;

  if (instagramFalOnlyMode && !useFalForImages()) {
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: {
        model: IMAGE_MODEL,
        resolution,
        retries: 0,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
      },
      error:
        'Instagram Fal-only generation requires FAL_KEY (or FAL_AI_API_KEY / FALAI_API_KEY). IMAGE_GEN_OPENAI_GEMINI_ONLY=1 disables Fal.',
    };
  }

  if (isExplicitImageGenDevFallback() && !instagramFalOnlyMode) {
    const url = buildDevPlaceholderImageUrl(normalized.prompt);
    console.log('[IMG] Dev fallback — returning placeholder for:', normalized.content_id);
    return {
      success: true,
      image_url: url,
      storage_key: null,
      metadata: {
        model: 'dev-fallback',
        resolution,
        retries: 0,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        dev_placeholder: true,
      },
    };
  }

  if (!hasAnyImageBackend() && isDevPlaceholderFallbackEnabled()) {
    return devPlaceholderResult(normalized, startMs, imageBackendMissingHint());
  }

  if (!hasAnyImageBackend()) {
    const metadata: ImageGenerationMetadata = {
      model: IMAGE_MODEL,
      resolution,
      retries: 0,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startMs,
    };
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata,
      error: imageBackendMissingError(),
    };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let imageBuffer: Buffer | undefined;
      let generationModel: string | undefined;
      /** Set on every success path before use (Fal, Gemini paths, OpenAI, or LiteLLM). */
      let backend:
        | 'openai'
        | 'litellm'
        | 'gemini_direct'
        | 'vertex_gemini'
        | 'aiplatform_global'
        | 'fal'
        | undefined;

      let geminiFailed = false;
      let openaiFailed = false;
      let falRequestId: string | undefined;
      /** True when raw Fal PNG had ~0 luminance but we kept it (alpha/stats quirk). Used to skip slow post-JPEG dark fallback. */
      let falInstagramKeptDespiteUnreliableRawLum = false;

      // 1) Fal AI first (Flux, etc.) — default when FAL_KEY is set; see `useFalForImages()` / IMAGE_GEN_DISABLE_FAL.
      //    Per-request skip_fal: true skips Fal (e.g. paper-plane overlay policy).
      if (useFalForImages() && !normalized.skip_fal) {
        try {
          const out = await callFalMarketingImageGeneration(normalized.prompt, resolution, {
            emailCampaign: normalized.email_campaign,
            technicalPlatformTopic: normalized.technical_platform_topic,
            falNegativePrompt: normalized.fal_negative_prompt,
            instagramFeed: normalized.instagram_feed,
            overlayPaperPlane: normalized.overlay_paper_plane,
            ...(normalized.instagram_feed ? { falSeed: randomInt(1, 2147483646) } : {}),
          });
          imageBuffer = out.buffer;
          generationModel = out.modelLabel;
          backend = 'fal';
          falRequestId = out.falRequestId;
        } catch (falErr) {
          console.warn(
            instagramFalOnlyMode
              ? '[imageService] Fal image generation failed (Instagram Fal-only; no Gemini/OpenAI fallback)'
              : '[imageService] Fal image generation failed, falling back to Gemini/OpenAI',
            {
              message: falErr instanceof Error ? falErr.message : String(falErr),
            },
          );
        }
      }

      /** Discard unusable Fal frames and fall through to Gemini/OpenAI in this same attempt (do not loop on Fal only). */
      if (
        imageBuffer &&
        generationModel?.startsWith('fal/') &&
        normalized.instagram_feed === true &&
        !normalized.overlay_paper_plane
      ) {
        const expectedDims = parseResolutionDimensions(resolution);
        const ratioRaw = Number(process.env.FAL_INSTAGRAM_MIN_SIZE_RATIO ?? '0.9');
        const sizeRatio =
          Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw <= 1 ? ratioRaw : 0.9;
        let decodedDims: { width: number; height: number } | null = null;
        decodedDims = await getRasterDimensions(imageBuffer);
        if (!decodedDims) {
          console.warn('[imageService] fal_instagram_raster_decode_failed', {
            content_id: normalized.content_id,
            bufferBytes: imageBuffer.length,
            attempt,
          });
          imageBuffer = undefined;
          generationModel = undefined;
          falRequestId = undefined;
          backend = undefined;
        } else {
          const expectedShort = expectedDims ? Math.min(expectedDims.width, expectedDims.height) : null;
          const actualShort = Math.min(decodedDims.width, decodedDims.height);
          const minRequired =
            expectedShort != null ? Math.max(1, Math.round(expectedShort * sizeRatio)) : 512;
          if (actualShort < minRequired) {
            console.warn('[imageService] fal_instagram_dimensions_below_expected', {
              content_id: normalized.content_id,
              width: decodedDims.width,
              height: decodedDims.height,
              actualShort,
              minRequired,
              expectedShort,
              resolution,
              attempt,
            });
            imageBuffer = undefined;
            generationModel = undefined;
            falRequestId = undefined;
            backend = undefined;
          }
        }
        const minBytesOpt = Number(process.env.FAL_INSTAGRAM_MIN_OUTPUT_BYTES ?? '0');
        if (
          imageBuffer &&
          Number.isFinite(minBytesOpt) &&
          minBytesOpt > 0 &&
          imageBuffer.length < minBytesOpt
        ) {
          console.warn('[imageService] fal_instagram_output_below_min_bytes', {
            content_id: normalized.content_id,
            bufferBytes: imageBuffer.length,
            minBytes: minBytesOpt,
            attempt,
          });
          imageBuffer = undefined;
          generationModel = undefined;
          falRequestId = undefined;
          backend = undefined;
        }
        if (imageBuffer) {
          const blackFrameMaxMean = Number(process.env.FAL_INSTAGRAM_BLACK_FRAME_MAX_MEAN ?? '14');
          const blackThreshold = Number.isFinite(blackFrameMaxMean) ? blackFrameMaxMean : 14;
          const meanLum = await estimateRgbMeanLuminance(imageBuffer);
          if (meanLum != null && meanLum < blackThreshold) {
            const expectedShort = expectedDims ? Math.min(expectedDims.width, expectedDims.height) : null;
            const actualShort =
              decodedDims != null ? Math.min(decodedDims.width, decodedDims.height) : 0;
            const minShortRequired =
              expectedShort != null ? Math.max(1, Math.round(expectedShort * sizeRatio)) : 512;
            /** ~0 luminance with a full-size decode is often a measurement bug, not a black frame. */
            const skipUnreliableLum =
              meanLum <= 0.01 &&
              decodedDims != null &&
              expectedShort != null &&
              actualShort >= minShortRequired;
            if (skipUnreliableLum) {
              falInstagramKeptDespiteUnreliableRawLum = true;
              const d = decodedDims!;
              console.warn('[imageService] fal_near_black_frame_skipped_unreliable_lum', {
                content_id: normalized.content_id,
                meanLum,
                threshold: blackThreshold,
                width: d.width,
                height: d.height,
                minShortRequired,
                attempt,
              });
            } else {
              console.warn('[imageService] fal_near_black_frame', {
                content_id: normalized.content_id,
                meanLum,
                threshold: blackThreshold,
                attempt,
              });
              console.warn('[imageService] fal_near_black_frame_falling_back_to_gemini');
              imageBuffer = undefined;
              generationModel = undefined;
              falRequestId = undefined;
              backend = undefined;
            }
          }
        }
      }

      // 2–3) Vertex / global Publisher / Gemini AI Studio, then OpenAI Images (order swap when IMAGE_GEN_OPENAI_BEFORE_GEMINI=1)
      const runGeminiImageBackend = async (): Promise<void> => {
        if (!imageBuffer && !instagramFalOnlyMode && hasGeminiImageBackend()) {
          try {
            const out = await callGeminiNativeImageGeneration(normalized.prompt, resolution, {
              skipOpenAiFallback: true,
              stylePreset: normalized.style_preset,
            });
            imageBuffer = out.buffer;
            if (out.modelId.startsWith('vertex/')) {
              generationModel = out.modelId;
              backend = 'vertex_gemini';
            } else if (out.modelId.startsWith('aiplatform/')) {
              generationModel = out.modelId;
              backend = 'aiplatform_global';
            } else if (out.modelId.startsWith('openai/')) {
              generationModel = out.modelId;
              backend = 'openai';
            } else {
              generationModel = `direct/${out.modelId}`;
              backend = 'gemini_direct';
            }
          } catch (geminiErr) {
            geminiFailed = true;
            console.warn('[imageService] Gemini failed after Fal, falling back to OpenAI/LiteLLM', {
              message: geminiErr instanceof Error ? geminiErr.message : String(geminiErr),
            });
          }
        }
      };

      const runOpenAiImageBackend = async (): Promise<void> => {
        if (!imageBuffer && !instagramFalOnlyMode && getOpenAiApiKey()) {
          try {
            imageBuffer = await callOpenAIImagesGeneration(
              normalized.prompt,
              resolution,
              normalized.style_preset,
            );
            generationModel = `openai/${getOpenAiImageModel()}`;
            backend = 'openai';
          } catch (openaiErr) {
            openaiFailed = true;
            console.warn('[imageService] OpenAI image generation failed', {
              message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
            });
          }
        }
      };

      if (isOpenAiBeforeGeminiImage()) {
        await runOpenAiImageBackend();
        await runGeminiImageBackend();
      } else {
        await runGeminiImageBackend();
        await runOpenAiImageBackend();
      }

      // 4) LiteLLM last (when enabled)
      if (!imageBuffer && !instagramFalOnlyMode && useLiteLLMForImages()) {
        imageBuffer = await callImageModelLiteLLM(normalized.prompt, resolution, normalized.style_preset);
        generationModel = IMAGE_MODEL;
        backend = 'litellm';
      }

      if (!imageBuffer) {
        if (instagramFalOnlyMode) {
          throw new Error(
            'Instagram Fal-only image generation failed: Fal did not return a usable image',
          );
        }
        if (!hasGeminiImageBackend() && !getOpenAiApiKey() && !useFalForImages()) {
          throw new Error('No image backend available after routing');
        }
        if (
          hasGeminiImageBackend() &&
          getOpenAiApiKey() &&
          geminiFailed &&
          openaiFailed &&
          !useLiteLLMForImages()
        ) {
          throw new Error(
            isOpenAiGeminiImageOnlyMode()
              ? 'Gemini and OpenAI image generation failed (IMAGE_GEN_OPENAI_GEMINI_ONLY=1 disables LiteLLM)'
              : 'Fal (if configured), Gemini, and OpenAI failed; set LITELLM_MASTER_KEY for LiteLLM fallback or fix API keys',
          );
        }
        if (
          !hasGeminiImageBackend() &&
          getOpenAiApiKey() &&
          openaiFailed &&
          !useLiteLLMForImages()
        ) {
          throw new Error(
            'OpenAI image generation failed; set Vertex/Gemini (GOOGLE_GEMINI_API_KEY) or LITELLM_MASTER_KEY',
          );
        }
        if (hasGeminiImageBackend() && geminiFailed && !getOpenAiApiKey()) {
          throw new Error('Gemini image generation failed and OPENAI_API_KEY is not configured');
        }
        throw new Error('Image generation failed on all configured backends');
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        lastError = 'Model returned empty image buffer';
        continue;
      }

      const targetDims = parseResolutionDimensions(resolution);
      if (
        normalized.instagram_feed === true &&
        targetDims &&
        backend &&
        backend !== 'fal' &&
        (backend === 'openai' ||
          backend === 'litellm' ||
          backend === 'gemini_direct' ||
          backend === 'vertex_gemini' ||
          backend === 'aiplatform_global')
      ) {
        const have = await getRasterDimensions(imageBuffer);
        if (
          have &&
          (have.width < targetDims.width || have.height < targetDims.height)
        ) {
          console.warn('[imageService] instagram_upscale_to_target', {
            content_id: normalized.content_id,
            backend,
            from: `${have.width}x${have.height}`,
            to: `${targetDims.width}x${targetDims.height}`,
          });
          imageBuffer = await upscaleRasterToTargetDimensions(
            imageBuffer,
            targetDims.width,
            targetDims.height,
          );
        }
      }

      const rasterCheck = validateRasterImageBuffer(imageBuffer);
      if (!rasterCheck.ok) {
        lastError = rasterCheck.reason;
        continue;
      }

      /** VA2 paper-plane overlays must keep PNG alpha; other Fal/T2I PNGs flatten to JPEG for dark UIs. */
      const preserveOverlayAlpha = normalized.overlay_paper_plane === true;
      let uploadBuffer: Buffer = preserveOverlayAlpha
        ? imageBuffer
        : normalized.instagram_feed === true
          ? await flattenInstagramFeedToOpaqueJpeg(imageBuffer)
          : await flattenKontextToOpaqueJpeg(imageBuffer);

      /**
       * Instagram + Fal: raw PNG luminance often reads 0 (alpha / stats quirk) so we skip discarding Fal early.
       * Post-flatten JPEG luminance can also read ~0 for the same payloads; if we already trusted raw Fal for
       * that reason, do not trigger a slow Gemini/OpenAI fallback (avoids Lucy chat timeouts).
       */
      if (
        normalized.instagram_feed === true &&
        !preserveOverlayAlpha &&
        backend === 'fal' &&
        generationModel?.startsWith('fal/')
      ) {
        const postLum = await estimateRgbMeanLuminance(uploadBuffer);
        const minPostRaw = Number(process.env.FAL_INSTAGRAM_POST_JPEG_MIN_MEAN_LUM ?? '18');
        const postMin = Number.isFinite(minPostRaw) && minPostRaw > 0 ? minPostRaw : 18;
        if (
          postLum != null &&
          postLum < postMin &&
          falInstagramKeptDespiteUnreliableRawLum
        ) {
          console.warn('[imageService] fal_instagram_flat_jpeg_dark_skipped_post_unreliable_lum', {
            content_id: normalized.content_id,
            postLum,
            postMin,
            jpegBytes: uploadBuffer.length,
            fal_request_id: falRequestId,
            attempt,
          });
        } else if (postLum != null && postLum < postMin) {
          if (normalized.instagram_fal_only === true) {
            console.warn('[imageService] fal_instagram_flat_jpeg_too_dark_fal_only_no_fallback', {
              content_id: normalized.content_id,
              postLum,
              postMin,
              jpegBytes: uploadBuffer.length,
              fal_request_id: falRequestId,
              attempt,
            });
          } else {
          console.warn('[imageService] fal_instagram_flat_jpeg_too_dark', {
            content_id: normalized.content_id,
            postLum,
            postMin,
            jpegBytes: uploadBuffer.length,
            fal_request_id: falRequestId,
            attempt,
          });
          let fbBuf: Buffer | undefined;
          let fbModel: string | undefined;
          let fbBackend:
            | 'openai'
            | 'litellm'
            | 'gemini_direct'
            | 'vertex_gemini'
            | 'aiplatform_global'
            | undefined;

          const tryFbGemini = async (): Promise<void> => {
            if (!hasGeminiImageBackend()) return;
            try {
              const out = await callGeminiNativeImageGeneration(normalized.prompt, resolution, {
                skipOpenAiFallback: true,
                stylePreset: normalized.style_preset,
              });
              fbBuf = out.buffer;
              if (out.modelId.startsWith('vertex/')) {
                fbModel = out.modelId;
                fbBackend = 'vertex_gemini';
              } else if (out.modelId.startsWith('aiplatform/')) {
                fbModel = out.modelId;
                fbBackend = 'aiplatform_global';
              } else if (out.modelId.startsWith('openai/')) {
                fbModel = out.modelId;
                fbBackend = 'openai';
              } else {
                fbModel = `direct/${out.modelId}`;
                fbBackend = 'gemini_direct';
              }
            } catch (geminiErr) {
              geminiFailed = true;
              console.warn('[imageService] Gemini fallback after dark Fal JPEG failed', {
                message: geminiErr instanceof Error ? geminiErr.message : String(geminiErr),
              });
            }
          };

          const tryFbOpenAi = async (): Promise<void> => {
            if (!getOpenAiApiKey()) return;
            try {
              fbBuf = await callOpenAIImagesGeneration(
                normalized.prompt,
                resolution,
                normalized.style_preset,
              );
              fbModel = `openai/${getOpenAiImageModel()}`;
              fbBackend = 'openai';
            } catch (openaiErr) {
              openaiFailed = true;
              console.warn('[imageService] OpenAI fallback after dark Fal JPEG failed', {
                message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
              });
            }
          };

          if (isOpenAiBeforeGeminiImage()) {
            await tryFbOpenAi();
            if (!fbBuf) await tryFbGemini();
          } else {
            await tryFbGemini();
            if (!fbBuf) await tryFbOpenAi();
          }
          if (!fbBuf && useLiteLLMForImages()) {
            fbBuf = await callImageModelLiteLLM(normalized.prompt, resolution, normalized.style_preset);
            fbModel = IMAGE_MODEL;
            fbBackend = 'litellm';
          }
          if (!fbBuf || !fbModel || !fbBackend) {
            lastError = 'Fal Instagram flat JPEG too dark; Gemini/OpenAI/LiteLLM unavailable or failed';
            continue;
          }
          imageBuffer = fbBuf;
          generationModel = fbModel;
          backend = fbBackend;
          falRequestId = undefined;

          const targetDimsFb = parseResolutionDimensions(resolution);
          if (
            targetDimsFb &&
            (fbBackend === 'openai' ||
              fbBackend === 'litellm' ||
              fbBackend === 'gemini_direct' ||
              fbBackend === 'vertex_gemini' ||
              fbBackend === 'aiplatform_global')
          ) {
            const have = await getRasterDimensions(imageBuffer);
            if (
              have &&
              (have.width < targetDimsFb.width || have.height < targetDimsFb.height)
            ) {
              console.warn('[imageService] instagram_upscale_to_target_after_dark_fal_fallback', {
                content_id: normalized.content_id,
                backend: fbBackend,
                from: `${have.width}x${have.height}`,
                to: `${targetDimsFb.width}x${targetDimsFb.height}`,
              });
              imageBuffer = await upscaleRasterToTargetDimensions(
                imageBuffer,
                targetDimsFb.width,
                targetDimsFb.height,
              );
            }
          }
          const rasterFb = validateRasterImageBuffer(imageBuffer);
          if (!rasterFb.ok) {
            lastError = rasterFb.reason;
            continue;
          }
          uploadBuffer = await flattenInstagramFeedToOpaqueJpeg(imageBuffer);
          }
        }
      }

      const isJpeg =
        uploadBuffer.length >= 2 && uploadBuffer[0] === 0xff && uploadBuffer[1] === 0xd8;
      const storageKey = buildStorageKey(
        normalized.org_id,
        normalized.content_id,
        isJpeg ? 'jpg' : 'png',
      );
      const uploadContentType = isJpeg ? 'image/jpeg' : 'image/png';
      let publicUrl: string;
      let uploadFailed = false;

      const MAX_INLINE_DATA_URL_BYTES = 1_048_576; // 1 MB
      try {
        publicUrl = await uploadToStorage(uploadBuffer, storageKey, uploadContentType);
      } catch (uploadErr) {
        uploadFailed = true;
        console.warn('[imageService] Storage upload failed', {
          content_id: normalized.content_id,
          error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        });
        if (uploadBuffer.length <= MAX_INLINE_DATA_URL_BYTES) {
          publicUrl = isJpeg
            ? `data:image/jpeg;base64,${uploadBuffer.toString('base64')}`
            : `data:image/png;base64,${uploadBuffer.toString('base64')}`;
        } else {
          console.warn(`[imageService] Image too large for inline fallback (${(imageBuffer.length / 1024 / 1024).toFixed(1)} MB), returning placeholder`);
          publicUrl = '';
        }
      }

      const metadata: ImageGenerationMetadata = {
        model: generationModel ?? IMAGE_MODEL,
        resolution,
        retries: attempt,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        storage_key: uploadFailed ? undefined : storageKey,
        image_backend: backend,
        ...(falRequestId ? { fal_request_id: falRequestId } : {}),
      };

      console.log('[imageService] Generation succeeded', {
        content_id: normalized.content_id,
        backend,
        duration_ms: metadata.duration_ms,
        retries: attempt,
        storage_key: uploadFailed ? '(upload failed — data URL)' : storageKey,
        ...(backend === 'fal'
          ? {
              fal_request_id: falRequestId,
              fal_model: generationModel,
            }
          : {}),
      });
      if (backend === 'fal') {
        console.log('[falUsage]', {
          org_id: normalized.org_id,
          content_id: normalized.content_id,
          model: generationModel,
          buffer_bytes: imageBuffer.length,
          overlay_paper_plane: preserveOverlayAlpha,
        });
      }

      return {
        success: true,
        image_url: publicUrl,
        storage_key: uploadFailed ? null : storageKey,
        metadata,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[imageService] Attempt ${attempt + 1} failed:`, lastError);

      if (attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  if (isDevPlaceholderFallbackEnabled()) {
    return devPlaceholderResult(normalized, startMs, `All retries failed: ${lastError}`);
  }

  const metadata: ImageGenerationMetadata = {
    model: IMAGE_MODEL,
    resolution,
    retries: MAX_RETRIES,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
  };

  console.error('[imageService] Generation FAILED after all retries', {
    content_id: normalized.content_id,
    error: lastError,
  });

  return {
    success: false,
    image_url: null,
    storage_key: null,
    metadata,
    error: lastError,
  };
}
