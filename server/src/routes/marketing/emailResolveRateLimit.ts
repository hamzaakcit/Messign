/**
 * Soft rate limit for POST resolve-email-images (per org, sliding window).
 * Phase 2: move to Redis for multi-instance fairness.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const buckets = new Map<string, number[]>();

function prune(ts: number, arr: number[]): number[] {
  return arr.filter((t) => ts - t < WINDOW_MS);
}

/**
 * @returns ok false when org exceeded budget; retryAfterSec approximate seconds to wait.
 */
export function checkEmailResolveRateLimit(orgId: string): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const prev = prune(now, buckets.get(orgId) ?? []);
  if (prev.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...prev);
    const retryAfterMs = WINDOW_MS - (now - oldest);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  prev.push(now);
  buckets.set(orgId, prev);
  return { ok: true };
}
