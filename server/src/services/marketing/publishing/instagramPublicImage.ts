/**
 * Meta's crawler must download the photo over public HTTPS.
 * A same-origin /uploads file is uploaded to Fal storage for that one publish.
 */
import { readFile } from 'fs/promises';
import path from 'path';

export function localMarketingFilePath(imageUrl: string): string | null {
  const value = imageUrl.trim();
  if (!value.startsWith('/uploads/marketing/')) return null;
  if (value.includes('..') || value.includes('\\')) return null;
  const parts = value
    .slice('/uploads/marketing/'.length)
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts.some((part) => part === '.' || part === '..')) return null;
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'marketing');
  const full = path.resolve(root, ...parts);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function uploadToFalStorage(bytes: Buffer, contentType: string, fileName: string): Promise<string> {
  const key = process.env.FAL_KEY?.trim() || process.env.FAL_AI_API_KEY?.trim() || process.env.FALAI_API_KEY?.trim();
  if (!key) {
    throw new Error('This photo is only on this machine. Set FAL_KEY so it can be hosted for Instagram.');
  }
  const initiate = await fetch('https://rest.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
    signal: AbortSignal.timeout(20_000),
  });
  const started = (await initiate.json().catch(() => ({}))) as { upload_url?: string; file_url?: string };
  if (!initiate.ok || !started.upload_url || !started.file_url) {
    throw new Error('The photo could not be hosted for Instagram.');
  }
  const put = await fetch(started.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(60_000),
  });
  if (!put.ok) {
    throw new Error('The photo could not be hosted for Instagram.');
  }
  return started.file_url;
}

/** Public HTTPS URL Meta can fetch. Remote HTTPS links are returned unchanged. */
export async function ensurePublicInstagramImageUrl(imageUrl: string): Promise<string> {
  const local = localMarketingFilePath(imageUrl);
  if (!local) return imageUrl.trim();
  const bytes = await readFile(local);
  return uploadToFalStorage(bytes, contentTypeFor(local), path.basename(local));
}
