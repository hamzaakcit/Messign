// ============================================================================
// Visual Synthesis Service — imageService.ts
// ============================================================================
// Generates marketing images via Nano Banana 2 (Gemini 2.0 Flash exp)
// through the LiteLLM gateway, uploads to storage, returns public URL.
//
// File: server/src/services/marketing/publishing/imageService.ts
// ============================================================================

import { randomUUID } from 'crypto';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
  ImageGenerationMetadata,
} from '../../../dal/marketing/instagramTypes.js';

// ---------------------------------------------------------------------------
// Config — pulled from env, with sane defaults
// ---------------------------------------------------------------------------

const LITELLM_GATEWAY_URL = process.env.LITELLM_GATEWAY_URL ?? 'http://localhost:4000';
const LITELLM_API_KEY = process.env.LITELLM_MASTER_KEY ?? '';

// Nano Banana 2 is accessed through Gemini 2.0 Flash experimental
// via the LiteLLM gateway. Adjust the model string if your LiteLLM
// config uses an alias.
const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL ?? 'gemini/gemini-2.0-flash-exp';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const STORAGE_BUCKET = process.env.MARKETING_IMAGE_BUCKET ?? 'marketing-images';

const MAX_RETRIES = 2;
const GENERATION_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Core: generateImage
// ---------------------------------------------------------------------------

export async function generateImage(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  const startMs = Date.now();
  const resolution = input.resolution ?? '1024x1024';
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ── Step 1: Call the model via LiteLLM ──────────────────────────
      const imageBuffer = await callImageModel(input.prompt, resolution);

      if (!imageBuffer || imageBuffer.length === 0) {
        lastError = 'Model returned empty image buffer';
        continue;
      }

      // ── Step 2: Upload to storage ──────────────────────────────────
      const storageKey = buildStorageKey(input.org_id, input.content_id);
      const publicUrl = await uploadToStorage(imageBuffer, storageKey);

      const metadata: ImageGenerationMetadata = {
        model: IMAGE_MODEL,
        resolution,
        retries: attempt,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        storage_key: storageKey,
      };

      console.log('[imageService] Generation succeeded', {
        content_id: input.content_id,
        duration_ms: metadata.duration_ms,
        retries: attempt,
        storage_key: storageKey,
      });

      return {
        success: true,
        image_url: publicUrl,
        storage_key: storageKey,
        metadata,
      };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      console.warn(`[imageService] Attempt ${attempt + 1} failed:`, lastError);

      // Brief pause before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  // All retries exhausted
  const metadata: ImageGenerationMetadata = {
    model: IMAGE_MODEL,
    resolution,
    retries: MAX_RETRIES,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
  };

  console.error('[imageService] Generation FAILED after all retries', {
    content_id: input.content_id,
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

// ---------------------------------------------------------------------------
// Model call — Gemini 2.0 Flash with image generation via LiteLLM
// ---------------------------------------------------------------------------

async function callImageModel(prompt: string, resolution: string): Promise<Buffer> {
  // Gemini 2.0 Flash exp supports native image generation when you
  // request responseModalities: ["IMAGE", "TEXT"]. The LiteLLM gateway
  // proxies this through the standard /v1/chat/completions endpoint
  // with the model-specific passthrough config.

  const systemPrompt = [
    'You are a professional marketing visual designer.',
    'Generate EXACTLY ONE high-quality image based on the user prompt.',
    'Do NOT include any text in your response — only the image.',
    `Resolution: ${resolution}.`,
    'Style: Clean, professional, brand-safe marketing imagery.',
    'No watermarks. No text overlays unless explicitly requested in the prompt.',
  ].join(' ');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${LITELLM_GATEWAY_URL}/v1/chat/completions`, {
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
        // Gemini-specific: request image output modality
        // LiteLLM passes these through to the Gemini API
        response_modalities: ['IMAGE', 'TEXT'],
        generation_config: {
          response_mime_type: 'image/png',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(`LiteLLM returned ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    // Extract image from response — Gemini returns base64 in inline_data
    const imageContent = extractImageFromResponse(data);
    if (!imageContent) {
      throw new Error('No image content found in model response');
    }

    return Buffer.from(imageContent, 'base64');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts base64 image data from various response formats.
 * Gemini via LiteLLM can return images in several structures.
 */
function extractImageFromResponse(data: any): string | null {
  // Format 1: Gemini native — inline_data in parts
  const choices = data?.choices ?? [];
  for (const choice of choices) {
    const message = choice?.message;

    // Check content array (multimodal response)
    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === 'image' && part?.source?.data) {
          return part.source.data;
        }
        if (part?.inline_data?.data) {
          return part.inline_data.data;
        }
        // LiteLLM may wrap as image_url with base64
        if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:image')) {
          return part.image_url.url.split(',')[1] ?? null;
        }
      }
    }

    // Format 2: Direct base64 string in message content
    if (typeof message?.content === 'string' && message.content.length > 1000) {
      // Likely raw base64
      const cleaned = message.content.replace(/^data:image\/\w+;base64,/, '');
      if (isValidBase64(cleaned)) {
        return cleaned;
      }
    }
  }

  // Format 3: Top-level data array (some Gemini proxy formats)
  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item?.b64_json) return item.b64_json;
      if (item?.url?.startsWith('data:image')) {
        return item.url.split(',')[1] ?? null;
      }
    }
  }

  return null;
}

function isValidBase64(str: string): boolean {
  if (str.length < 100) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(str.slice(0, 200));
}

// ---------------------------------------------------------------------------
// Storage — Supabase Storage (swap for S3 if needed)
// ---------------------------------------------------------------------------

function buildStorageKey(orgId: string, contentId: string): string {
  const timestamp = Date.now();
  const nonce = randomUUID().slice(0, 8);
  return `${orgId}/instagram/${contentId}_${timestamp}_${nonce}.png`;
}

async function uploadToStorage(buffer: Buffer, key: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // Dev fallback: write to local mock path
    console.warn('[imageService] No Supabase config — returning mock URL');
    return `https://storage.mock.local/${STORAGE_BUCKET}/${key}`;
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${key}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Storage upload failed (${response.status}): ${errText}`);
  }

  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${key}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Prompt enhancement — enriches a raw agent prompt for the image model
// ---------------------------------------------------------------------------

export function enhanceImagePrompt(
  rawPrompt: string,
  stylePreset: ImageGenerationInput['style_preset'] = 'modern_noir',
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
  };

  const styleDirective = styleMap[stylePreset] ?? styleMap.modern_noir;

  return [
    rawPrompt.trim(),
    '',
    '---',
    'STYLE DIRECTION:',
    styleDirective,
    '',
    'TECHNICAL REQUIREMENTS:',
    '- Professional marketing quality, suitable for Instagram feed.',
    '- No visible watermarks, logos, or stock-photo artifacts.',
    '- Brand-safe: no controversial, violent, or NSFW elements.',
    '- Square 1:1 aspect ratio composition.',
    '- Sharp focus on the primary subject.',
  ].join('\n');
}

export default { generateImage, enhanceImagePrompt };
