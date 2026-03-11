import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';
import { buildSupportVisibilityClause, toNumber } from './shared.js';
import { getSLAMetrics } from './sla.js';

export interface BreakdownItem {
  label: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  openCount: number;
  resolvedCount: number;
}

export interface DashboardMetrics {
  openTickets: number;
  avgFirstResponseHours: number;
  avgResolutionHours: number;
  csatScore: number;
  slaCompliancePercent: number;
  ticketsByPriority: BreakdownItem[];
  ticketsByCategory: BreakdownItem[];
  ticketsByStatus: BreakdownItem[];
  ticketTrend: TrendPoint[];
}

export interface AgentWorkload {
  assigneeId: string;
  name: string;
  openTickets: number;
  avgResponseTime: number;
  csatScore: number;
  resolvedThisWeek: number;
}

function buildScopedWhere(
  ctx: CallerContext,
  alias: string,
  period?: string,
  paramOffset: number = 1,
): { whereSQL: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = paramOffset;

  if (ctx.organizationId) {
    conditions.push(`${alias}.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (period) {
    conditions.push(`${alias}.created_at >= $${idx++}::date`);
    params.push(period);
  }

  const visibility = buildSupportVisibilityClause(ctx, alias, idx);
  if (visibility.clause !== '1=1') {
    conditions.push(visibility.clause);
    params.push(...visibility.params);
  }

  return {
    whereSQL: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}

export async function getSupportDashboardMetrics(
  ctx: CallerContext,
  period?: string,
): Promise<DashboardMetrics> {
  const { whereSQL, params } = buildScopedWhere(ctx, 't', period, 1);

  const [summaryResult, priorityResult, categoryResult, statusResult, ticketTrend, slaMetrics] = await Promise.all([
    query<{
      open_tickets: string;
      avg_first_response: string;
      avg_resolution: string;
      csat_score: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed'))::int AS open_tickets,
         COALESCE(AVG(t.first_response_time_hours), 0)::numeric AS avg_first_response,
         COALESCE(AVG(t.resolution_time_hours), 0)::numeric AS avg_resolution,
         COALESCE(AVG(r.rating), 0)::numeric AS csat_score
       FROM support_tickets t
       LEFT JOIN support_csat_ratings r ON r.ticket_id = t.id
       WHERE ${whereSQL}`,
      params,
    ),
    query<{ label: string; count: string }>(
      `SELECT t.priority AS label, COUNT(*)::int AS count
       FROM support_tickets t
       WHERE ${whereSQL}
       GROUP BY t.priority
       ORDER BY COUNT(*) DESC, t.priority ASC`,
      params,
    ),
    query<{ label: string; count: string }>(
      `SELECT COALESCE(sc.name, 'Uncategorized') AS label, COUNT(*)::int AS count
       FROM support_tickets t
       LEFT JOIN support_categories sc ON sc.id = t.category_id
       WHERE ${whereSQL}
       GROUP BY COALESCE(sc.name, 'Uncategorized')
       ORDER BY COUNT(*) DESC, label ASC`,
      params,
    ),
    query<{ label: string; count: string }>(
      `SELECT t.status AS label, COUNT(*)::int AS count
       FROM support_tickets t
       WHERE ${whereSQL}
       GROUP BY t.status
       ORDER BY COUNT(*) DESC, t.status ASC`,
      params,
    ),
    getTicketTrends(ctx, 7),
    getSLAMetrics(ctx, period),
  ]);

  const summary = summaryResult.rows[0];

  return {
    openTickets: parseInt(summary?.open_tickets ?? '0', 10),
    avgFirstResponseHours: toNumber(summary?.avg_first_response ?? 0),
    avgResolutionHours: toNumber(summary?.avg_resolution ?? 0),
    csatScore: toNumber(summary?.csat_score ?? 0),
    slaCompliancePercent: Number(((slaMetrics.firstResponseSLAMetPercent + slaMetrics.resolutionSLAMetPercent) / 2).toFixed(2)),
    ticketsByPriority: priorityResult.rows.map((row) => ({ label: row.label, count: parseInt(row.count, 10) })),
    ticketsByCategory: categoryResult.rows.map((row) => ({ label: row.label, count: parseInt(row.count, 10) })),
    ticketsByStatus: statusResult.rows.map((row) => ({ label: row.label, count: parseInt(row.count, 10) })),
    ticketTrend,
  };
}

export async function getAgentWorkload(ctx: CallerContext): Promise<AgentWorkload[]> {
  const { whereSQL, params } = buildScopedWhere(ctx, 't', undefined, 1);
  const result = await query<{
    assignee_id: string;
    assignee_name: string;
    open_tickets: string;
    avg_response_time: string;
    csat_score: string;
    resolved_this_week: string;
  }>(
    `SELECT
       COALESCE(t.assignee_id::text, 'unassigned') AS assignee_id,
       COALESCE(ru.full_name, 'Unassigned') AS assignee_name,
       COUNT(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed'))::int AS open_tickets,
       COALESCE(AVG(t.first_response_time_hours), 0)::numeric AS avg_response_time,
       COALESCE(AVG(r.rating), 0)::numeric AS csat_score,
       COUNT(*) FILTER (
         WHERE t.status = 'resolved'
           AND t.resolved_at >= NOW() - INTERVAL '7 days'
       )::int AS resolved_this_week
     FROM support_tickets t
     LEFT JOIN reimbursement_users ru ON ru.id = t.assignee_id
     LEFT JOIN support_csat_ratings r ON r.ticket_id = t.id
     WHERE ${whereSQL}
     GROUP BY COALESCE(t.assignee_id::text, 'unassigned'), COALESCE(ru.full_name, 'Unassigned')
     ORDER BY open_tickets DESC, assignee_name ASC`,
    params,
  );

  return result.rows.map((row) => ({
    assigneeId: row.assignee_id,
    name: row.assignee_name,
    openTickets: parseInt(row.open_tickets, 10),
    avgResponseTime: toNumber(row.avg_response_time),
    csatScore: toNumber(row.csat_score),
    resolvedThisWeek: parseInt(row.resolved_this_week, 10),
  }));
}

export async function getTicketTrends(
  ctx: CallerContext,
  days: number = 7,
): Promise<TrendPoint[]> {
  const { whereSQL, params } = buildScopedWhere(ctx, 't', undefined, 2);
  const result = await query<{
    date: string;
    open_count: string;
    resolved_count: string;
  }>(
    `WITH dates AS (
       SELECT generate_series(
         CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'),
         CURRENT_DATE,
         INTERVAL '1 day'
       )::date AS day
     )
     SELECT
       d.day::text AS date,
       COUNT(t.id) FILTER (
         WHERE t.created_at::date <= d.day
           AND (t.resolved_at IS NULL OR t.resolved_at::date > d.day)
       )::int AS open_count,
       COUNT(t.id) FILTER (
         WHERE t.resolved_at IS NOT NULL
           AND t.resolved_at::date = d.day
       )::int AS resolved_count
     FROM dates d
     LEFT JOIN support_tickets t ON ${whereSQL}
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [days, ...params],
  );

  return result.rows.map((row) => ({
    date: row.date,
    openCount: parseInt(row.open_count, 10),
    resolvedCount: parseInt(row.resolved_count, 10),
  }));
}
