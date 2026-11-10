/**
 * Single source of truth for browser origins allowed by Express CORS and Socket.IO.
 * Preview deployments (e.g. *.vercel.app) are opt-in via ALLOW_VERCEL_PREVIEW_CORS=1.
 */

/** Vercel preview / deployment hostnames (https only). */
const VERCEL_APP_ORIGIN_RE = /^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/i;

/**
 * Returns the static allowlist used for simple checks and docs.
 */
export function getAllowedCorsOrigins(): string[] {
  const base =
    process.env.NODE_ENV === 'production'
      ? [
          'https://www.messign.com',
          'https://messign.com',
          'https://messign.vercel.app',
          process.env.CLIENT_URL || '',
          ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
        ]
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3002',
          // Local engage previews (e2e-engage/.auth, .claude/launch.json): the engage preview and the merged preview.
          'http://localhost:3200',
          'http://localhost:3300',
          'http://127.0.0.1:3200',
          'http://127.0.0.1:3300',
        ];
  return [...new Set(base.filter(Boolean))];
}

/**
 * Whether a request Origin header is allowed (Express + Socket.IO).
 * Undefined origin: allow (non-browser tools, same-origin edge cases).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (getAllowedCorsOrigins().includes(origin)) {
    return true;
  }
  if (process.env.ALLOW_VERCEL_PREVIEW_CORS === '1' && VERCEL_APP_ORIGIN_RE.test(origin)) {
    return true;
  }
  return false;
}
