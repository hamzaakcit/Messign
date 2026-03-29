// ---------------------------------------------------------------------------
// Supabase Storage — upload generated images
// ---------------------------------------------------------------------------

import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const STORAGE_BUCKET = process.env.MARKETING_IMAGE_BUCKET ?? 'marketing-images';

/**
 * Supabase Storage REST expects a JWT in `Authorization: Bearer`.
 * New opaque keys (`sb_secret_…`) are NOT valid JWTs — they must be
 * sent via the `apikey` header instead.  Detect the format and build
 * the correct header map.
 */
function storageAuthHeaders(): Record<string, string> {
  if (SUPABASE_SERVICE_KEY.startsWith('sb_')) {
    return { apikey: SUPABASE_SERVICE_KEY };
  }
  return { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
}

export function buildStorageKey(orgId: string, contentId: string, ext: 'png' | 'jpg' = 'png'): string {
  const timestamp = Date.now();
  const nonce = randomUUID().slice(0, 8);
  const safeExt = ext === 'jpg' ? 'jpg' : 'png';
  return `${orgId}/instagram/${contentId}_${timestamp}_${nonce}.${safeExt}`;
}

/**
 * Object path for a user-uploaded reference JPEG/PNG before AI edit (Kontext).
 */
export function buildReferenceUploadStorageKey(orgId: string, contentId: string, ext: string): string {
  const nonce = randomUUID().slice(0, 8);
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `${orgId}/reference/${contentId}_${nonce}.${safeExt}`;
}

/**
 * Ephemeral reference uploads from Lucy (Instagram modal) before a `marketing_content` row exists.
 */
export function buildLucyReferenceUploadStorageKey(orgId: string, ext: string): string {
  const nonce = randomUUID().slice(0, 8);
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `${orgId}/reference/lucy_${nonce}.${safeExt}`;
}

export async function uploadToStorage(
  buffer: Buffer,
  key: string,
  contentType: string = 'image/png',
): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[imageService] No Supabase config — returning mock URL');
    return `https://storage.mock.local/${STORAGE_BUCKET}/${key}`;
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${key}`;

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...storageAuthHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[imageService] Storage upload HTTP error', {
        uploadUrl,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errText.slice(0, 500),
      });
      throw new Error(`Storage upload failed ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Storage upload failed')) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[imageService] Storage upload fetch failed', { uploadUrl, message: msg });
    throw err instanceof Error ? err : new Error(msg);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${key}`;
}
