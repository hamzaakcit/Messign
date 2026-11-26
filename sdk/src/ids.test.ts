import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_ID_PATTERN, BROWSER_ID_RE, SITE_KEY_PATTERN, SITE_KEY_RE, siteKeyPrefix } from './ids.js';

const tokensPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../server/src/engage/website/tokens.ts',
);
const tokens = existsSync(tokensPath) ? readFileSync(tokensPath, 'utf8') : null;

describe('identifier contract', () => {
  // The server module is the source of the same patterns. It is not on main yet,
  // so the comparison runs only when that file is present.
  it.skipIf(tokens === null)('copies the server site-key and browser-id patterns', () => {
    expect(tokens).toContain(`const SITE_KEY_RE = /${SITE_KEY_PATTERN}/`);
    expect(tokens).toContain(`const BROWSER_ID_RE = /${BROWSER_ID_PATTERN}/`);
  });

  it('treats a browser id as mbt_ plus the 43-character base64url payload of 32 bytes', () => {
    const payload = randomBytes(32).toString('base64url');
    expect(payload).toHaveLength(43);
    expect(BROWSER_ID_RE.test(`mbt_${payload}`)).toBe(true);
    expect(BROWSER_ID_RE.test(`mbt_${payload.slice(0, 42)}`)).toBe(false);
    expect(BROWSER_ID_RE.test(`mbt_${payload}x`)).toBe(false);
    expect(BROWSER_ID_RE.test(payload)).toBe(false);
  });

  it('accepts a site key with a 32-character secret and rejects a shorter one', () => {
    const secret = 'a'.repeat(32);
    expect(SITE_KEY_RE.test(`msk_abcdefgh_${secret}`)).toBe(true);
    expect(SITE_KEY_RE.test(`msk_abcdefgh_${'a'.repeat(31)}`)).toBe(false);
    expect(siteKeyPrefix(`msk_abcdefgh_${secret}`)).toBe('msk_abcdefgh');
    expect(siteKeyPrefix('msk_abcdefgh')).toBeNull();
  });
});
