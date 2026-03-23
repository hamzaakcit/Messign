// ============================================================================
// Core image generation orchestrator + backend callers
// ============================================================================
// Generates marketing images via LiteLLM (Gemini / configured model), OpenAI
// Images, or direct Gemini generateContent — then uploads to Supabase storage.
//
// Environment (see also .env.example):
//   LITELLM_GATEWAY_URL  — optional base, e.g. http://host:4000 (no /v1 required)
//   LITELLM_URL          — fallback if GATEWAY unset; may include /v1
//   LITELLM_MASTER_KEY   — Bearer token for LiteLLM
//   GOOGLE_GEMINI_API_KEY — direct Gemini image gen when LiteLLM is not configured
//   OPENAI_API_KEY — optional; when set, OpenAI Images is tried first
//   OPENAI_IMAGE_MODEL — optional (default dall-e-3)
//   GEMINI_IMAGE_GEN_MODEL — optional; if unset, tries several candidate ids
//   IMAGE_GEN_MODEL      — LiteLLM model id (default gemini/gemini-2.0-flash-exp)
//   IMAGE_GEN_DEV_FALLBACK — "true"/"1" → immediate placehold.co
//   IMAGE_GEN_PLACEHOLDER_URL — override placeholder image URL
// ============================================================================

import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageGenerationMetadata,
} from '../../../../dal/marketing/instagramTypes.js';

import { buildMarketingImageSystemText } from './promptBuilder.js';
import { validateImageGenerationInput, validateRasterImageBuffer, ALLOWED_RESOLUTIONS } from './validation.js';
import { buildStorageKey, uploadToStorage } from './storage.js';

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

/**
 * Preferred native `generateContent` model (IMAGE modality). If unset,
 * {@link geminiImageModelCandidates} tries several ids.
 */
const GEMINI_IMAGE_GEN_MODEL_EXPLICIT = process.env.GEMINI_IMAGE_GEN_MODEL?.trim() ?? '';

function geminiImageModelCandidates(): string[] {
  if (GEMINI_IMAGE_GEN_MODEL_EXPLICIT) return [GEMINI_IMAGE_GEN_MODEL_EXPLICIT];
  return [
    'gemini-flash-latest',
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash',
  ];
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

function hasDirectGeminiImageCredentials(): boolean {
  return Boolean(GEMINI_API_KEY);
}

function hasOpenAiImageCredentials(): boolean {
  return Boolean(getOpenAiApiKey());
}

function hasAnyImageBackend(): boolean {
  return hasLiteLLMCredentials() || hasDirectGeminiImageCredentials() || hasOpenAiImageCredentials();
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

function openaiImageSizeFromResolution(resolution: string): '1024x1024' | '1024x1792' | '1792x1024' {
  const r = resolution.toLowerCase();
  if (r.includes('1792') && r.includes('1024')) {
    if (r.startsWith('1792') || r.indexOf('1792') < r.indexOf('1024')) return '1792x1024';
    return '1024x1792';
  }
  return '1024x1024';
}

async function callOpenAIImagesGeneration(imagePrompt: string, resolution: string): Promise<Buffer> {
  const openaiKey = getOpenAiApiKey();
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const size = openaiImageSizeFromResolution(resolution);
  const prompt = imagePrompt.slice(0, 4000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: getOpenAiImageModel(),
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
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

async function callImageModelLiteLLM(prompt: string, resolution: string): Promise<Buffer> {
  const url = getLiteLLMChatCompletionsUrl();

  const systemPrompt = buildMarketingImageSystemText(resolution);

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
// Backend: Direct Gemini — generativelanguage.googleapis.com
// ---------------------------------------------------------------------------

type GeminiNativeImageOptions = {
  /** When true, Gemini must not call OpenAI (already tried OpenAI-first at the top level). */
  skipOpenAiFallback?: boolean;
};

async function callGeminiNativeImageGeneration(
  prompt: string,
  resolution: string,
  options?: GeminiNativeImageOptions,
): Promise<{ buffer: Buffer; modelId: string }> {
  const skipOpenAiFallback = options?.skipOpenAiFallback ?? false;
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
            parts: [{ text: buildMarketingImageSystemText(resolution) }],
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
        console.error('[imageService] Gemini direct HTTP error', {
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

      console.error('[imageService] Gemini direct: no image in response', {
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
      const buffer = await callOpenAIImagesGeneration(openaiPrompt, resolution);
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
    backends: {
      openai: hasOpenAiImageCredentials(),
      litellm: hasLiteLLMCredentials(),
      gemini: hasDirectGeminiImageCredentials(),
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

  if (isExplicitImageGenDevFallback()) {
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
    return devPlaceholderResult(
      normalized,
      startMs,
      'No image backend: set OPENAI_API_KEY, LITELLM_MASTER_KEY (LiteLLM), or GOOGLE_GEMINI_API_KEY (direct Gemini)',
    );
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
      error:
        'Image generation requires OPENAI_API_KEY, LITELLM_MASTER_KEY, or GOOGLE_GEMINI_API_KEY — none are set',
    };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let imageBuffer: Buffer | undefined;
      let generationModel: string | undefined;
      /** Set on every success path before use (OpenAI, LiteLLM, or Gemini). */
      let backend!: 'openai' | 'litellm' | 'gemini_direct';

      let openaiFirstFailed = false;
      if (getOpenAiApiKey()) {
        try {
          imageBuffer = await callOpenAIImagesGeneration(normalized.prompt, resolution);
          generationModel = `openai/${getOpenAiImageModel()}`;
          backend = 'openai';
        } catch (openaiErr) {
          openaiFirstFailed = true;
          console.warn('[imageService] OpenAI-first failed, falling back to LiteLLM/Gemini', {
            message: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
          });
        }
      }

      if (!imageBuffer) {
        if (hasLiteLLMCredentials()) {
          imageBuffer = await callImageModelLiteLLM(normalized.prompt, resolution);
          generationModel = IMAGE_MODEL;
          backend = 'litellm';
        } else if (hasDirectGeminiImageCredentials()) {
          const out = await callGeminiNativeImageGeneration(normalized.prompt, resolution, {
            skipOpenAiFallback: openaiFirstFailed,
          });
          imageBuffer = out.buffer;
          generationModel = `direct/${out.modelId}`;
          backend = 'gemini_direct';
        } else {
          throw new Error(
            openaiFirstFailed
              ? 'OpenAI image generation failed and no LiteLLM or Gemini fallback is configured'
              : 'No image backend available after routing',
          );
        }
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        lastError = 'Model returned empty image buffer';
        continue;
      }

      const rasterCheck = validateRasterImageBuffer(imageBuffer);
      if (!rasterCheck.ok) {
        lastError = rasterCheck.reason;
        continue;
      }

      const storageKey = buildStorageKey(normalized.org_id, normalized.content_id);
      let publicUrl: string;
      let uploadFailed = false;

      const MAX_INLINE_DATA_URL_BYTES = 1_048_576; // 1 MB
      try {
        publicUrl = await uploadToStorage(imageBuffer, storageKey);
      } catch (uploadErr) {
        uploadFailed = true;
        console.warn('[imageService] Storage upload failed', {
          content_id: normalized.content_id,
          error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        });
        if (imageBuffer.length <= MAX_INLINE_DATA_URL_BYTES) {
          publicUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
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
      };

      console.log('[imageService] Generation succeeded', {
        content_id: normalized.content_id,
        backend,
        duration_ms: metadata.duration_ms,
        retries: attempt,
        storage_key: uploadFailed ? '(upload failed — data URL)' : storageKey,
      });

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
