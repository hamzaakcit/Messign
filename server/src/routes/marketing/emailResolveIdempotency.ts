/**
 * Idempotency for POST resolve-email-images.
 * In-process Map (single instance) + optional Redis when `EMAIL_RESOLVE_REDIS` is not `0`.
 */

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const REDIS_TTL_SEC = Math.ceil(IDEMPOTENCY_TTL_MS / 1000);
const MAX_ENTRIES = 300;
const REDIS_KEY_PREFIX = 'email-resolve:v1:';

const USE_REDIS = process.env.EMAIL_RESOLVE_REDIS !== '0';

interface CachedResolve {
  at: number;
  body: Record<string, unknown>;
}

const cache = new Map<string, CachedResolve>();

function prune(): void {
  const now = Date.now();
  if (cache.size <= MAX_ENTRIES) {
    for (const [k, v] of cache) {
      if (now - v.at > IDEMPOTENCY_TTL_MS) cache.delete(k);
    }
    return;
  }
  const keys = [...cache.keys()];
  for (const k of keys) {
    const v = cache.get(k);
    if (!v || now - v.at > IDEMPOTENCY_TTL_MS) cache.delete(k);
  }
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
    else break;
  }
}

export function getCachedEmailResolve(key: string): Record<string, unknown> | null {
  prune();
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > IDEMPOTENCY_TTL_MS) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.body;
}

export function setCachedEmailResolve(key: string, body: Record<string, unknown>): void {
  prune();
  cache.set(key, { at: Date.now(), body });
}

async function redisGet(key: string): Promise<string | null> {
  const { redisConnection } = await import('../../queue/connection.js');
  return redisConnection.get(REDIS_KEY_PREFIX + key);
}

async function redisSet(key: string, json: string): Promise<void> {
  const { redisConnection } = await import('../../queue/connection.js');
  await redisConnection.setex(REDIS_KEY_PREFIX + key, REDIS_TTL_SEC, json);
}

/**
 * Returns cached resolve body when idempotency key replays (Redis first, then in-process).
 */
export async function getCachedEmailResolveAsync(key: string): Promise<Record<string, unknown> | null> {
  if (USE_REDIS) {
    try {
      const raw = await redisGet(key);
      if (raw) {
        return JSON.parse(raw) as Record<string, unknown>;
      }
    } catch (e) {
      console.warn('[emailResolve] Redis get failed, falling back to in-process cache', e);
    }
  }
  return getCachedEmailResolve(key);
}

/**
 * Stores resolve body for idempotent replay (Redis + in-process).
 */
export async function setCachedEmailResolveAsync(
  key: string,
  body: Record<string, unknown>,
): Promise<void> {
  setCachedEmailResolve(key, body);
  if (USE_REDIS) {
    try {
      await redisSet(key, JSON.stringify(body));
    } catch (e) {
      console.warn('[emailResolve] Redis set failed (in-process cache still set)', e);
    }
  }
}
