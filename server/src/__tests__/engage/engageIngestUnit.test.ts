import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { createKeyRateLimiter } from '../../engage/rateLimit.js';
import { MAX_BATCH, describeIssues, trackSchema, triggerSchema, upsertSchema } from '../../engage/ingest.js';
import { openApiDocument } from '../../engage/openapi.js';
import { v1Router } from '../../engage/v1Routes.js';

function run(limiter: ReturnType<typeof createKeyRateLimiter>, keyId?: string) {
  let status = 200; let headers: Record<string, string> = {}; let nexted = false;
  const res = { status(s: number) { status = s; return this; }, json() { return this; }, setHeader(k: string, v: string) { headers[k] = v; } } as unknown as Response;
  limiter({ engageApiKey: keyId ? { keyId } : undefined } as unknown as Request, res, () => { nexted = true; });
  return { status, headers, nexted };
}

describe('per-key rate limiter', () => {
  it('allows the limit, then answers 429 with Retry-After until the window passes', () => {
    let t = 1_000;
    const l = createKeyRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect([1, 2, 3].map(() => run(l, 'k1').nexted)).toEqual([true, true, true]);
    const blocked = run(l, 'k1');
    expect(blocked.nexted).toBe(false);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    t += 60_000;
    expect(run(l, 'k1').nexted).toBe(true);
  });
  it('counts keys separately', () => {
    const l = createKeyRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(run(l, 'a').nexted).toBe(true);
    expect(run(l, 'b').nexted).toBe(true);
    expect(run(l, 'a').nexted).toBe(false);
  });
  it('refuses to run without an authenticated key', () => {
    const r = run(createKeyRateLimiter({ limit: 5, windowMs: 1000 }));
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(401);
  });
});

describe('request schemas', () => {
  const ev = { client_event_id: 'e1', external_id: 'c1', name: 'order_completed', occurred_at: '2026-11-08T10:00:00Z', properties: { order_id: 'o1' } };
  it('reject a body organization_id and any unknown field (strict)', () => {
    expect(upsertSchema.safeParse({ external_id: 'c1', organization_id: 'x' }).success).toBe(false);
    expect(trackSchema.safeParse({ events: [{ ...ev, organization_id: 'x' }] }).success).toBe(false);
    expect(triggerSchema.safeParse({ external_id: 'c1', idempotency_key: 'k', extra: 1 }).success).toBe(false);
  });
  it('limits a batch to 500 events and requires at least one', () => {
    expect(trackSchema.safeParse({ events: Array(MAX_BATCH).fill(ev) }).success).toBe(true);
    expect(trackSchema.safeParse({ events: Array(MAX_BATCH + 1).fill(ev) }).success).toBe(false);
    expect(trackSchema.safeParse({ events: [] }).success).toBe(false);
  });
  it.each(['Order', 'order-completed', '1abc', '', 'a'.repeat(65)])('rejects event name %j', (name) => {
    expect(trackSchema.safeParse({ events: [{ ...ev, name }] }).success).toBe(false);
  });
  it('rejects a non-ISO timestamp and oversized properties', () => {
    expect(trackSchema.safeParse({ events: [{ ...ev, occurred_at: 'yesterday' }] }).success).toBe(false);
    expect(trackSchema.safeParse({ events: [{ ...ev, properties: { blob: 'x'.repeat(9000) } }] }).success).toBe(false);
  });
  it('rejects unknown fields inside a consent', () => {
    expect(upsertSchema.safeParse({ external_id: 'c1', consents: [{ channel: 'email', status: 'revoked', surprise: 1 }] }).success).toBe(false);
  });
  it('requires an idempotency key for triggers', () => {
    expect(triggerSchema.safeParse({ external_id: 'c1' }).success).toBe(false);
  });
  it('API consents cannot claim sources only Messign observes', () => {
    for (const source of ['iys', 'unsubscribe_link', 'stop_keyword']) {
      expect(upsertSchema.safeParse({ external_id: 'c1', consents: [{ channel: 'email', status: 'revoked', source }] }).success, source).toBe(false);
    }
  });
  it('issue descriptions carry paths and messages, never the submitted value', () => {
    const r = upsertSchema.safeParse({ external_id: 'c1', identifiers: { email: 12345, bogus: 'secret-value-123' } });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(describeIssues(r.error))).not.toMatch(/secret-value-123|12345/);
  });
});

describe('OpenAPI document matches the routes', () => {
  it('documents every v1 route and nothing else', () => {
    interface Layer { route?: { path: string | RegExp; methods: Record<string, boolean> } }
    const routes = ((v1Router as unknown as { stack: Layer[] }).stack)
      .filter((l) => l.route)
      .flatMap((l) => {
        const raw = l.route!.path instanceof RegExp ? l.route!.path.source.replace(/^\^\\\//, '/').replace(/\$$/, '').replace(/\\\//g, '/') : l.route!.path.replace(/:key/, '{key}');
        return Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${raw}`);
      })
      .sort();
    const documented = Object.entries(openApiDocument.paths)
      .flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`))
      .sort();
    expect(routes).toEqual(documented);
  });
});

describe('route wiring', () => {
  it('every ingest route authenticates first, then rate-limits, then checks scope', async () => {
    const { requireApiKey } = await import('../../engage/middleware/auth.js');
    const { ingestRateLimit } = await import('../../engage/rateLimit.js');
    interface Layer { route?: { path: string | RegExp; stack: Array<{ handle: unknown }> } }
    const routes = ((v1Router as unknown as { stack: Layer[] }).stack).filter((l) => l.route).map((l) => l.route!);
    const write = routes.filter((r) => !String(r.path).includes('openapi'));
    expect(write.length).toBe(3);
    for (const r of write) {
      const h = r.stack.map((x) => x.handle);
      expect(h[0], `${String(r.path)} first`).toBe(requireApiKey);
      expect(h[1], `${String(r.path)} second`).toBe(ingestRateLimit);
      expect(h.length, `${String(r.path)} has a scope check`).toBeGreaterThanOrEqual(4);
    }
  });
});
