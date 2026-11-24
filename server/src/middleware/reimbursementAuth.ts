import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { mapReimbursementUser } from '../types/reimbursement.js';
import type { ReimbursementUser } from '../types/reimbursement.js';

const DEFAULT_ORG_SLUG = 'messign';
let cachedOrgId: string | undefined;

export interface ReimbursementRequest extends Request {
  reimbursementUser?: ReimbursementUser;
  organizationId?: string;
  tenantId?: string;
}

interface CachedReimbUser { user: ReimbursementUser; cachedAt: number }
const reimbUserCache = new Map<string, CachedReimbUser>();
const REIMB_CACHE_TTL_MS = 60_000;
const REIMB_CACHE_MAX = 500;

function getCachedReimbUser(key: string): ReimbursementUser | undefined {
  const entry = reimbUserCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > REIMB_CACHE_TTL_MS) {
    reimbUserCache.delete(key);
    return undefined;
  }
  return entry.user;
}

function setCachedReimbUser(key: string, user: ReimbursementUser): void {
  if (reimbUserCache.size >= REIMB_CACHE_MAX) {
    const oldest = reimbUserCache.keys().next().value;
    if (oldest) reimbUserCache.delete(oldest);
  }
  reimbUserCache.set(key, { user, cachedAt: Date.now() });
}

export function invalidateReimbAuthCache(authUserId: string, orgId: string): void {
  reimbUserCache.delete(`${orgId}:${authUserId}`);
}

export async function reimbursementAuth(req: ReimbursementRequest, res: Response, next: NextFunction): Promise<void> {
  const authUserId = (req as Request & { userId?: string }).userId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  try {
    let orgId = cachedOrgId;
    if (!orgId) {
      const orgResult = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
        [DEFAULT_ORG_SLUG]
      );
      orgId = orgResult.rows[0]?.id;
      if (orgId) cachedOrgId = orgId;
    }
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }

    const cacheKey = `${orgId}:${authUserId}`;
    let reimbUser = getCachedReimbUser(cacheKey);

    if (!reimbUser) {
      const userResult = await query(
        `SELECT id, organization_id, auth_user_id, email, full_name, role, manager_id, created_at, updated_at
         FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id = $2 LIMIT 1`,
        [orgId, authUserId]
      );
      const row = userResult.rows[0];
      if (!row) {
        res.status(403).json({ error: 'Reimbursement access not set up for this user' });
        return;
      }
      reimbUser = mapReimbursementUser(row as any);
      setCachedReimbUser(cacheKey, reimbUser);
    }

    req.reimbursementUser = reimbUser;
    req.organizationId = orgId;
    req.tenantId = orgId;
    next();
  } catch (err) {
    console.error('reimbursementAuth', err);
    res.status(500).json({ error: 'Auth failed' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: ReimbursementRequest, res: Response, next: NextFunction): void => {
    const user = req.reimbursementUser;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (roles.includes(user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Insufficient role' });
  };
}

export function requireAdmin(req: ReimbursementRequest, res: Response, next: NextFunction): void {
  return requireRole('admin')(req, res, next);
}
