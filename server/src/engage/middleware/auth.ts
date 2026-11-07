import type { NextFunction, Request, Response } from 'express';
import { getEngagePool, withApiKeyLookup, withEngageTenant } from '../db.js';
import { hashApiKey, looksLikeApiKey, type ApiKeyScope } from '../apiKeys.js';
import type { EngageUserContext } from '../types.js';

interface LookupRow {
  user_id: string;
  role: string;
  organization_id: string;
  org_slug: string;
  org_product: string;
}

type Failure = { status: number; error: string };

/**
 * Resolves the caller from the verified JWT (set upstream by optionalJwt). The organization comes from the
 * JWT claim and must equal the user row's organization. There is no default-organization fallback.
 */
async function resolveUser(req: Request): Promise<{ ok: true; user: EngageUserContext; product: string } | { ok: false; failure: Failure }> {
  const authUserId = req.userId;
  if (!authUserId) return { ok: false, failure: { status: 401, error: 'Authorization required' } };
  const claimOrg = req.jwtOrganizationId;
  if (!claimOrg) return { ok: false, failure: { status: 401, error: 'Token has no organization' } };

  const result = await getEngagePool().query<LookupRow>('SELECT * FROM engage.lookup_user($1)', [authUserId]);
  const row = result.rows[0];
  if (!row) return { ok: false, failure: { status: 403, error: 'User not provisioned' } };
  if (row.organization_id !== claimOrg) return { ok: false, failure: { status: 403, error: 'Organization mismatch for this session' } };

  return {
    ok: true,
    product: row.org_product,
    user: {
      organizationId: row.organization_id,
      userId: row.user_id,
      authUserId,
      role: row.role,
      orgSlug: row.org_slug,
    },
  };
}

function fail(res: Response, failure: Failure): void {
  res.status(failure.status).json({ error: failure.error });
}

export async function requireEngageUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await resolveUser(req);
    if (!r.ok) return fail(res, r.failure);
    if (r.product !== 'engage') return fail(res, { status: 403, error: 'Organization is not an engage tenant' });
    req.engageUser = r.user;
    next();
  } catch (err) {
    console.error('[engage] requireEngageUser failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/** Platform operators only: an admin of the platform organization. Used for tenant provisioning. */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await resolveUser(req);
    if (!r.ok) return fail(res, r.failure);
    const platformSlug = process.env.PLATFORM_ORG_SLUG?.trim() || 'messign';
    if (r.user.role !== 'admin' || r.user.orgSlug !== platformSlug) {
      return fail(res, { status: 403, error: 'Platform admin required' });
    }
    req.engageUser = r.user;
    next();
  } catch (err) {
    console.error('[engage] requirePlatformAdmin failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

interface KeyRow {
  id: string;
  organization_id: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
}

/** Organization comes from the key record only, never from the request body or headers. */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const presented = req.header('x-api-key')?.trim();
  if (!presented || !looksLikeApiKey(presented)) {
    res.status(401).json({ error: 'API key required' });
    return;
  }
  try {
    const hash = hashApiKey(presented);
    const row = await withApiKeyLookup(hash, async (client) => {
      const r = await client.query<KeyRow>(
        'SELECT id, organization_id, scopes, revoked_at, last_used_at FROM engage.api_keys WHERE key_hash = $1',
        [hash],
      );
      return r.rows[0];
    });
    if (!row || row.revoked_at) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const stale = !row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000;
    if (stale) {
      await withEngageTenant(row.organization_id, (client) =>
        client.query('UPDATE engage.api_keys SET last_used_at = now() WHERE id = $1', [row.id]),
      );
    }
    req.engageApiKey = { organizationId: row.organization_id, keyId: row.id, scopes: row.scopes as ApiKeyScope[] };
    next();
  } catch (err) {
    console.error('[engage] requireApiKey failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export function requireScope(scope: ApiKeyScope) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.engageApiKey?.scopes.includes(scope)) {
      res.status(403).json({ error: `API key lacks scope ${scope}` });
      return;
    }
    next();
  };
}
