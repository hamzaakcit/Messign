import { BROWSER_ID_RE } from './ids.js';
import { parseResolveBody, type ResolveBody } from './schema.js';

/** Successful resolve responses are reused for at most this long. */
export const SUCCESS_CACHE_MS = 30_000;

/**
 * A 403 is remembered only briefly so a refresh storm does not hammer a
 * disabled installation. It must expire on its own. A later resolve after
 * activation or verification calls the server again.
 */
export const DENY_CACHE_MS = 5_000;

export interface OkCache {
  v: 1;
  kind: 'ok';
  exp: number;
  body: ResolveBody;
}

export interface DenyCache {
  v: 1;
  kind: 'deny';
  exp: number;
  status: 403;
  code: string | null;
}

export type CacheEntry = OkCache | DenyCache;

/**
 * Cache namespace. The site-key prefix is not the full key. The origin is
 * the page origin, not a value from the cached body. Major version keeps a
 * future v2 from reading v1 entries.
 */
export function cacheStorageKey(major: string, origin: string, prefix: string): string {
  return `msdk:${major}:cache:${encodeURIComponent(origin)}:${prefix}`;
}

/** Enrollment namespace. Same origin and prefix rules as the resolve cache. */
export function enrollmentStorageKey(major: string, origin: string, prefix: string): string {
  return `msdk:${major}:enroll:${encodeURIComponent(origin)}:${prefix}`;
}

/**
 * Reads one cache record. Local storage is untrusted: the expiry has to be
 * finite, in the future, and no further away than the TTL for that kind.
 * A success record is run through the same schema parser as a live response.
 * This value is a bootstrap hint only. It is not authorization for a later
 * server operation.
 */
export function parseCacheEntry(raw: string | null, now: number): CacheEntry | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.exp !== 'number' || !Number.isFinite(record.exp)) return null;
  if (record.kind === 'ok') {
    if (!fresh(record.exp, now, SUCCESS_CACHE_MS)) return null;
    const body = parseResolveBody(record.body);
    if (!body) return null;
    return { v: 1, kind: 'ok', exp: record.exp, body };
  }
  if (record.kind === 'deny') {
    if (record.status !== 403) return null;
    if (!fresh(record.exp, now, DENY_CACHE_MS)) return null;
    const code = typeof record.code === 'string' && /^[a-z0-9_]{1,64}$/.test(record.code) ? record.code : null;
    return { v: 1, kind: 'deny', exp: record.exp, status: 403, code };
  }
  return null;
}

/** Builds a success record. The caller still has to write it; storage errors are ignored. */
export function successRecord(body: ResolveBody, now: number): OkCache {
  return { v: 1, kind: 'ok', exp: now + SUCCESS_CACHE_MS, body };
}

/** Builds a 403 record. 401 is never given a record. */
export function denyRecord(code: string | null, now: number): DenyCache {
  return { v: 1, kind: 'deny', exp: now + DENY_CACHE_MS, status: 403, code };
}

/**
 * Reads a stored enrollment. A bare string, a wrong prefix, or the wrong
 * length is discarded. The SDK never invents an id.
 */
export function parseEnrollment(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object') return null;
    const browserId = (value as { browserId?: unknown }).browserId;
    if (typeof browserId !== 'string' || !BROWSER_ID_RE.test(browserId)) return null;
    return browserId;
  } catch {
    return null;
  }
}

/** Serializes an enrollment that has already passed `BROWSER_ID_RE`. */
export function enrollmentRecord(browserId: string): string {
  return JSON.stringify({ v: 1, browserId });
}

function fresh(exp: number, now: number, ttl: number): boolean {
  return exp > now && exp - now <= ttl;
}
