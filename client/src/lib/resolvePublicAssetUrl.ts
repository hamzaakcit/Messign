/**
 * Build an absolute URL for files in `public/` so they load inside third-party iframes
 * (e.g. Unlayer), which resolve relative paths against the iframe origin, not the app.
 * Respects Vite `base` (e.g. `/app/` when deployed under a subpath).
 */
export function resolvePublicAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const basePath = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const p = path.startsWith('/') ? path.slice(1) : path;
  if (typeof window === 'undefined') return `${basePath}${p}`;
  return new URL(p, `${window.location.origin}${basePath}`).href;
}
