import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';

export interface UtilizationData {
  userId: string;
  fullName: string;
  department: string | null;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  utilizationPercent: number;
  billableRevenue: number;
  daysLogged: number;
  targetUtilization: number;
  gapToTarget: number;
}

export interface BillingSummary {
  totalBillableHours: number;
  totalBillableAmount: number;
  byProject: Array<{ projectId: string | null; projectName: string; hours: number; amount: number }>;
  byUser: Array<{ userId: string; fullName: string; hours: number; amount: number }>;
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canReadTeam(ctx: CallerContext): boolean {
  return ['manager', 'dept_head', 'finance_admin', 'system_admin', 'admin', 'finance'].includes(String(ctx.role));
}

function teamScopeClause(ctx: CallerContext, alias: string, startIndex: number): { clause: string; params: unknown[] } {
  if (!canReadTeam(ctx)) return { clause: `${alias}.user_id = $${startIndex}`, params: [ctx.userId] };
  if (String(ctx.role) === 'manager' || String(ctx.role) === 'dept_head') {
    return {
      clause: `(${alias}.user_id = $${startIndex}
        OR ${alias}.user_id IN (
          SELECT teammate.id
          FROM reimbursement_users me
          JOIN performance_team_members my_membership
            ON my_membership.employee_id = me.auth_user_id
           AND my_membership.is_active = TRUE
          JOIN performance_team_members teammate_membership
            ON teammate_membership.team_id = my_membership.team_id
           AND teammate_membership.is_active = TRUE
          JOIN reimbursement_users teammate
            ON teammate.auth_user_id = teammate_membership.employee_id
           AND teammate.organization_id = ${alias}.organization_id
          WHERE me.id = $${startIndex}
        ))`,
      params: [ctx.userId],
    };
  }
  return { clause: '1=1', params: [] };
}

export async function getUserUtilization(
  ctx: CallerContext,
  userId: string,
  _period: 'week' | 'month' | 'quarter' = 'month',
): Promise<UtilizationData> {
  const scope = teamScopeClause(ctx, 'te', 3);
  const result = await query<Record<string, unknown>>(
    `SELECT
       ru.id::text AS user_id,
       ru.full_name,
       NULL::text AS department,
       COALESCE(SUM(te.hours), 0)::float AS total_hours,
       COALESCE(SUM(te.hours) FILTER (WHERE te.is_billable), 0)::float AS billable_hours,
       COALESCE(SUM(te.hours) FILTER (WHERE NOT te.is_billable), 0)::float AS non_billable_hours,
       CASE WHEN COALESCE(SUM(te.hours), 0) > 0
         THEN ROUND((SUM(te.hours) FILTER (WHERE te.is_billable) / SUM(te.hours) * 100)::numeric, 1)
         ELSE 0
       END::float AS utilization_percent,
       COALESCE(SUM(te.billable_amount), 0)::float AS billable_revenue,
       COUNT(DISTINCT te.date)::int AS days_logged
     FROM reimbursement_users ru
     LEFT JOIN time_entries te ON te.user_id = ru.id
       AND te.date >= CURRENT_DATE - INTERVAL '30 days'
       AND te.status != 'rejected'
     WHERE ru.organization_id = $1::uuid
       AND ru.id = $2::uuid
       AND (${scope.clause})
     GROUP BY ru.id, ru.full_name`,
    [ctx.organizationId, userId, ...scope.params],
  );

  const row = result.rows[0];
  const utilizationPercent = num(row?.utilization_percent);
  const target = 75;
  return {
    userId: String(row?.user_id ?? userId),
    fullName: String(row?.full_name ?? 'Unknown'),
    department: row?.department ? String(row.department) : null,
    totalHours: num(row?.total_hours),
    billableHours: num(row?.billable_hours),
    nonBillableHours: num(row?.non_billable_hours),
    utilizationPercent,
    billableRevenue: num(row?.billable_revenue),
    daysLogged: num(row?.days_logged),
    targetUtilization: target,
    gapToTarget: Number((utilizationPercent - target).toFixed(2)),
  };
}

export async function getTeamUtilization(ctx: CallerContext, _departmentId?: string): Promise<UtilizationData[]> {
  const scope = teamScopeClause(ctx, 'mv', 2);
  const result = await query<Record<string, unknown>>(
    `SELECT
       mv.user_id::text AS user_id,
       mv.full_name,
       mv.department,
       mv.total_hours_30d::float AS total_hours,
       mv.billable_hours_30d::float AS billable_hours,
       mv.non_billable_hours_30d::float AS non_billable_hours,
       mv.utilization_percent::float AS utilization_percent,
       mv.billable_revenue_30d::float AS billable_revenue,
       mv.days_logged_30d::int AS days_logged
     FROM mv_time_utilization mv
     JOIN reimbursement_users ru ON ru.id = mv.user_id
     WHERE ru.organization_id = $1::uuid
       AND (${scope.clause})
     ORDER BY mv.utilization_percent DESC, mv.full_name ASC`,
    [ctx.organizationId, ...scope.params],
  );

  const target = 75;
  return result.rows.map((row) => ({
    userId: String(row.user_id),
    fullName: String(row.full_name ?? 'Unknown'),
    department: row.department ? String(row.department) : null,
    totalHours: num(row.total_hours),
    billableHours: num(row.billable_hours),
    nonBillableHours: num(row.non_billable_hours),
    utilizationPercent: num(row.utilization_percent),
    billableRevenue: num(row.billable_revenue),
    daysLogged: num(row.days_logged),
    targetUtilization: target,
    gapToTarget: Number((num(row.utilization_percent) - target).toFixed(2)),
  }));
}

export async function getBillingSummary(
  ctx: CallerContext,
  clientId?: string,
  projectId?: string,
  period: 'week' | 'month' | 'quarter' = 'month',
): Promise<BillingSummary> {
  const interval = period === 'week' ? '7 days' : period === 'quarter' ? '90 days' : '30 days';
  const filters: string[] = ['te.organization_id = $1::uuid', `te.date >= CURRENT_DATE - INTERVAL '${interval}'`, 'te.is_billable = TRUE', `te.status != 'rejected'`];
  const params: unknown[] = [ctx.organizationId];
  let idx = 2;
  const scope = teamScopeClause(ctx, 'te', idx);
  filters.push(scope.clause);
  params.push(...scope.params);
  idx += scope.params.length;

  if (clientId) {
    filters.push(`te.client_id = $${idx++}::uuid`);
    params.push(clientId);
  }
  if (projectId) {
    filters.push(`te.project_id = $${idx++}`);
    params.push(projectId);
  }

  const whereSql = filters.join(' AND ');
  const totalResult = await query<{ hours: string; amount: string }>(
    `SELECT
       COALESCE(SUM(te.hours), 0)::float::text AS hours,
       COALESCE(SUM(te.billable_amount), 0)::float::text AS amount
     FROM time_entries te
     WHERE ${whereSql}`,
    params,
  );

  const byProjectResult = await query<Record<string, unknown>>(
    `SELECT
       te.project_id,
       COALESCE(p.name, 'No Project') AS project_name,
       COALESCE(SUM(te.hours), 0)::float AS hours,
       COALESCE(SUM(te.billable_amount), 0)::float AS amount
     FROM time_entries te
     LEFT JOIN projects p ON p.id = te.project_id
     WHERE ${whereSql}
     GROUP BY te.project_id, COALESCE(p.name, 'No Project')
     ORDER BY amount DESC`,
    params,
  );

  const byUserResult = await query<Record<string, unknown>>(
    `SELECT
       te.user_id::text AS user_id,
       ru.full_name,
       COALESCE(SUM(te.hours), 0)::float AS hours,
       COALESCE(SUM(te.billable_amount), 0)::float AS amount
     FROM time_entries te
     JOIN reimbursement_users ru ON ru.id = te.user_id
     WHERE ${whereSql}
     GROUP BY te.user_id::text, ru.full_name
     ORDER BY amount DESC`,
    params,
  );

  return {
    totalBillableHours: num(totalResult.rows[0]?.hours),
    totalBillableAmount: num(totalResult.rows[0]?.amount),
    byProject: byProjectResult.rows.map((row) => ({
      projectId: row.project_id ? String(row.project_id) : null,
      projectName: String(row.project_name ?? 'No Project'),
      hours: num(row.hours),
      amount: num(row.amount),
    })),
    byUser: byUserResult.rows.map((row) => ({
      userId: String(row.user_id),
      fullName: String(row.full_name ?? 'Unknown'),
      hours: num(row.hours),
      amount: num(row.amount),
    })),
  };
}
