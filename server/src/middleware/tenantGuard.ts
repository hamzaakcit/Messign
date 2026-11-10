import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { query } from '../db/index.js';

/**
 * Deny-by-default for engage tenants (ADR-017). A tenant is an organization with product `engage`; its users sign in
 * to the engage API and nothing else. The Company-OS routes were written for one organization (the default one) and
 * answer from it whoever calls: found on 2026-11-10, a tenant's token got all of Messign's employee records from
 * `GET /api/users`, and its socket received Messign's activity and presence broadcasts. So tenants are refused at the
 * door, instead of every legacy route being fixed one by one: a route added later is closed to tenants without anyone
 * remembering to close it.
 *
 * Who is a tenant comes from the organization claim of the verified access token (set by `optionalJwt`), looked up in
 * `organizations.product` and cached briefly. A token with no organization claim, an unknown organization, `workspace`
 * and `all` (the platform organization) are not tenants and pass through unchanged.
 */

/** What a tenant's token may reach: sign-in and session, the engage API (it authenticates itself), health. */
export const TENANT_ALLOWED_PREFIXES: readonly string[] = ['/api/auth', '/api/engage', '/api/health'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

export type ProductLookup = (organizationId: string) => Promise<string | null>;

async function lookupProduct(organizationId: string): Promise<string | null> {
  const r = await query<{ product: string }>('SELECT product FROM organizations WHERE id = $1', [organizationId]);
  return r.rows[0]?.product ?? null;
}

/** An organization's product, remembered for a short time so the guard is not a database round trip per request. */
export function createProductResolver(lookup: ProductLookup = lookupProduct, now: () => number = Date.now): ProductLookup {
  const cache = new Map<string, { product: string | null; expires: number }>();
  return async (organizationId) => {
    const hit = cache.get(organizationId);
    if (hit && hit.expires > now()) return hit.product;
    const product = await lookup(organizationId);
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(organizationId, { product, expires: now() + TTL_MS });
    return product;
  };
}

const defaultResolver = createProductResolver();

/**
 * Whether the organization named by a token claim is an engage tenant. Throws when the product cannot be read, so every
 * caller decides what a failure means (the guard and the socket handshake both refuse).
 */
export async function isEngageTenantOrg(organizationId: string | undefined, resolve: ProductLookup = defaultResolver): Promise<boolean> {
  if (!organizationId || !UUID_RE.test(organizationId)) return false;
  return (await resolve(organizationId)) === 'engage';
}

/** Dot segments, doubled or encoded slashes and backslashes: never "allowed", whatever the prefix says. */
const ODD_PATH_RE = /\.\.|\/\/|%2e|%2f|%5c|\\/i;

function isAllowedPath(originalUrl: string): boolean {
  const path = originalUrl.split('?')[0]!.toLowerCase(); // Express matches routes without regard to case
  if (ODD_PATH_RE.test(path)) return false;
  return TENANT_ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function createTenantGuard(isTenant: (organizationId: string | undefined) => Promise<boolean> = isEngageTenantOrg): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.jwtOrganizationId || isAllowedPath(req.originalUrl)) return next();
    let tenant: boolean;
    try {
      tenant = await isTenant(req.jwtOrganizationId);
    } catch {
      res.status(503).json({ error: 'Could not verify the organization' }); // cannot tell who this is: closed, not open
      return;
    }
    if (tenant) {
      res.status(403).json({ error: 'Not available for this organization' });
      return;
    }
    next();
  };
}

/** Mounted on `/api` right after `optionalJwt`. */
export const tenantGuard: RequestHandler = createTenantGuard();
