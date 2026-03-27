// ---------------------------------------------------------------------------
// Input / output validation for image generation
// ---------------------------------------------------------------------------

import type { ImageGenerationInput } from '../../../../dal/marketing/instagramTypes.js';

/** Loose UUID (hex with dashes) — matches dev nil org ids and standard UUIDs. */
const LOOSE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIN_PROMPT_CHARS = 1;
const MAX_PROMPT_CHARS = 12_000;

export const ALLOWED_RESOLUTIONS = new Set<string>([
  '1024x1024', '1080x1080', '1080x1350', '1080x1920', '1920x1080',
  '1344x768', '1024x768', '1024x576', '768x768', '768x512',
]);

export const ALLOWED_STYLE_PRESETS = new Set<NonNullable<ImageGenerationInput['style_preset']>>([
  'modern_noir',
  'vibrant_lifestyle',
  'minimal_flat',
  'editorial',
  'product_spotlight',
  'team_culture',
  'data_viz',
  'seasonal',
  'ugc_style',
]);

/** Reject path injection / absurd payloads in storage keys. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function validateImageGenerationInput(
  input: ImageGenerationInput,
):
  | { ok: true; normalized: ImageGenerationInput }
  | { ok: false; error: string } {
  const org_id = (input.org_id ?? '').trim();
  const content_id = (input.content_id ?? '').trim();
  const prompt = (input.prompt ?? '').trim();

  if (!LOOSE_UUID_RE.test(org_id)) {
    return { ok: false, error: 'Invalid org_id: expected UUID format' };
  }
  if (!LOOSE_UUID_RE.test(content_id)) {
    return { ok: false, error: 'Invalid content_id: expected UUID format' };
  }
  if (prompt.length < MIN_PROMPT_CHARS) {
    return { ok: false, error: 'Image prompt is empty' };
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: `Image prompt exceeds ${MAX_PROMPT_CHARS} characters` };
  }
  if (input.resolution != null && !ALLOWED_RESOLUTIONS.has(input.resolution)) {
    return { ok: false, error: `Invalid resolution: ${String(input.resolution)}` };
  }
  if (
    input.style_preset != null &&
    !ALLOWED_STYLE_PRESETS.has(input.style_preset as NonNullable<ImageGenerationInput['style_preset']>)
  ) {
    return { ok: false, error: `Invalid style_preset: ${String(input.style_preset)}` };
  }

  return {
    ok: true,
    normalized: {
      org_id,
      content_id,
      prompt,
      ...(input.resolution != null ? { resolution: input.resolution } : {}),
      ...(input.style_preset != null ? { style_preset: input.style_preset } : {}),
    },
  };
}

/**
 * Ensures decoded model output is a supported raster image (PNG, JPEG, GIF, WebP) and within size limits.
 * @internal exported for unit tests
 */
export function validateRasterImageBuffer(buffer: Buffer): { ok: true } | { ok: false; reason: string } {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'Empty image buffer' };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `Image exceeds maximum size (${MAX_IMAGE_BYTES} bytes)` };
  }
  if (buffer.length < 12) {
    return { ok: false, reason: 'Image data too small to be valid' };
  }

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ok: true };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ok: true };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ok: true };
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ok: true };
  }

  return { ok: false, reason: 'Not a recognized PNG, JPEG, GIF, or WebP image' };
}
