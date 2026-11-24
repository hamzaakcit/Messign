import { createHash, randomBytes } from 'crypto';

export const API_KEY_SCOPES = ['ingest', 'journeys:trigger'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const KEY_RE = /^mke_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32,}$/;

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** The plaintext is shown once at creation; only the prefix and sha256 are stored. */
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString('base64url').slice(0, 8);
  const plaintext = `mke_${prefix}_${randomBytes(32).toString('base64url')}`;
  return { plaintext, prefix: `mke_${prefix}`, hash: hashApiKey(plaintext) };
}

export function looksLikeApiKey(value: string): boolean {
  return KEY_RE.test(value);
}

export function parseScopes(input: unknown): ApiKeyScope[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: ApiKeyScope[] = [];
  for (const s of input) {
    if (!(API_KEY_SCOPES as readonly string[]).includes(s as string)) return null;
    if (!out.includes(s as ApiKeyScope)) out.push(s as ApiKeyScope);
  }
  return out;
}
