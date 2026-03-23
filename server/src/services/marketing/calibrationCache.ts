/**
 * Performance Calibration Cache
 *
 * In-memory cache for calibration prompts.
 * TTL: 1 hour per workspace+channel combination.
 * Invalidated when new performance data is recorded.
 */

import type { CalibrationPrompt } from './performanceCollector.js';

interface CacheEntry {
  prompt: CalibrationPrompt;
  cachedAt: number;
  expiresAt: number;
}

type CacheKey = string;

const DEFAULT_TTL_MS = 60 * 60 * 1000;

const cache = new Map<CacheKey, CacheEntry>();

/** Build a cache key: `organizationId:channel[:brandProfileId]` */
export function buildCacheKey(
  organizationId: string,
  channel: string,
  brandProfileId?: string,
): CacheKey {
  const parts = [organizationId, channel];
  if (brandProfileId) parts.push(brandProfileId);
  return parts.join(':');
}

/** Get a cached calibration prompt. Returns null if not cached or expired. */
export function getCachedCalibration(
  organizationId: string,
  channel: string,
  brandProfileId?: string,
): CalibrationPrompt | null {
  const key = buildCacheKey(organizationId, channel, brandProfileId);
  const entry = cache.get(key);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.prompt;
}

/** Store a calibration prompt in the cache. */
export function setCachedCalibration(
  organizationId: string,
  channel: string,
  prompt: CalibrationPrompt,
  brandProfileId?: string,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const key = buildCacheKey(organizationId, channel, brandProfileId);
  const now = Date.now();
  cache.set(key, {
    prompt,
    cachedAt: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Invalidate cached calibration for a workspace.
 * Call when new performance data is recorded.
 */
export function invalidateCalibrationCache(
  organizationId: string,
  channel?: string,
): number {
  let invalidated = 0;
  const prefix = channel
    ? `${organizationId}:${channel}`
    : organizationId;

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      invalidated++;
    }
  }
  return invalidated;
}

/** Clear the entire cache. Used in testing. */
export function clearCalibrationCache(): void {
  cache.clear();
}

/** Get cache statistics for monitoring/debugging. */
export function getCalibrationCacheStats(): {
  size: number;
  entries: Array<{ key: string; expiresIn: number }>;
} {
  const now = Date.now();
  const entries = Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    expiresIn: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
  }));
  return { size: cache.size, entries };
}
