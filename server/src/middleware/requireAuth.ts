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
    const orgResult = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
      [DEFAULT_ORG_SLUG]
    );
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }
    let userResult = await query<{ id: string; role?: string }>(
      `SELECT id, role FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id = $2 LIMIT 1`,
      [orgId, userId]
    );
    if (!userResult.rows[0]) {
      const auth = await getByAuthUserId(userId);
      if (auth) {
        await ensureReimbursementUserForAuth(userId, auth.email);
        userResult = await query<{ id: string; role?: string }>(
          `SELECT id, role FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id = $2 LIMIT 1`,
          [orgId, userId]
        );
      }
    }
    if (!userResult.rows[0]) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const role = userResult.rows[0].role || 'employee';
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string } }).userId = userId;
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string } }).role = role;
    (req as Request & { userId: string; role?: string; user?: { id: string; role: string } }).user = { id: userId, role };
    next();
  } catch (err) {
    console.error('requireAuth', err);
    res.status(500).json({ error: 'Auth failed' });
  }
}
