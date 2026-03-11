import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';
import {
  buildSupportVisibilityClause,
  computeSLAStatus,
  toNumber,
  type SLAStatusDetail,
  type SupportSLAState,
} from './shared.js';

export type SLAStatus = SLAStatusDetail;

export interface TicketSLAItem {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  firstResponse: SLAStatus;
  resolution: SLAStatus;
}

export interface SLAReport {
  onTrack: TicketSLAItem[];
  atRisk: TicketSLAItem[];
  breached: TicketSLAItem[];
}

export interface SLAMetrics {
  avgFirstResponse: number;
  avgResolution: number;
  firstResponseSLAMetPercent: number;
  resolutionSLAMetPercent: number;
  totalBreaches: number;
}

function mapTicketSlaItem(row: Record<string, unknown>): TicketSLAItem {
  const firstResponse = computeSLAStatus(
    String(row.created_at ?? ''),
    row.sla_first_response_due ? String(row.sla_first_response_due) : null,
    row.sla_first_response_at ? String(row.sla_first_response_at) : null,
    Boolean(row.sla_first_response_breached),
  );
  const resolution = computeSLAStatus(
    String(row.created_at ?? ''),
    row.sla_resolution_due ? String(row.sla_resolution_due) : null,
    row.resolved_at ? String(row.resolved_at) : null,
    Boolean(row.sla_resolution_breached),
  );

  return {
    ticketId: String(row.id),
    ticketNumber: String(row.ticket_number),
    subject: String(row.subject ?? ''),
    priority: String(row.priority ?? ''),
    status: String(row.status ?? ''),
    assigneeId: row.assignee_id ? String(row.assignee_id) : null,
    assigneeName: row.assignee_name ? String(row.assignee_name) : null,
    firstResponse,
    resolution,
  };
}

export async function checkSLACompliance(ctx: CallerContext): Promise<SLAReport> {
  const conditions = [`t.status NOT IN ('resolved', 'closed')`];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`t.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const visibility = buildSupportVisibilityClause(ctx, 't', idx);
  if (visibility.clause !== '1=1') {
    conditions.push(visibility.clause);
    params.push(...visibility.params);
  }

  const result = await query(
    `SELECT t.id::text AS id, t.ticket_number::text AS ticket_number, t.subject, t.priority, t.status,
            t.assignee_id::text AS assignee_id, ru.full_name AS assignee_name,
            t.created_at::text AS created_at,
            t.sla_first_response_due::text AS sla_first_response_due,
            t.sla_resolution_due::text AS sla_resolution_due,
            t.sla_first_response_at::text AS sla_first_response_at,
            t.resolved_at::text AS resolved_at,
            COALESCE(t.sla_first_response_breached, FALSE) AS sla_first_response_breached,
            COALESCE(t.sla_resolution_breached, FALSE) AS sla_resolution_breached
     FROM support_tickets t
     LEFT JOIN reimbursement_users ru ON ru.id = t.assignee_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.created_at ASC`,
    params,
  );

  const report: SLAReport = { onTrack: [], atRisk: [], breached: [] };
  for (const row of result.rows) {
    const item = mapTicketSlaItem(row as Record<string, unknown>);
    const overallStatus: SupportSLAState = item.firstResponse.status === 'breached' || item.resolution.status === 'breached'
      ? 'breached'
      : item.firstResponse.status === 'at_risk' || item.resolution.status === 'at_risk'
        ? 'at_risk'
        : 'on_track';

    if (overallStatus === 'breached') report.breached.push(item);
    else if (overallStatus === 'at_risk') report.atRisk.push(item);
    else report.onTrack.push(item);
  }

  return report;
}

export async function getTicketSLAStatus(ticketId: string): Promise<{ firstResponse: SLAStatus; resolution: SLAStatus }> {
  const result = await query(
    `SELECT created_at::text AS created_at,
            sla_first_response_due::text AS sla_first_response_due,
            sla_resolution_due::text AS sla_resolution_due,
            sla_first_response_at::text AS sla_first_response_at,
            resolved_at::text AS resolved_at,
            COALESCE(sla_first_response_breached, FALSE) AS sla_first_response_breached,
            COALESCE(sla_resolution_breached, FALSE) AS sla_resolution_breached
     FROM support_tickets
     WHERE id = $1
     LIMIT 1`,
    [ticketId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Ticket not found');

  return {
    firstResponse: computeSLAStatus(
      String(row.created_at),
      row.sla_first_response_due ? String(row.sla_first_response_due) : null,
      row.sla_first_response_at ? String(row.sla_first_response_at) : null,
      Boolean(row.sla_first_response_breached),
    ),
    resolution: computeSLAStatus(
      String(row.created_at),
      row.sla_resolution_due ? String(row.sla_resolution_due) : null,
      row.resolved_at ? String(row.resolved_at) : null,
      Boolean(row.sla_resolution_breached),
    ),
  };
}

export async function getSLAMetrics(
  ctx: CallerContext,
  period?: string,
): Promise<SLAMetrics> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`t.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (period) {
    conditions.push(`t.created_at >= $${idx++}::date`);
    params.push(period);
  }

  const visibility = buildSupportVisibilityClause(ctx, 't', idx);
  if (visibility.clause !== '1=1') {
    conditions.push(visibility.clause);
    params.push(...visibility.params);
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  const result = await query<{
    avg_first_response: string;
    avg_resolution: string;
    first_response_met: string;
    resolution_met: string;
    resolved_count: string;
    total_breaches: string;
  }>(
    `SELECT
       COALESCE(AVG(first_response_time_hours), 0)::numeric AS avg_first_response,
       COALESCE(AVG(resolution_time_hours), 0)::numeric AS avg_resolution,
       COUNT(*) FILTER (
         WHERE sla_first_response_at IS NOT NULL
           AND (sla_first_response_breached = FALSE OR sla_first_response_breached IS NULL)
       )::int AS first_response_met,
       COUNT(*) FILTER (
         WHERE resolved_at IS NOT NULL
           AND (sla_resolution_breached = FALSE OR sla_resolution_breached IS NULL)
       )::int AS resolution_met,
       COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved_count,
       COUNT(*) FILTER (
         WHERE COALESCE(sla_first_response_breached, FALSE) = TRUE
            OR COALESCE(sla_resolution_breached, FALSE) = TRUE
       )::int AS total_breaches
     FROM support_tickets t
     WHERE ${whereSQL}`,
    params,
  );

  const row = result.rows[0];
  const resolvedCount = parseInt(row?.resolved_count ?? '0', 10);
  const firstResponseMet = parseInt(row?.first_response_met ?? '0', 10);
  const resolutionMet = parseInt(row?.resolution_met ?? '0', 10);

  return {
    avgFirstResponse: toNumber(row?.avg_first_response ?? 0),
    avgResolution: toNumber(row?.avg_resolution ?? 0),
    firstResponseSLAMetPercent: resolvedCount > 0 ? Number(((firstResponseMet / resolvedCount) * 100).toFixed(2)) : 0,
    resolutionSLAMetPercent: resolvedCount > 0 ? Number(((resolutionMet / resolvedCount) * 100).toFixed(2)) : 0,
    totalBreaches: parseInt(row?.total_breaches ?? '0', 10),
  };
}
