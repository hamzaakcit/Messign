/**
 * Publishable site-key shape. Kept identical to `SITE_KEY_RE` in
 * `server/src/engage/website/tokens.ts`. The browser treats a mismatch as
 * "do not call the API", not as a credential it can repair.
 */
export const SITE_KEY_PATTERN = '^msk_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32,}$';

/**
 * Test-browser enrollment id. The server draws 32 random bytes and encodes
 * them with base64url, which is 43 characters with no padding. `mbt_` plus
 * that payload is the whole id. A shorter or longer body is rejected.
 * The database prefix (`mbt_` plus the first 8 characters) is not this id.
 */
export const BROWSER_ID_PATTERN = '^mbt_[A-Za-z0-9_-]{43}$';

export const SITE_KEY_RE: RegExp = new RegExp(SITE_KEY_PATTERN);
export const BROWSER_ID_RE: RegExp = new RegExp(BROWSER_ID_PATTERN);

/**
 * The public prefix stored beside the site-key hash: `msk_` plus 8 characters.
 * Returns null when the key is not a valid site key, so a prefix is never
 * sliced out of an untrusted string and reused as if it were valid.
 */
export function siteKeyPrefix(siteKey: string): string | null {
  if (!SITE_KEY_RE.test(siteKey)) return null;
  return siteKey.slice(0, 12);
}
