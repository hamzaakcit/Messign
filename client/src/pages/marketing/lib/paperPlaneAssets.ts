import { resolvePublicAssetUrl } from '../../../lib/resolvePublicAssetUrl';
import type { ThemeName } from './types/designTokenTypes';
import { marketingAPI } from '../../../lib/marketingApi';

// ─────────────────────────────────────────────────────────────────────────────
// Paper Plane Assets — static PNG defaults (public/), URL cache, AI resolver
// ─────────────────────────────────────────────────────────────────────────────

const urlCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();
const resolveListeners = new Set<(theme: ThemeName, url: string) => void>();

/** Rendered dimensions for the plane `<img>` element. */
export const PLANE_WIDTH = 96;
export const PLANE_HEIGHT = 60;

const THEME_LIST: ThemeName[] = [
  'executive',
  'startup',
  'luxury',
  'minimal',
  'bold',
  'nature',
  'tech',
  'warm',
];

/**
 * Normalize optional brand primary hex for overlay cache keys and server prompts.
 */
export function normalizeBrandHexForOverlay(input: string | undefined): string | undefined {
  if (!input || typeof input !== 'string') return undefined;
  const t = input.trim();
  const m = t.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${h.toLowerCase()}`;
}

function overlayCacheKey(theme: ThemeName, brandHex?: string): string {
  const b = normalizeBrandHexForOverlay(brandHex);
  return b ? `${theme}|${b}` : theme;
}

/**
 * Public static raster for the paper-plane overlay (per VA2 theme).
 * Served from `client/public/marketing/overlay/paper-plane/{theme}.png` @2x (192×120).
 * Uses an absolute URL in the browser so Unlayer’s iframe loads the image from the app origin.
 */
export function getDefaultStaticPlaneAssetUrl(theme: ThemeName): string {
  return resolvePublicAssetUrl(`marketing/overlay/paper-plane/${theme}.png`);
}

/**
 * Returns the plane asset URL — cached AI-generated image, or static PNG URL.
 * Synchronous: always resolves to a valid URL (public PNG when cache is empty).
 */
export function getPlaneAssetUrl(theme: ThemeName, brandHex?: string): string {
  const key = overlayCacheKey(theme, brandHex);
  const cached = urlCache.get(key);
  if (cached) return cached;
  return getDefaultStaticPlaneAssetUrl(theme);
}

/**
 * Preload default plane PNGs into the browser cache for smoother first paint.
 */
export function preloadPaperPlaneAssets(): void {
  if (typeof Image === 'undefined') return;
  for (const theme of THEME_LIST) {
    const img = new Image();
    img.src = getDefaultStaticPlaneAssetUrl(theme);
  }
}

/**
 * Subscribe to AI asset resolution events. Called whenever a higher-quality
 * image finishes generating, so the caller can rebuild the overlay.
 */
export function onPlaneAssetResolved(
  listener: (theme: ThemeName, url: string) => void,
): () => void {
  resolveListeners.add(listener);
  return () => resolveListeners.delete(listener);
}

export interface ResolvePlaneAssetOptions {
  /** Harmonize generated plane wing tints with org brand (optional). */
  brandPrimaryHex?: string;
}

/**
 * Asynchronously resolves the AI-generated plane image.
 * Fires API call, updates cache, deduplicates in-flight requests.
 * Notifies listeners when a new URL is resolved so overlays can hot-swap.
 */
export async function resolvePlaneAssetAsync(
  theme: ThemeName,
  userId: string,
  opts?: ResolvePlaneAssetOptions,
): Promise<string | null> {
  const brand = normalizeBrandHexForOverlay(opts?.brandPrimaryHex);
  const key = overlayCacheKey(theme, brand);
  const cached = urlCache.get(key);
  if (cached) return cached;

  const existing = pendingRequests.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const checkResult = await marketingAPI.getOverlayAssetUrl(userId, theme, brand);
      if (checkResult?.image_url) {
        const url = checkResult.image_url;
        urlCache.set(key, url);
        resolveListeners.forEach((fn) => fn(theme, url));
        return url;
      }

      const genResult = await marketingAPI.generateOverlayAsset(userId, {
        theme,
        effect: 'paper_plane',
        brand_primary_hex: brand,
      });
      if (genResult?.image_url) {
        const url = genResult.image_url;
        urlCache.set(key, url);
        resolveListeners.forEach((fn) => fn(theme, url));
        return url;
      }
      return null;
    } catch (err) {
      console.warn(`[paperPlaneAssets] Failed to resolve AI plane for ${theme}:`, err);
      return null;
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

/** Directly set a cached URL (used after successful AI generation). */
export function setCachedPlaneUrl(theme: ThemeName, url: string, brandHex?: string): void {
  urlCache.set(overlayCacheKey(theme, brandHex), url);
}

/** Check whether a cached URL exists for a theme (and optional brand). */
export function hasCachedPlaneUrl(theme: ThemeName, brandHex?: string): boolean {
  return urlCache.has(overlayCacheKey(theme, brandHex));
}
