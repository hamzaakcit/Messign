import type { Request, Response, NextFunction } from 'express';
import { query, sanitizeUuid } from '../db/index.js';
import { ensureReimbursementUserForAuth } from '../db/ensureReimbursementUser.js';
import { getByAuthUserId } from '../db/employeeAuthDb.js';

const DEFAULT_ORG_SLUG = 'messign';
const isDev = process.env.NODE_ENV !== 'production';

export interface AuthenticatedRequest extends Request {
  userId: string;
  role: string;
  user: { id: string; role: string };
  tenantId: string;
  organizationId: string;
}

interface CachedUser { id: string; role: string; organization_id: string; cachedAt: number }
const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 500;

let cachedDefaultOrgId: string | undefined;

function getCachedUser(authKey: string): CachedUser | undefined {
  const entry = userCache.get(authKey);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > USER_CACHE_TTL_MS) {
    userCache.delete(authKey);
    return undefined;
  }
  return entry;
}

function setCachedUser(authKey: string, row: { id: string; role?: string; organization_id: string }): void {
  if (userCache.size >= USER_CACHE_MAX) {
    const oldest = userCache.keys().next().value;
    if (oldest) userCache.delete(oldest);
  }
  userCache.set(authKey, {
    id: row.id,
    role: row.role || 'employee',
    organization_id: row.organization_id,
    cachedAt: Date.now(),
  });
}

/** Clear cache for a specific user (call on role change / profile update). */
export function invalidateAuthCache(authUserId: string): void {
  userCache.delete(authUserId);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let userId = (req as Request & { userId?: string }).userId;

  if (!userId && isDev) {
    userId = req.headers['x-user-id'] as string | undefined;
  }

  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const authKey = sanitizeUuid(userId);
  try {
    const cached = getCachedUser(authKey);
    let userRow: { id: string; role?: string; organization_id: string } | undefined = cached
      ? { id: cached.id, role: cached.role, organization_id: cached.organization_id }
      : undefined;

    if (!userRow) {
      let userResult = await query<{ id: string; role?: string; organization_id: string }>(
        `SELECT id, role, organization_id::text AS organization_id
         FROM reimbursement_users
         WHERE auth_user_id = $1
         LIMIT 1`,
        [authKey],
      );
      if (!userResult.rows[0]) {
        const auth = await getByAuthUserId(authKey);
        if (auth) {
          await ensureReimbursementUserForAuth(userId, auth.email);
          userResult = await query<{ id: string; role?: string; organization_id: string }>(
            `SELECT id, role, organization_id::text AS organization_id
             FROM reimbursement_users
             WHERE auth_user_id = $1
             LIMIT 1`,
            [authKey],
          );
        }
      }
      if (!userResult.rows[0]) {
        res.status(403).json({
          error: 'USER_NOT_PROVISIONED',
          message: 'Workspace user record is missing. Run server seed or contact admin.',
        });
        return;
      }
      userRow = userResult.rows[0];
      setCachedUser(authKey, userRow);
    }

    const jwtOrg = (req as Request & { jwtOrganizationId?: string }).jwtOrganizationId;
    const rowOrg = userRow.organization_id;
    if (jwtOrg && jwtOrg !== rowOrg) {
      res.status(403).json({ error: 'Organization mismatch for this session' });
      return;
    }
    let orgId = jwtOrg || rowOrg;

    if (!orgId) {
      if (cachedDefaultOrgId) {
        orgId = cachedDefaultOrgId;
      } else {
        const orgResult = await query<{ id: string }>(
          `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
          [DEFAULT_ORG_SLUG],
        );
        orgId = orgResult.rows[0]?.id;
        if (orgId) cachedDefaultOrgId = orgId;
      }
    }
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }

    const role = userRow.role || 'employee';
    const authReq = req as AuthenticatedRequest;
    authReq.userId = userId;
    authReq.role = role;
    authReq.user = { id: userId, role };
    authReq.tenantId = orgId;
    authReq.organizationId = orgId;
    next();
  } catch (err) {
    console.error('[requireAuth] Unexpected error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
