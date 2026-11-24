import type { NextFunction, Request, Response } from 'express';
import './types.js';

type Limit = number | ((req: Request) => number);

/**
 * Fixed-window limiter keyed by whatever `key` returns (default: the authenticated API key). State is per process: with N
 * replicas a caller can send up to N times the limit. That is acceptable abuse protection while the API runs as one
 * replica (the pilot); a shared counter belongs with a second replica (accepted in docs/quality/security-checklist-wp31.md).
 * `limit` may depend on the request, which is how an API key gets its own limit.
 */
export function createKeyRateLimiter(opts: { limit: Limit; windowMs: number; now?: () => number; key?: (req: Request) => string | undefined; message?: string }) {
  const hits = new Map<string, { windowStart: number; count: number }>();
  const now = opts.now ?? Date.now;
  return function keyRateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = opts.key ? opts.key(req) : req.engageApiKey?.keyId;
    if (!key) { res.status(401).json({ error: 'API key required' }); return; } // never run before authentication
    const limit = typeof opts.limit === 'function' ? opts.limit(req) : opts.limit;
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.windowStart >= opts.windowMs) hits.delete(k);
    const cur = hits.get(key);
    if (!cur || t - cur.windowStart >= opts.windowMs) {
      hits.set(key, { windowStart: t, count: 1 });
      next();
      return;
    }
    cur.count += 1;
    if (cur.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((cur.windowStart + opts.windowMs - t) / 1000))));
      res.status(429).json({ error: opts.message ?? 'Rate limit exceeded for this API key' });
      return;
    }
    next();
  };
}

const positive = (raw: string | undefined, fallback: number): number => (Number(raw) > 0 ? Number(raw) : fallback);

/**
 * Per API key, from the key's own `rate_limit_per_min` (default 600 when the key is made). ENGAGE_INGEST_RATE_LIMIT, when
 * set, is a ceiling over every key. Before WP-31 the same number applied to all keys and the column was ignored.
 */
export const ingestRateLimit = createKeyRateLimiter({
  limit: (req) => Math.min(req.engageApiKey?.rateLimitPerMin ?? 600, positive(process.env.ENGAGE_INGEST_RATE_LIMIT, Number.POSITIVE_INFINITY)),
  windowMs: 60_000,
});

/** Paths under /api/engage that have their own limiter and are therefore not counted by the per-IP one: tenants' servers and providers call them in bursts from few addresses. */
export function hasOwnLimiter(pathUnderEngage: string): boolean {
  return /^\/(v1|webhooks)(\/|$)/i.test(pathUnderEngage);
}

/** True for a request URL under /api/engage: the Company-OS per-address limiter (100 a minute) does not count those. */
export function skipsGlobalApiLimit(originalUrl: string): boolean {
  return /^\/api\/engage(\/|\?|$)/i.test(originalUrl);
}

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown';

/**
 * Per client address, for the whole engage API except the paths in `hasOwnLimiter`. Replaces the Company-OS limit of 100 a
 * minute per address, which would have throttled a shop's whole team behind one office address, and which also capped
 * ingestion and provider reports long before their own limits applied.
 */
export const engageIpRateLimit = createKeyRateLimiter({
  limit: positive(process.env.ENGAGE_IP_RATE_LIMIT, 600),
  windowMs: 60_000,
  key: clientIp,
  message: 'Too many requests',
});

/** Per signed-in user, after authentication. A runaway browser tab or a leaked token cannot hammer the API. */
export const engageUserRateLimit = createKeyRateLimiter({
  limit: positive(process.env.ENGAGE_USER_RATE_LIMIT, 600),
  windowMs: 60_000,
  key: (req) => req.engageUser?.userId,
  message: 'Too many requests',
});

/** Platform operator routes (tenant provisioning, API key creation): few and deliberate. */
export const platformAdminRateLimit = createKeyRateLimiter({
  limit: 30,
  windowMs: 60_000,
  key: (req) => req.engageUser?.userId,
  message: 'Too many requests',
});
