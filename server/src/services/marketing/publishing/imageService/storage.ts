// ---------------------------------------------------------------------------
// Supabase Storage — upload generated images
// ---------------------------------------------------------------------------

import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const STORAGE_BUCKET = process.env.MARKETING_IMAGE_BUCKET ?? 'marketing-images';

export function buildStorageKey(orgId: string, contentId: string): string {
  const timestamp = Date.now();
  const nonce = randomUUID().slice(0, 8);
  return `${orgId}/instagram/${contentId}_${timestamp}_${nonce}.png`;
}

export async function uploadToStorage(buffer: Buffer, key: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[imageService] No Supabase config — returning mock URL');
    return `https://storage.mock.local/${STORAGE_BUCKET}/${key}`;
  }

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${key}`;

  try {
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
