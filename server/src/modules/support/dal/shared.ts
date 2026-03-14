import type { CallerContext } from '../../../dal/types.js';

export type SupportAccessRole = 'agent' | 'manager' | 'admin';
export type SupportSLAState = 'on_track' | 'at_risk' | 'breached';

export interface SLAStatusDetail {
  dueAt: string | null;
  elapsedHours: number;
  totalHours: number;
  percentElapsed: number;
  status: SupportSLAState;
  isMet: boolean;
}

function round(value: number, digits: number = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeSupportRole(role: string | CallerContext['role']): SupportAccessRole {
  switch (String(role)) {
    case 'admin':
    case 'finance':
    case 'cfo':
    case 'finance_admin':
    case 'system_admin':
      return 'admin';
    case 'manager':
    case 'dept_head':
      return 'manager';
    default:
      return 'agent';
  }
}

function teamMemberIdsSubquery(currentUserParam: number, organizationExpr: string): string {
  return `SELECT teammate.id
          FROM reimbursement_users me
          JOIN performance_team_members my_membership
            ON my_membership.employee_id = me.auth_user_id
           AND my_membership.is_active = TRUE
          JOIN performance_team_members teammate_membership
            ON teammate_membership.team_id = my_membership.team_id
           AND teammate_membership.is_active = TRUE
          JOIN reimbursement_users teammate
            ON teammate.auth_user_id = teammate_membership.employee_id
           AND teammate.organization_id = ${organizationExpr}
          WHERE me.id = $${currentUserParam}`;
}

export function buildSupportVisibilityClause(
  ctx: CallerContext,
  alias: string = 't',
  paramOffset: number = 1,
): { clause: string; params: unknown[] } {
  const role = normalizeSupportRole(ctx.role);
  if (role === 'admin') {
    return { clause: '1=1', params: [] };
  }

  if (role === 'manager') {
    return {
      clause: `(${alias}.assignee_id = $${paramOffset}
        OR ${alias}.assignee_id IN (${teamMemberIdsSubquery(paramOffset, `${alias}.organization_id`)}))`,
      params: [ctx.userId],
    };
  }

  return {
    clause: `${alias}.assignee_id = $${paramOffset}`,
    params: [ctx.userId],
  };
}

export function canViewInternalNotes(ctx: CallerContext): boolean {
  return normalizeSupportRole(ctx.role) !== 'agent' || Boolean(ctx.userId);
}

export function computeSLAStatus(
  createdAt: string,
  dueAt?: string | null,
  completedAt?: string | null,
  breachedFlag: boolean = false,
): SLAStatusDetail {
  if (!dueAt) {
    return {
      dueAt: null,
      elapsedHours: 0,
      totalHours: 0,
      percentElapsed: 0,
      status: 'on_track',
      isMet: false,
    };
  }

  const createdMs = new Date(createdAt).getTime();
  const dueMs = new Date(dueAt).getTime();
  const compareMs = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalHours = Math.max(0, (dueMs - createdMs) / 3600000);
  const elapsedHours = Math.max(0, (compareMs - createdMs) / 3600000);
  const percentElapsed = totalHours > 0 ? (elapsedHours / totalHours) * 100 : 0;
  const breached = breachedFlag || compareMs > dueMs;

  return {
    dueAt,
    elapsedHours: round(elapsedHours),
    totalHours: round(totalHours),
    percentElapsed: round(Math.max(0, percentElapsed)),
    status: breached ? 'breached' : percentElapsed >= 75 ? 'at_risk' : 'on_track',
    isMet: Boolean(completedAt && !breached),
  };
}
