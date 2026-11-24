import type { HelmetOptions } from 'helmet';

/**
 * Security headers of the API (WP-31). The API returns JSON (and, for signed-in users, uploaded files); the pages are the
 * client's, served by Vercel with their own headers (vercel.json). So the API's policy is the strictest one there is: a
 * response may load nothing, be framed by nothing, and an uploaded HTML file opened from the API origin runs no script.
 * Before WP-31 this carried the editor's script allowances ('unsafe-inline', 'unsafe-eval'), left over from when the API
 * also served the app.
 */
export function apiHelmetOptions(env: NodeJS.ProcessEnv = process.env): HelmetOptions {
  return {
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        ...(env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  };
}
