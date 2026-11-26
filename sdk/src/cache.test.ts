import { DENY_CACHE_MS, SUCCESS_CACHE_MS, parseCacheEntry, parseEnrollment, successRecord } from './cache.js';
import type { ResolveBody } from './schema.js';

const body: ResolveBody = {
  installationId: '11111111-1111-4111-8111-111111111111',
  environment: 'production',
  mode: 'live',
  audience: 'live',
};

describe('bootstrap cache', () => {
  const now = 1_000_000;

  it('accepts a success record only inside 30 seconds', () => {
    expect(SUCCESS_CACHE_MS).toBe(30_000);
    const record = successRecord(body, now);
    expect(parseCacheEntry(JSON.stringify(record), now)).toEqual(record);
    expect(parseCacheEntry(JSON.stringify({ ...record, exp: now + SUCCESS_CACHE_MS + 1 }), now)).toBeNull();
    expect(parseCacheEntry(JSON.stringify({ ...record, exp: now }), now)).toBeNull();
  });

  it('accepts a 403 record only inside its shorter TTL and never a 401', () => {
    expect(DENY_CACHE_MS).toBeLessThan(SUCCESS_CACHE_MS);
    const deny = { v: 1, kind: 'deny', exp: now + DENY_CACHE_MS, status: 403, code: 'disabled' };
    expect(parseCacheEntry(JSON.stringify(deny), now)?.kind).toBe('deny');
    expect(parseCacheEntry(JSON.stringify({ ...deny, exp: now + DENY_CACHE_MS + 1 }), now)).toBeNull();
    expect(parseCacheEntry(JSON.stringify({ ...deny, status: 401 }), now)).toBeNull();
  });

  it('rejects a malformed success body and a malformed enrollment', () => {
    const record = successRecord(body, now);
    expect(parseCacheEntry(JSON.stringify({ ...record, body: { audience: 'live' } }), now)).toBeNull();
    expect(parseEnrollment(JSON.stringify({ v: 1, browserId: `mbt_${'b'.repeat(43)}` }))).toBe(`mbt_${'b'.repeat(43)}`);
    expect(parseEnrollment(JSON.stringify({ v: 1, browserId: 'mbt_short' }))).toBeNull();
    expect(parseEnrollment(`mbt_${'b'.repeat(43)}`)).toBeNull();
  });
});
