/**
 * Appends a cache-bust query parameter for remote image URLs so the browser refetches
 * when the same path is reused with new bytes (e.g. Fal CDN / storage).
 * Data URLs are returned unchanged.
 */
export function cacheBustImageUrl(url: string, version: number): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version}`;
}
