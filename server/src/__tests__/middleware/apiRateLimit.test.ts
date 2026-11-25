import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAiLimiter,
  createApiLimiter,
  createFloodLimiter,
  DEVELOPMENT_LIMITS,
  isPlainDoraRead,
  limitsFor,
  PRODUCTION_LIMITS,
  rateLimitKey,
  type ApiLimits,
} from '../../middleware/apiRateLimit.js';

// Small numbers, same shape as production, so a test can reach each limit.
const LIMITS: ApiLimits = { flood: 1000, anonymous: 3, user: 6, ai: 2 };

interface Running {
  base: string;
  close: () => Promise<void>;
}

/** A real server with the real limiters. Each call has its own counters. */
async function start(limits: ApiLimits): Promise<Running> {
  const app = express();
  app.use('/api', createFloodLimiter(limits));
  // Stand-in for optionalJwt: a header names the verified person. (The real one sets req.userId only for a valid token.)
  app.use('/api', (req, _res, next) => {
    const who = req.headers['x-test-user'];
    if (typeof who === 'string') req.userId = who;
    next();
  });
  app.use('/api', createApiLimiter(limits));
  app.use('/api/dora', createAiLimiter(limits));
  app.use('/api', (_req, res) => void res.json({ ok: true }));
  let server: Server | undefined;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const running = server as Server;
  return {
    base: `http://127.0.0.1:${(running.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => void running.close(() => resolve())),
  };
}

let main: Running;
beforeAll(async () => {
  main = await start(LIMITS);
});
afterAll(async () => {
  await main.close();
});

async function hit(path: string, init: { user?: string; method?: string } = {}, base = main.base): Promise<number> {
  const res = await fetch(`${base}${path}`, { method: init.method ?? 'GET', headers: init.user ? { 'x-test-user': init.user } : {} });
  return res.status;
}

describe('limits', () => {
  it('give a signed-in person a bigger bucket than an anonymous address, and development ten times production', () => {
    expect(PRODUCTION_LIMITS.user).toBeGreaterThan(PRODUCTION_LIMITS.anonymous);
    expect(PRODUCTION_LIMITS.flood).toBeGreaterThan(PRODUCTION_LIMITS.user);
    expect(limitsFor(false)).toBe(PRODUCTION_LIMITS);
    expect(limitsFor(true)).toBe(DEVELOPMENT_LIMITS);
    expect(DEVELOPMENT_LIMITS.anonymous).toBe(PRODUCTION_LIMITS.anonymous * 10);
  });

  it('is more than a page of the app needs: one page makes about 40 background calls', () => {
    expect(PRODUCTION_LIMITS.user).toBeGreaterThanOrEqual(40 * 10);
  });
});

describe('rateLimitKey', () => {
  it('is the person when verified, otherwise the address', () => {
    expect(rateLimitKey({ userId: 'u1', ip: '1.2.3.4' })).toBe('user:u1');
    expect(rateLimitKey({ userId: undefined, ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
    expect(rateLimitKey({ userId: undefined, ip: undefined })).toBe('ip:');
  });
});

describe('the API limiter', () => {
  it('stops an anonymous address after its few requests', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push(await hit('/api/anon-a'));
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('lets a signed-in person make more than an anonymous address, then stops them', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i += 1) codes.push(await hit('/api/user-a', { user: 'ayse' }));
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes.slice(6)).toEqual([429, 429]);
  });

  it('counts two people on the same address separately', async () => {
    for (let i = 0; i < 6; i += 1) expect(await hit('/api/shared', { user: 'mehmet' })).toBe(200);
    expect(await hit('/api/shared', { user: 'mehmet' })).toBe(429);
    // Elif, on the same address, still has her whole bucket.
    expect(await hit('/api/shared', { user: 'elif' })).toBe(200);
  });

  it("does not let a signed-in person's traffic use up the anonymous bucket", async () => {
    expect(await hit('/api/user-b', { user: 'can' })).toBe(200);
    // The anonymous bucket for this address was used up by the first test above; it is a different bucket.
    expect(await hit('/api/anon-b', { user: 'can' })).toBe(200);
  });

  it('answers with the same message as before', async () => {
    for (let i = 0; i < 4; i += 1) await hit('/api/msg');
    const res = await fetch(`${main.base}/api/msg`);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });
});

describe('the AI limiter on /api/dora', () => {
  it('does not count plain reads, which the sidebar and briefing make on every page', async () => {
    for (let i = 0; i < 5; i += 1) expect(await hit('/api/dora/insights/counts', { user: 'reader' })).toBe(200);
  });

  it('counts an AI call (a POST) per person, and stops after the AI limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i += 1) codes.push(await hit('/api/dora/ask', { user: 'asker', method: 'POST' }));
    expect(codes).toEqual([200, 200, 429]);
    // Someone else is not held up by it.
    expect(await hit('/api/dora/ask', { user: 'other', method: 'POST' })).toBe(200);
  });

  it('counts a briefing refresh as an AI call', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i += 1) codes.push(await hit('/api/dora/daily?refresh=true', { user: 'refresher' }));
    expect(codes).toEqual([200, 200, 429]);
  });

  it('answers with its own message', async () => {
    for (let i = 0; i < 2; i += 1) await hit('/api/dora/ask', { user: 'msg', method: 'POST' });
    const res = await fetch(`${main.base}/api/dora/ask`, { method: 'POST', headers: { 'x-test-user': 'msg' } });
    expect(await res.json()).toEqual({ error: 'AI rate limit reached' });
  });
});

describe('isPlainDoraRead', () => {
  it('is a GET without refresh, nothing else', () => {
    expect(isPlainDoraRead({ method: 'GET', query: {} })).toBe(true);
    expect(isPlainDoraRead({ method: 'GET', query: { refresh: 'true' } })).toBe(false);
    expect(isPlainDoraRead({ method: 'POST', query: {} })).toBe(false);
  });
});

describe('the flood cap', () => {
  it('stops an address that sends far too much, even with a sign-in, before any token is looked at', async () => {
    const flood = await start({ flood: 5, anonymous: 100, user: 100, ai: 100 });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 7; i += 1) codes.push(await hit(`/api/x${i}`, { user: `u${i}` }, flood.base));
      expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
    } finally {
      await flood.close();
    }
  });
});
