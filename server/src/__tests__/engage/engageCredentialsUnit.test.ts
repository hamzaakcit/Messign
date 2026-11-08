import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import {
  CredentialDecryptError, CredentialKeyError, assertMasterKeyForMount, decryptSecrets, encryptSecrets,
  fingerprintOf, hintOf, loadKeyring, rewrapDataKey, type Keyring,
} from '../../engage/crypto.js';
import { REDACTED, redact, redactString } from '../../engage/redact.js';
import { logError, logInfo } from '../../engage/log.js';
import { parseConfig, parseCreateInput, parseSecrets, CredentialInputError } from '../../engage/credentials.js';

const hex = () => randomBytes(32).toString('hex');
const ring = (id = 'k1', key = hex()): Keyring => loadKeyring({ ENGAGE_MASTER_KEY: key, ENGAGE_MASTER_KEY_ID: id } as NodeJS.ProcessEnv);
const bind = { organizationId: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222' };
const secrets = { api_key: 'fakekey_abcdefghijklmnop1234', account_sid: 'AC-test' };

describe('master key configuration', () => {
  it('requires a 64-character hex key that is not degenerate', () => {
    expect(() => loadKeyring({} as NodeJS.ProcessEnv)).toThrow(CredentialKeyError);
    for (const bad of ['short', 'z'.repeat(64), 'a'.repeat(63), '0'.repeat(64), 'ab'.repeat(32)]) {
      expect(() => loadKeyring({ ENGAGE_MASTER_KEY: bad } as NodeJS.ProcessEnv), bad).toThrow(CredentialKeyError);
    }
    expect(loadKeyring({ ENGAGE_MASTER_KEY: hex() } as NodeJS.ProcessEnv).currentId).toBe('k1');
  });
  it('parses old keys and rejects malformed or duplicate ids', () => {
    const k = loadKeyring({ ENGAGE_MASTER_KEY: hex(), ENGAGE_MASTER_KEY_ID: 'k2', ENGAGE_MASTER_KEYS_OLD: `k1:${hex()}, k0:${hex()}` } as NodeJS.ProcessEnv);
    expect([...k.keys.keys()].sort()).toEqual(['k0', 'k1', 'k2']);
    for (const old of ['k1', 'k1:short', `BAD ID:${hex()}`, `k2:${hex()}`, `k1:${hex()},k1:${hex()}`]) {
      expect(() => loadKeyring({ ENGAGE_MASTER_KEY: hex(), ENGAGE_MASTER_KEY_ID: 'k2', ENGAGE_MASTER_KEYS_OLD: old } as NodeJS.ProcessEnv), old).toThrow(CredentialKeyError);
    }
    expect(() => loadKeyring({ ENGAGE_MASTER_KEY: hex(), ENGAGE_MASTER_KEY_ID: 'Bad Id' } as NodeJS.ProcessEnv)).toThrow(CredentialKeyError);
  });
  it('production refuses to mount without a valid key; other environments tolerate a missing one', () => {
    expect(() => assertMasterKeyForMount({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/ENGAGE_MASTER_KEY is not set/);
    expect(() => assertMasterKeyForMount({ NODE_ENV: 'production', ENGAGE_MASTER_KEY: 'bad' } as NodeJS.ProcessEnv)).toThrow(CredentialKeyError);
    expect(() => assertMasterKeyForMount({ NODE_ENV: 'production', ENGAGE_MASTER_KEY: hex() } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertMasterKeyForMount({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertMasterKeyForMount({ NODE_ENV: 'development', ENGAGE_MASTER_KEY: 'bad' } as NodeJS.ProcessEnv)).toThrow(CredentialKeyError);
  });
});

describe('envelope encryption', () => {
  it('round-trips, and never stores the plaintext', () => {
    const k = ring();
    const enc = encryptSecrets(secrets, bind, k);
    expect(decryptSecrets(enc, bind, k)).toEqual(secrets);
    for (const blob of [enc.secretCiphertext, enc.wrappedDataKey]) {
      expect(blob.includes(Buffer.from('fakekey_abcdefghijklmnop1234'))).toBe(false);
      expect(blob.toString('latin1')).not.toContain('api_key');
    }
    expect(enc.keyId).toBe('k1');
  });
  it('uses a fresh data key and iv every time', () => {
    const k = ring();
    const a = encryptSecrets(secrets, bind, k);
    const b = encryptSecrets(secrets, bind, k);
    expect(a.secretCiphertext.equals(b.secretCiphertext)).toBe(false);
    expect(a.wrappedDataKey.equals(b.wrappedDataKey)).toBe(false);
  });
  it('fails closed on a different tenant, a different account, or tampering anywhere', () => {
    const k = ring();
    const enc = encryptSecrets(secrets, bind, k);
    expect(() => decryptSecrets(enc, { ...bind, organizationId: '33333333-3333-4333-8333-333333333333' }, k)).toThrow(CredentialDecryptError);
    expect(() => decryptSecrets(enc, { ...bind, accountId: '44444444-4444-4444-8444-444444444444' }, k)).toThrow(CredentialDecryptError);
    for (const field of ['secretCiphertext', 'wrappedDataKey'] as const) {
      for (const at of [0, 1, 13, 20, enc[field].length - 1]) {
        const copy = { ...enc, [field]: Buffer.from(enc[field]) };
        copy[field][at] = copy[field][at]! ^ 0x01;
        expect(() => decryptSecrets(copy, bind, k), `${field}[${at}]`).toThrow(CredentialDecryptError);
      }
      expect(() => decryptSecrets({ ...enc, [field]: enc[field].subarray(0, 10) }, bind, k)).toThrow(CredentialDecryptError);
      expect(() => decryptSecrets({ ...enc, [field]: Buffer.alloc(0) }, bind, k)).toThrow(CredentialDecryptError);
    }
  });
  it('fails closed with the wrong master key, an unknown key id, or a swapped wrapped key', () => {
    const k = ring('k1');
    const enc = encryptSecrets(secrets, bind, k);
    expect(() => decryptSecrets(enc, bind, ring('k1'))).toThrow(CredentialDecryptError);
    expect(() => decryptSecrets({ ...enc, keyId: 'k9' }, bind, k)).toThrow(/not available/);
    const other = encryptSecrets({ x: 'y' }, bind, k);
    expect(() => decryptSecrets({ ...enc, wrappedDataKey: other.wrappedDataKey }, bind, k)).toThrow(CredentialDecryptError);
  });
  it('never leaks plaintext or key material in error messages', () => {
    const k = ring();
    const enc = encryptSecrets(secrets, bind, k);
    const tampered = { ...enc, secretCiphertext: Buffer.from(enc.secretCiphertext) };
    tampered.secretCiphertext[30] = tampered.secretCiphertext[30]! ^ 0xff;
    try { decryptSecrets(tampered, bind, k); } catch (e) {
      const text = String(e) + (e as Error).stack;
      expect(text).not.toContain('fakekey_');
      expect(text).not.toContain(k.keys.get('k1')!.toString('hex'));
    }
  });
  it('re-wraps under the current master key without touching the secret ciphertext', () => {
    const old = ring('k1');
    const enc = encryptSecrets(secrets, bind, old);
    const next = loadKeyring({ ENGAGE_MASTER_KEY: hex(), ENGAGE_MASTER_KEY_ID: 'k2', ENGAGE_MASTER_KEYS_OLD: `k1:${old.keys.get('k1')!.toString('hex')}` } as NodeJS.ProcessEnv);
    const re = rewrapDataKey(enc, bind, next);
    expect(re.keyId).toBe('k2');
    expect(decryptSecrets({ ...enc, ...re }, bind, next)).toEqual(secrets);
    const onlyNew = loadKeyring({ ENGAGE_MASTER_KEY: next.keys.get('k2')!.toString('hex'), ENGAGE_MASTER_KEY_ID: 'k2' } as NodeJS.ProcessEnv);
    expect(decryptSecrets({ ...enc, ...re }, bind, onlyNew)).toEqual(secrets);
    expect(() => decryptSecrets(enc, bind, onlyNew), 'old wrap needs the old key').toThrow(/not available/);
    expect(() => rewrapDataKey(enc, bind, onlyNew)).toThrow(CredentialDecryptError);
  });
  it('fingerprint is stable and order independent; hint only for long secrets', () => {
    expect(fingerprintOf({ a: '1', b: '2' })).toBe(fingerprintOf({ b: '2', a: '1' }));
    expect(fingerprintOf({ a: '1' })).not.toBe(fingerprintOf({ a: '2' }));
    expect(fingerprintOf({ a: '1' })).toHaveLength(12);
    expect(hintOf({ api_key: 'abcdefghijklmnop1234' })).toBe('1234');
    expect(hintOf({ account_sid: 'AC-short', api_key: 'abcdefghijklmnop5678' }), 'longest secret, not first by name').toBe('5678');
    expect(hintOf({ api_key: 'short' })).toBeNull();
    expect(hintOf({})).toBeNull();
  });
});

describe('redaction', () => {
  it('redacts secret-looking fields at any depth and leaves others', () => {
    const out = redact({ id: 'a1', apiKey: 'x', nested: { password: 'p', ok: 1, list: [{ token: 't', name: 'n' }] }, Authorization: 'Bearer abc', secret_ciphertext: Buffer.from('z') }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/"x"|"p"|"t"|abc/);
    expect(out.id).toBe('a1');
    expect((out.nested as { ok: number }).ok).toBe(1);
    expect(out.apiKey).toBe(REDACTED);
  });
  it('redacts credential-shaped values inside free text', () => {
    const text = 'failed with key mke_abcd1234_' + 'x'.repeat(40) + ' and Bearer abcdefghijkl and ' + 'AKIA' + 'ABCDEFGHIJKLMNOP' + ' and ' + 'ab'.repeat(32) + ' at postgresql://user:hunter2pw@host:5432/db';
    const out = redactString(text);
    for (const leak of ['mke_abcd1234', 'abcdefghijkl', 'AKIA' + 'ABCDEFGHIJKLMNOP', 'ab'.repeat(32), 'hunter2pw']) expect(out, leak).not.toContain(leak);
  });
  it('reduces Error objects to name and redacted message, without a stack', () => {
    const out = redact(new Error('boom with Bearer abcdefghijkl')) as { message: string; stack?: string };
    expect(out.message).not.toContain('abcdefghijkl');
    expect(out.stack).toBeUndefined();
  });
  it('the engage logger redacts messages and fields before they reach the console', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const spyE = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logInfo('saw Bearer abcdefghijkl', { secret: 'topsecret', accountId: 'a1' });
    logError('db down at postgresql://u:pw123456@h/db');
    const seen = JSON.stringify([...spy.mock.calls, ...spyE.mock.calls]);
    spy.mockRestore(); spyE.mockRestore();
    expect(seen).not.toMatch(/abcdefghijkl|topsecret|pw123456/);
    expect(seen).toContain('a1');
  });
});

describe('credential input validation', () => {
  const ok = { channel: 'email', provider: 'mock', mode: 'test', label: 'Main', config: { region: 'eu-west-1' }, secrets: { api_key: 'v' } };
  it('accepts a valid body', () => {
    expect(parseCreateInput(ok)).toMatchObject({ channel: 'email', provider: 'mock', mode: 'test', label: 'Main' });
    expect(parseCreateInput({ ...ok, secrets: undefined }).secrets).toEqual({});
  });
  it.each([
    [{ ...ok, channel: 'fax' }], [{ ...ok, mode: 'prod' }], [{ ...ok, provider: 'Bad Provider' }], [{ ...ok, label: '' }],
    [{ ...ok, label: 'x'.repeat(101) }], [{ ...ok, config: [] }], [{ ...ok, secrets: 'nope' }], [{ ...ok, secrets: { Bad: 'v' } }],
    [{ ...ok, secrets: { api_key: '' } }], [{ ...ok, secrets: { api_key: 1 } }], [{ ...ok, secrets: { api_key: 'x'.repeat(4097) } }], [null],
  ])('rejects %j', (body) => {
    expect(() => parseCreateInput(body)).toThrow(CredentialInputError);
  });
  it('keeps secret-looking fields out of config', () => {
    for (const name of ['apiKey', 'password', 'secretValue', 'authToken', 'credentials']) {
      expect(() => parseConfig({ [name]: 'v' }), name).toThrow(/looks like a secret/);
    }
    expect(() => parseConfig({ region: 'x'.repeat(513) })).toThrow(CredentialInputError);
    expect(() => parseConfig({ nested: { a: 1 } })).toThrow(CredentialInputError);
    expect(parseConfig({ region: 'eu', port: 25, tls: true })).toEqual({ region: 'eu', port: 25, tls: true });
  });
  it('limits the number of secrets and requires one for rotation', () => {
    expect(() => parseSecrets(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 'v'])), { required: false })).toThrow(/too many/);
    expect(() => parseSecrets({}, { required: true })).toThrow(/at least one/);
  });
});
