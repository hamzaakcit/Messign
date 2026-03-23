import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';

const DEFAULT_ORG_SLUG = 'messign';
let cachedOrgId: string | undefined;

const isDev = process.env.NODE_ENV !== 'production';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId
    ?? (isDev ? (req.headers['x-user-id'] as string | undefined) : undefined);
  if (!userId) {
    res.status(401).json({ error: 'Authorization or X-User-Id required for admin' });
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
    const userResult = await query<{ id: string; role: string }>(
      `SELECT id, role FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id = $2 LIMIT 1`,
      [orgId, userId]
    );
    const row = userResult.rows[0];
    if (!row) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    if (row.role !== 'admin') {
      res.status(403).json({ error: 'Admin role required' });
      return;
    }
    (req as Request & { userId: string; adminUserId: string }).userId = userId;
    (req as Request & { adminUserId: string }).adminUserId = userId;
    next();
  } catch (err) {
    console.error('requireAdmin', err);
    res.status(500).json({ error: 'Auth failed' });
  }
}
