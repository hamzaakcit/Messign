import type { NextFunction, Request, Response } from 'express';
import './types.js';

/**
 * Per-API-key fixed-window limiter. State is per process: with N replicas a key can send up to N times the limit.
 * That is acceptable as abuse protection for the pilot; a shared counter belongs with the WP-31 hardening.
 */
export function createKeyRateLimiter(opts: { limit: number; windowMs: number; now?: () => number; key?: (req: Request) => string | undefined }) {
  const hits = new Map<string, { windowStart: number; count: number }>();
  const now = opts.now ?? Date.now;
  return function keyRateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = opts.key ? opts.key(req) : req.engageApiKey?.keyId;
    if (!key) { res.status(401).json({ error: 'API key required' }); return; } // never run before authentication
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.windowStart >= opts.windowMs) hits.delete(k);
    const cur = hits.get(key);
    if (!cur || t - cur.windowStart >= opts.windowMs) {
      hits.set(key, { windowStart: t, count: 1 });
      next();
      return;
    }
    cur.count += 1;
    if (cur.count > opts.limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((cur.windowStart + opts.windowMs - t) / 1000))));
      res.status(429).json({ error: 'Rate limit exceeded for this API key' });
      return;
    }
    next();
  };
}

export const ingestRateLimit = createKeyRateLimiter({
  limit: Number(process.env.ENGAGE_INGEST_RATE_LIMIT) > 0 ? Number(process.env.ENGAGE_INGEST_RATE_LIMIT) : 600,
  windowMs: 60_000,
});
