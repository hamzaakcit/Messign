const WINDOW_MS = 60_000;
/** Max duel API calls per user per channel per rolling minute. */
const MAX_PER_WINDOW = 6;

const buckets = new Map<string, { count: number; windowStart: number }>();

/**
 * Enforces a rolling per-minute cap on channel duel endpoints.
 * @returns `ok` if the request may proceed, `rate_limited` otherwise.
 */
export function assertDuelRateLimit(userId: string, channelId: string): 'ok' | 'rate_limited' {
  const key = `${userId}:${channelId}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > MAX_PER_WINDOW) return 'rate_limited';
  return 'ok';
}
