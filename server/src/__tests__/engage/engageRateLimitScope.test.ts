/**
 * WP-31 rate limits, without a database: which URLs the Company-OS per-address limiter skips, which engage paths have
 * their own limiter, that an API key is limited by its own number, and that the engage limiters never run unauthenticated.
 */
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { createKeyRateLimiter, hasOwnLimiter, ingestRateLimit, skipsGlobalApiLimit } from '../../engage/rateLimit.js';

function run(limiter: ReturnType<typeof createKeyRateLimiter>, req: Partial<Request>) {
  let status = 200; let nexted = false; let body: unknown;
  const res = { status(s: number) { status = s; return this; }, json(b: unknown) { body = b; return this; }, setHeader() { /* not under test */ } } as unknown as Response;
  limiter(req as Request, res, () => { nexted = true; });
  return { status, nexted, body };
}

describe('which requests the Company-OS limiter counts', () => {
  it('skips the whole engage API, however the path is written', () => {
    for (const u of ['/api/engage', '/api/engage/', '/api/engage/v1/events:track', '/api/engage/webhooks/abc', '/api/engage/me?x=1', '/API/ENGAGE/settings']) {
      expect(skipsGlobalApiLimit(u), u).toBe(true);
    }
  });
  it('still counts everything else, including look-alikes', () => {
    for (const u of ['/api/auth/login', '/api/dashboard', '/api/engagement', '/api/engage-x/me', '/api/x/api/engage', '/engage/v1']) {
      expect(skipsGlobalApiLimit(u), u).toBe(false);
    }
  });
  it('gives the paths a bursty caller uses their own limiter, and only those', () => {
    for (const p of ['/v1/profiles:upsert', '/v1/events:track', '/V1/journeys/x/trigger', '/webhooks/0f0f', '/webhooks']) expect(hasOwnLimiter(p), p).toBe(true);
    for (const p of ['/me', '/settings', '/unsubscribe/tok', '/v10/x', '/admin/organizations', '/webhooksx']) expect(hasOwnLimiter(p), p).toBe(false);
  });
});

describe('ingestion limit per API key', () => {
  it('uses the key\'s own rate_limit_per_min, not one number for every key', () => {
    const lowKey = { engageApiKey: { keyId: 'low', rateLimitPerMin: 2, organizationId: 'o', scopes: [] } } as unknown as Partial<Request>;
    const highKey = { engageApiKey: { keyId: 'high', rateLimitPerMin: 5, organizationId: 'o', scopes: [] } } as unknown as Partial<Request>;
    const hits = (req: Partial<Request>) => Array.from({ length: 7 }, () => run(ingestRateLimit, req).nexted).filter(Boolean).length;
    expect(hits(lowKey)).toBe(2);
    expect(hits(highKey)).toBe(5);
    expect(run(ingestRateLimit, lowKey).status).toBe(429);
  });
  it('refuses a request that has no key at all instead of counting it', () => {
    const r = run(ingestRateLimit, {} as Partial<Request>);
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(401);
  });
});

describe('a limiter keyed by user never runs before sign-in', () => {
  it('answers 401 without a user and 429 past the limit', () => {
    const l = createKeyRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0, key: (req) => req.engageUser?.userId, message: 'Too many requests' });
    expect(run(l, {}).status).toBe(401);
    const req = { engageUser: { userId: 'u1' } } as unknown as Partial<Request>;
    expect(run(l, req).nexted).toBe(true);
    const blocked = run(l, req);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many requests' });
  });
});
