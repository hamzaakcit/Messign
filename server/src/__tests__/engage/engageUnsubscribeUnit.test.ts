import { describe, expect, it } from 'vitest';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import type { Keyring } from '../../engage/crypto.js';
import {
  UnsubscribeConfigError, buildUnsubscribeLinks, createUnsubscribeToken, maskEmail, verifyUnsubscribeToken,
} from '../../engage/unsubscribe.js';

const ring = (currentId = 'k1', extra: Record<string, Buffer> = {}): Keyring => ({
  currentId,
  keys: new Map<string, Buffer>([[currentId, Buffer.from(randomBytes(32))], ...Object.entries(extra)]),
});
const ctx = () => ({ organizationId: randomUUID(), profileId: randomUUID(), channel: 'email' as const });
const re = (token: string, mutate: (claims: Record<string, unknown>) => void): string => {
  const [payload, sig] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
  mutate(claims);
  return `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${sig}`;
};

describe('unsubscribe token', () => {
  it('round-trips the tenant, profile and channel, with no personal data in the token', () => {
    const k = ring(); const c = ctx();
    const t = createUnsubscribeToken(c, k);
    expect(verifyUnsubscribeToken(t, k)).toEqual(c);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(t.length).toBeLessThan(400);
    const claims = JSON.parse(Buffer.from(t.split('.')[0]!, 'base64url').toString('utf8'));
    expect(Object.keys(claims).sort()).toEqual(['c', 'k', 'o', 'p', 'v']);
  });

  it('rejects a changed organization, profile or channel: the signature covers them', () => {
    const k = ring(); const t = createUnsubscribeToken(ctx(), k);
    expect(verifyUnsubscribeToken(re(t, (x) => { x.o = randomUUID(); }), k)).toBeNull();
    expect(verifyUnsubscribeToken(re(t, (x) => { x.p = randomUUID(); }), k)).toBeNull();
    expect(verifyUnsubscribeToken(re(t, (x) => { x.c = 'sms'; }), k)).toBeNull();
    expect(verifyUnsubscribeToken(re(t, (x) => { x.v = 2; }), k)).toBeNull();
  });

  it('rejects a token signed with another key, an unknown key id, and a truncated or extended signature', () => {
    const k = ring(); const other = ring(); const c = ctx();
    expect(verifyUnsubscribeToken(createUnsubscribeToken(c, other), k)).toBeNull();
    const t = createUnsubscribeToken(c, k);
    expect(verifyUnsubscribeToken(re(t, (x) => { x.k = 'nope'; }), k)).toBeNull();
    expect(verifyUnsubscribeToken(t.slice(0, -2), k)).toBeNull();
    expect(verifyUnsubscribeToken(`${t}AA`, k)).toBeNull();
  });

  it('keeps old links working after the master key is rotated, because the key id travels in the token', () => {
    const oldKey = ring('k1'); const c = ctx();
    const t = createUnsubscribeToken(c, oldKey);
    const rotated: Keyring = { currentId: 'k2', keys: new Map([['k2', Buffer.from(randomBytes(32))], ['k1', oldKey.keys.get('k1')!]]) };
    expect(verifyUnsubscribeToken(t, rotated)).toEqual(c);
    expect(verifyUnsubscribeToken(t, { currentId: 'k2', keys: new Map([['k2', Buffer.from(randomBytes(32))]]) })).toBeNull(); // old key retired
  });

  it.each([
    ['empty', ''], ['no dot', 'abc'], ['three parts', 'a.b.c'], ['empty signature', 'abc.'], ['empty payload', '.abc'],
    ['not base64 json', 'bm90IGpzb24.AAAA'], ['array payload', `${Buffer.from('[]').toString('base64url')}.AAAA`],
    ['too long', `${'a'.repeat(500)}.AAAA`], ['number', 42], ['null', null], ['object', {}],
  ])('never throws on junk (%s)', (_n, junk) => {
    expect(verifyUnsubscribeToken(junk as unknown, ring())).toBeNull();
  });

  it('does not verify, rather than throw, when no master key is configured', () => {
    const saved = process.env.ENGAGE_MASTER_KEY;
    delete process.env.ENGAGE_MASTER_KEY;
    try { expect(verifyUnsubscribeToken('a.b')).toBeNull(); } finally { if (saved !== undefined) process.env.ENGAGE_MASTER_KEY = saved; }
  });

  it('refuses to create a token for non-UUID ids or a channel without an unsubscribe link', () => {
    const k = ring();
    expect(() => createUnsubscribeToken({ ...ctx(), organizationId: 'nope' }, k)).toThrow(UnsubscribeConfigError);
    expect(() => createUnsubscribeToken({ ...ctx(), profileId: "x' OR 1=1" }, k)).toThrow(UnsubscribeConfigError);
    expect(() => createUnsubscribeToken({ ...ctx(), channel: 'sms' }, k)).toThrow(UnsubscribeConfigError);
  });

  // Built from the documented format alone (HMAC-SHA256 over the base64url payload, keyed by an HMAC of a fixed label
  // with the master key), so a signed token for something the code must refuse can be made, which createUnsubscribeToken
  // itself never would.
  const craft = (k: Keyring, claims: Record<string, unknown>) => {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const subkey = createHmac('sha256', k.keys.get(String(claims.k))!).update('engage-unsubscribe-token-v1').digest();
    return `${payload}.${createHmac('sha256', subkey).update(payload).digest().toString('base64url')}`;
  };

  it('the documented format verifies, and a correctly signed token for another channel or version is still refused', () => {
    const k = ring(); const c = ctx();
    const base = { v: 1, k: 'k1', o: c.organizationId, p: c.profileId, c: 'email' };
    expect(verifyUnsubscribeToken(craft(k, base), k)).toEqual(c);
    expect(verifyUnsubscribeToken(craft(k, { ...base, c: 'sms' }), k)).toBeNull();
    expect(verifyUnsubscribeToken(craft(k, { ...base, c: 'whatsapp' }), k)).toBeNull();
    expect(verifyUnsubscribeToken(craft(k, { ...base, c: 7 }), k)).toBeNull();
    expect(verifyUnsubscribeToken(craft(k, { ...base, v: 2 }), k)).toBeNull();
    expect(verifyUnsubscribeToken(craft(k, { ...base, o: 'not-a-uuid' }), k)).toBeNull();
    expect(verifyUnsubscribeToken(craft(k, { ...base, p: 42 }), k)).toBeNull();
  });

  it('a profile id in capitals comes back in lower case', () => {
    const k = ring(); const c = ctx();
    const t = createUnsubscribeToken({ ...c, profileId: c.profileId.toUpperCase() }, k);
    expect(verifyUnsubscribeToken(t, k)?.profileId).toBe(c.profileId);
  });
});

describe('unsubscribe links', () => {
  const env = { ENGAGE_PUBLIC_APP_URL: 'https://app.example.com/some/path', ENGAGE_PUBLIC_API_URL: 'https://api.example.com' } as NodeJS.ProcessEnv;

  it('builds the page link on the app origin and the one-click link on the API origin, with the same token', () => {
    const k = ring(); const c = ctx();
    const l = buildUnsubscribeLinks(c, env, k);
    const token = createUnsubscribeToken(c, k);
    expect(l.pageUrl).toBe(`https://app.example.com/u/${token}`);
    expect(l.oneClickUrl).toBe(`https://api.example.com/api/engage/unsubscribe/${token}`);
  });

  it.each([
    ['app origin missing', { ENGAGE_PUBLIC_API_URL: 'https://api.example.com' }],
    ['api origin missing', { ENGAGE_PUBLIC_APP_URL: 'https://app.example.com' }],
    ['app origin not https', { ENGAGE_PUBLIC_APP_URL: 'http://app.example.com', ENGAGE_PUBLIC_API_URL: 'https://api.example.com' }],
    ['api origin not a URL', { ENGAGE_PUBLIC_APP_URL: 'https://app.example.com', ENGAGE_PUBLIC_API_URL: 'api.example.com' }],
    ['both blank', { ENGAGE_PUBLIC_APP_URL: '  ', ENGAGE_PUBLIC_API_URL: '' }],
  ])('fails closed when %s', (_n, e) => {
    expect(() => buildUnsubscribeLinks(ctx(), e as NodeJS.ProcessEnv, ring())).toThrow(UnsubscribeConfigError);
  });
});

describe('maskEmail', () => {
  it('hides most of the local part and keeps the domain', () => {
    expect(maskEmail('ayse.yilmaz@gmail.com')).toBe('a******@gmail.com');
    expect(maskEmail('al@example.com')).toBe('a**@example.com');
    expect(maskEmail('a@example.com')).toBe('a**@example.com');
  });
  it('never returns the address itself, and survives odd input', () => {
    expect(maskEmail('nobody')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('x@y.com')).not.toContain('x@y');
  });
});
