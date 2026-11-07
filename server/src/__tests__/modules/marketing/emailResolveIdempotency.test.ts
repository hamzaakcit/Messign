import { describe, it, expect, vi } from 'vitest';
import {
  getCachedEmailResolve,
  setCachedEmailResolve,
  getCachedEmailResolveAsync,
  setCachedEmailResolveAsync,
} from '../../../routes/marketing/emailResolveIdempotency.js';

vi.mock('../../../queue/connection.js', () => ({
  redisConnection: {
    get: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
    setex: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
  },
}));

describe('emailResolveIdempotency', () => {
  const body = { images: {}, ok: true };

  function uniqueKey(): string {
    return `test:org:content:idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  it('getCachedEmailResolve returns replay body after setCachedEmailResolve', () => {
    const key = uniqueKey();
    setCachedEmailResolve(key, body);
    expect(getCachedEmailResolve(key)).toEqual(body);
  });

  it('getCachedEmailResolveAsync falls back to in-process map when Redis is unavailable', async () => {
    const key = uniqueKey();
    setCachedEmailResolve(key, body);
    const hit = await getCachedEmailResolveAsync(key);
    expect(hit).toEqual(body);
  });

  it('setCachedEmailResolveAsync updates in-process cache', async () => {
    const key = uniqueKey();
    const next = { ...body, version: 2 };
    await setCachedEmailResolveAsync(key, next as Record<string, unknown>);
    const hit = await getCachedEmailResolveAsync(key);
    expect((hit as { version?: number }).version).toBe(2);
  });
});
