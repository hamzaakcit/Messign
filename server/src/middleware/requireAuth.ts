import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { ensureReimbursementUserForAuth } from '../db/ensureReimbursementUser.js';
import { getByAuthUserId } from '../db/employeeAuthDb.js';

const DEFAULT_ORG_SLUG = 'messign';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId ?? (req.headers['x-user-id'] as string | undefined);
  if (!userId) {
    res.status(401).json({ error: 'Authorization or X-User-Id required' });
    return;
  }
  try {
    let userResult = await query<{ id: string; role?: string; organization_id: string }>(
      `SELECT id, role, organization_id::text AS organization_id
       FROM reimbursement_users
       WHERE auth_user_id = $1
       LIMIT 1`,
      [userId],
    );
    if (!userResult.rows[0]) {
      const auth = await getByAuthUserId(userId);
      if (auth) {
        await ensureReimbursementUserForAuth(userId, auth.email);
        userResult = await query<{ id: string; role?: string; organization_id: string }>(
          `SELECT id, role, organization_id::text AS organization_id
           FROM reimbursement_users
           WHERE auth_user_id = $1
           LIMIT 1`,
          [userId],
        );
      }
    }
    if (!userResult.rows[0]) {
      // 403: not a missing/invalid token — user is authenticated but not provisioned for API routes (avoid client logout loop)
      res.status(403).json({
        error: 'USER_NOT_PROVISIONED',
        message: 'Workspace user record is missing. Run server seed or contact admin.',
      });
      return;
    }

    const jwtOrg = req.jwtOrganizationId;
    const rowOrg = userResult.rows[0].organization_id;
    if (jwtOrg && jwtOrg !== rowOrg) {
      res.status(403).json({ error: 'Organization mismatch for this session' });
      return;
    }
    let orgId = jwtOrg || rowOrg;

    if (!orgId) {
      const orgResult = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
        [DEFAULT_ORG_SLUG],
      );
      orgId = orgResult.rows[0]?.id;
    }
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }

    const role = userResult.rows[0].role || 'employee';
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string }; tenantId?: string; organizationId?: string }).userId = userId;
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string }; tenantId?: string; organizationId?: string }).role = role;
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string }; tenantId?: string; organizationId?: string }).user = { id: userId, role };
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string }; tenantId?: string; organizationId?: string }).tenantId = orgId;
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string }; tenantId?: string; organizationId?: string }).organizationId = orgId;
    next();
  } catch (err) {
    console.error('requireAuth', err);
    res.status(500).json({ error: 'Auth failed' });
  }
}
