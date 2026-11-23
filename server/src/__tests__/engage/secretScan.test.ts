/** The secret scanner's rules (WP-31): they find the shapes of real credentials and ignore placeholders and code. */
import { describe, expect, it } from 'vitest';
import { fingerprint, isAllowed, scanText } from '../../scripts/secretScan/rules.js';

// Test values are assembled from pieces so that this file itself does not look like a credential to the scanner.
const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const gh = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const key = 'sk-ant-' + 'api03-Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lm';
const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'].join('.');
const url = (pw: string, host = 'db.prod-host.io') => `postgres${'ql'}://app:${pw}@${host}:5432/app`;

describe('secret scan rules', () => {
  it.each([
    ['an AWS key id', `id = "${aws}"`, 'aws-access-key-id'],
    ['a GitHub token', `token: ${gh}`, 'github-token'],
    ['an Anthropic key', `const k = '${key}'`, 'anthropic-key'],
    ['a private key block', pem, 'private-key'],
    ['a JWT', `Authorization: Bearer ${jwt}`, 'jwt'],
    ['a connection string with a real-looking password', `DATABASE_URL=${url('Xk29sLq81vZm04')}`, 'url-with-password'],
    ['a random value in a secret-looking name', 'SOME_API_TOKEN = "k8Jd92LpQx71MsZc03VbNr55Wt"', 'secret-assignment'], // secretscan:ignore
  ])('finds %s', (_name, text, rule) => {
    const f = scanText(text);
    expect(f.map((x) => x.rule)).toContain(rule);
  });

  it('reports a fingerprint and a line, never the value', () => {
    const f = scanText(`ok\nid = "${aws}"`);
    expect(f).toEqual([{ rule: 'aws-access-key-id', line: 2, fingerprint: fingerprint(aws) }]);
    expect(JSON.stringify(f)).not.toContain(aws);
  });

  it.each([
    ['a placeholder', 'API_KEY=your-api-key-goes-here-1234567890'],
    ['an environment lookup', 'const apiToken = process.env.SOME_TOKEN_VALUE_THAT_IS_LONG'],
    ['a property access', 'must_change_password = EXCLUDED.must_change_password'],
    ['a function call', 'const globalApiKey = getGlobalAiplatformApiKey();'],
    ['a field copy', 'merged.mustChangePassword = current.mustChangePassword;'],
    ['a documented example url', 'DATABASE_URL=postgresql://user:password@host/database'],
    ['a local database', `url = ${url('hunter2hunter2', 'localhost')}`],
    ['an internal host', `url = ${url('hunter2hunter2', 'postgres.railway.internal')}`],
    ['a litellm environment reference', 'api_key: "os.environ/ANTHROPIC_API_KEY"'],
    ['a line that says to ignore it', `id = "${aws}" // secretscan:ignore`],
    ['a repeated-character value', 'SOME_SECRET_KEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'],
  ])('ignores %s', (_name, text) => {
    expect(scanText(text)).toEqual([]);
  });

  it('accepts a finding only by its exact fingerprint and rule', () => {
    const f = { rule: 'jwt', line: 1, fingerprint: 'abc123abc123' };
    expect(isAllowed(f, [{ fingerprint: 'abc123abc123', rule: 'jwt', reason: 'a documented example value' }])).toBe(true);
    expect(isAllowed(f, [{ fingerprint: 'abc123abc123', rule: 'private-key', reason: 'a documented example value' }])).toBe(false);
    expect(isAllowed(f, [{ fingerprint: 'zzz', rule: 'jwt', reason: 'a documented example value' }])).toBe(false);
  });
});
