/**
 * Rate limits for `/api`. They count people, not just addresses.
 *
 * One page of the app makes 25 to 40 background calls (notifications, chat, projects, the marketing data), so a flat
 * 100 requests a minute per address ran out after three or four page changes, and everyone behind one office address
 * shared that same 100. Now:
 *
 *  - `flood`: a generous cap per address, in FRONT of token verification, so a flood cannot make the server verify
 *    thousands of tokens. It is not meant to be reached in normal use.
 *  - `api`, after the token is verified: a signed-in person has their own bucket (keyed by user id); an anonymous
 *    request keeps the tight per-address limit. Login keeps its own stricter limit in index.ts.
 *  - `ai`, for `/api/dora`: counts per person too, and ignores plain reads. The sidebar and the briefing popup read
 *    `/api/dora/insights/counts` and `/api/dora/daily` on every page; counting them against 10 AI calls a minute per
 *    address made "AI rate limit reached" appear after a few page changes.
 *
 * `req.userId` is set by `optionalJwt` only for a token whose signature, device fingerprint and session are valid, so
 * a made-up token cannot buy a bigger bucket: it is counted as anonymous.
 */

import type { Request, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export interface ApiLimits {
  /** Requests a minute per address, counted before any token is checked. */
  flood: number;
  /** Requests a minute per address when there is no verified sign-in. */
  anonymous: number;
  /** Requests a minute per signed-in person. */
  user: number;
  /** AI requests a minute per signed-in person (or per address when anonymous). */
  ai: number;
}

export const PRODUCTION_LIMITS: ApiLimits = { flood: 2000, anonymous: 100, user: 600, ai: 10 };
/** Development and E2E: ten times as much, so local work and tests never meet the limit. */
export const DEVELOPMENT_LIMITS: ApiLimits = { flood: 20_000, anonymous: 1000, user: 6000, ai: 100 };

export function limitsFor(isDev: boolean): ApiLimits {
  return isDev ? DEVELOPMENT_LIMITS : PRODUCTION_LIMITS;
}

const MESSAGE = { error: 'Too many requests' };

/** Whose bucket this request counts against: the verified person, otherwise the address. */
export function rateLimitKey(req: Pick<Request, 'userId' | 'ip'>): string {
  return req.userId ? `user:${req.userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

/** Mount first, before `optionalJwt`. */
export function createFloodLimiter(limits: ApiLimits): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: limits.flood,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    message: MESSAGE,
  });
}

/** Mount after `optionalJwt`, so `req.userId` is known. */
export function createApiLimiter(limits: ApiLimits): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: (req) => (req.userId ? limits.user : limits.anonymous),
    keyGenerator: rateLimitKey,
    message: MESSAGE,
  });
}

/**
 * A plain read (GET) of `/api/dora` is not an AI call and is not counted. A briefing refresh (`?refresh=true`) is, and
 * so is every other method.
 */
export function isPlainDoraRead(req: Pick<Request, 'method' | 'query'>): boolean {
  return req.method === 'GET' && req.query?.refresh !== 'true';
}

/** For `/api/dora`. Mount after `optionalJwt`. */
export function createAiLimiter(limits: ApiLimits): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: limits.ai,
    keyGenerator: rateLimitKey,
    skip: isPlainDoraRead,
    message: { error: 'AI rate limit reached' },
  });
}
