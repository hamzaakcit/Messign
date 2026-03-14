import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { mapReimbursementUser } from '../types/reimbursement.js';
import type { ReimbursementUser } from '../types/reimbursement.js';

const DEFAULT_ORG_SLUG = 'messign';

export interface ReimbursementRequest extends Request {
  reimbursementUser?: ReimbursementUser;
  organizationId?: string;
  tenantId?: string;
}

export async function reimbursementAuth(req: ReimbursementRequest, res: Response, next: NextFunction): Promise<void> {
  const authUserId = req.headers['x-user-id'] as string | undefined;
  if (!authUserId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  try {
    const orgResult = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
      [DEFAULT_ORG_SLUG]
    );
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }

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

    req.reimbursementUser = mapReimbursementUser(row as any);
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
