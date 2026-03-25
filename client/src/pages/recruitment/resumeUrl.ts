import { API_ORIGIN } from '@/lib/apiCore';

/**
 * Absolute URL for uploaded resume paths returned by the API (often `/uploads/...`).
 */
export function publicResumeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
