import type { Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import type { ReimbursementRequest } from './reimbursementAuth.js';

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 6,
  cfo: 5,
  finance_admin: 4,
  finance: 3,
  manager: 2,
  employee: 1,
};

export function requireFinanceRole(...allowedRoles: string[]) {
  return (req: ReimbursementRequest, res: Response, next: NextFunction): void => {
    const user = req.reimbursementUser;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const minLevel = Math.min(...allowedRoles.map((r) => ROLE_HIERARCHY[r] ?? 99));
    if (userLevel >= minLevel) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
}

export function buildExpenseVisibilityClause(
  userRole: string,
  userId: string,
  teamId?: string,
): { clause: string; params: string[] } {
  const level = ROLE_HIERARCHY[userRole] ?? 0;
  if (level >= ROLE_HIERARCHY.finance) {
    return { clause: '1=1', params: [] };
  }
  if (level >= ROLE_HIERARCHY.manager && teamId) {
    return {
      clause: '(r.submitted_by = $__idx__ OR r.team_id = $__idx2__)',
      params: [userId, teamId],
    };
  }
  return { clause: 'r.submitted_by = $__idx__', params: [userId] };
}

export async function resolveOrgId(): Promise<string | null> {
  const result = await query<{ id: string }>(
    'SELECT id FROM organizations WHERE slug = $1 LIMIT 1',
    ['messign'],
  );
  return result.rows[0]?.id ?? null;
}

export async function getUserTeamId(userId: string): Promise<string | null> {
  const result = await query<{ team_id: string }>(
    'SELECT team_id FROM performance_team_members WHERE employee_id = $1 AND is_active = TRUE LIMIT 1',
    [userId],
  );
  return result.rows[0]?.team_id ?? null;
}
