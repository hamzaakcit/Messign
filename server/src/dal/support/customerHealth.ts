import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';
import { toNumber } from './shared.js';

export interface CustomerHealth {
  id: string;
  crm_company_id: string;
  company_name?: string | null;
  health_score: number;
  open_ticket_count: number;
  avg_resolution_hours: number | null;
  avg_csat: number | null;
  repeat_issue_count: number;
  last_ticket_at: string | null;
  trend: 'improving' | 'stable' | 'declining' | 'critical';
  calculated_at: string;
}

interface HealthStats {
  openTicketCount: number;
  avgResolutionHours: number;
  avgCsat: number;
  repeatIssueCount: number;
  lastTicketAt: string | null;
  recentTicketCount: number;
  previousTicketCount: number;
}

async function loadHealthStats(crmCompanyId: string): Promise<HealthStats> {
  const statsResult = await query<{
    open_ticket_count: string;
    avg_resolution_hours: string | null;
    avg_csat: string | null;
    repeat_issue_count: string;
    last_ticket_at: string | null;
    recent_ticket_count: string;
    previous_ticket_count: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS open_ticket_count,
       COALESCE(AVG(resolution_time_hours) FILTER (WHERE resolution_time_hours IS NOT NULL), 0)::numeric AS avg_resolution_hours,
       COALESCE((SELECT AVG(r.rating)::numeric
                 FROM support_csat_ratings r
                 JOIN support_tickets t2 ON t2.id = r.ticket_id
                 WHERE t2.crm_company_id = $1), 0)::numeric AS avg_csat,
       COALESCE((
         SELECT COUNT(*)
         FROM (
           SELECT LOWER(subject)
           FROM support_tickets
           WHERE crm_company_id = $1
           GROUP BY LOWER(subject)
           HAVING COUNT(*) > 1
         ) repeated_subjects
       ), 0)::int AS repeat_issue_count,
       MAX(created_at)::text AS last_ticket_at,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS recent_ticket_count,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '60 days'
           AND created_at < NOW() - INTERVAL '30 days'
       )::int AS previous_ticket_count
     FROM support_tickets
     WHERE crm_company_id = $1`,
    [crmCompanyId],
  );

  const row = statsResult.rows[0];
  return {
    openTicketCount: parseInt(row?.open_ticket_count ?? '0', 10),
    avgResolutionHours: toNumber(row?.avg_resolution_hours ?? 0),
    avgCsat: toNumber(row?.avg_csat ?? 0),
    repeatIssueCount: parseInt(row?.repeat_issue_count ?? '0', 10),
    lastTicketAt: row?.last_ticket_at ?? null,
    recentTicketCount: parseInt(row?.recent_ticket_count ?? '0', 10),
    previousTicketCount: parseInt(row?.previous_ticket_count ?? '0', 10),
  };
}

function deriveHealthScore(stats: HealthStats): number {
  let score = 100;
  score -= Math.min(stats.openTicketCount * 8, 32);
  score -= Math.min(Math.max(stats.avgResolutionHours - 24, 0) / 6, 20);
  score -= Math.min(stats.repeatIssueCount * 5, 20);
  if (stats.avgCsat > 0) {
    score -= Math.max(0, (5 - stats.avgCsat) * 10);
  }
  if (stats.recentTicketCount > stats.previousTicketCount) {
    score -= Math.min((stats.recentTicketCount - stats.previousTicketCount) * 3, 15);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function deriveTrend(score: number, previousScore: number | null): CustomerHealth['trend'] {
  if (score < 40) return 'critical';
  if (previousScore == null) return 'stable';
  if (score - previousScore >= 5) return 'improving';
  if (previousScore - score >= 5) return 'declining';
  return 'stable';
}

export async function calculateHealthScore(crmCompanyId: string): Promise<number> {
  const stats = await loadHealthStats(crmCompanyId);
  return deriveHealthScore(stats);
}

export async function updateCustomerHealth(crmCompanyId: string): Promise<CustomerHealth> {
  const stats = await loadHealthStats(crmCompanyId);
  const score = deriveHealthScore(stats);

  const previousResult = await query<{ health_score: string | null }>(
    `SELECT health_score::text AS health_score
     FROM support_customer_health
     WHERE crm_company_id = $1
     LIMIT 1`,
    [crmCompanyId],
  );
  const previousScore = previousResult.rows[0]?.health_score == null
    ? null
    : toNumber(previousResult.rows[0].health_score);
  const trend = deriveTrend(score, previousScore);

  const upsertResult = await query(
    `INSERT INTO support_customer_health (
       crm_company_id, health_score, open_ticket_count, avg_resolution_hours, avg_csat,
       repeat_issue_count, last_ticket_at, trend, calculated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, NOW())
     ON CONFLICT (crm_company_id) DO UPDATE SET
       health_score = EXCLUDED.health_score,
       open_ticket_count = EXCLUDED.open_ticket_count,
       avg_resolution_hours = EXCLUDED.avg_resolution_hours,
       avg_csat = EXCLUDED.avg_csat,
       repeat_issue_count = EXCLUDED.repeat_issue_count,
       last_ticket_at = EXCLUDED.last_ticket_at,
       trend = EXCLUDED.trend,
       calculated_at = NOW()
     RETURNING id::text AS id, crm_company_id::text AS crm_company_id, health_score::int AS health_score,
               open_ticket_count::int AS open_ticket_count, avg_resolution_hours::text AS avg_resolution_hours,
               avg_csat::text AS avg_csat, repeat_issue_count::int AS repeat_issue_count,
               last_ticket_at::text AS last_ticket_at, trend, calculated_at::text AS calculated_at`,
    [
      crmCompanyId,
      score,
      stats.openTicketCount,
      stats.avgResolutionHours || null,
      stats.avgCsat || null,
      stats.repeatIssueCount,
      stats.lastTicketAt,
      trend,
    ],
  );

  const companyResult = await query<{ name: string | null }>(
    `SELECT name FROM crm_companies WHERE id = $1 LIMIT 1`,
    [crmCompanyId],
  );
  const row = upsertResult.rows[0] as Record<string, unknown>;

  return {
    id: String(row.id),
    crm_company_id: String(row.crm_company_id),
    company_name: companyResult.rows[0]?.name ?? null,
    health_score: toNumber(row.health_score),
    open_ticket_count: toNumber(row.open_ticket_count),
    avg_resolution_hours: row.avg_resolution_hours == null ? null : toNumber(row.avg_resolution_hours),
    avg_csat: row.avg_csat == null ? null : toNumber(row.avg_csat),
    repeat_issue_count: toNumber(row.repeat_issue_count),
    last_ticket_at: row.last_ticket_at ? String(row.last_ticket_at) : null,
    trend: String(row.trend) as CustomerHealth['trend'],
    calculated_at: String(row.calculated_at),
  };
}

export async function getHealthScores(
  ctx: CallerContext,
  minScore?: number,
  maxScore?: number,
): Promise<CustomerHealth[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (minScore != null) {
    conditions.push(`h.health_score >= $${idx++}`);
    params.push(minScore);
  }
  if (maxScore != null) {
    conditions.push(`h.health_score <= $${idx++}`);
    params.push(maxScore);
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  const result = await query(
    `SELECT h.id::text AS id, h.crm_company_id::text AS crm_company_id, c.name AS company_name,
            h.health_score::int AS health_score, h.open_ticket_count::int AS open_ticket_count,
            h.avg_resolution_hours::text AS avg_resolution_hours, h.avg_csat::text AS avg_csat,
            h.repeat_issue_count::int AS repeat_issue_count, h.last_ticket_at::text AS last_ticket_at,
            h.trend, h.calculated_at::text AS calculated_at
     FROM support_customer_health h
     JOIN crm_companies c ON c.id = h.crm_company_id
     WHERE ${whereSQL}
     ORDER BY h.health_score ASC, c.name ASC`,
    params,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    crm_company_id: String(row.crm_company_id),
    company_name: row.company_name ? String(row.company_name) : null,
    health_score: toNumber(row.health_score),
    open_ticket_count: toNumber(row.open_ticket_count),
    avg_resolution_hours: row.avg_resolution_hours == null ? null : toNumber(row.avg_resolution_hours),
    avg_csat: row.avg_csat == null ? null : toNumber(row.avg_csat),
    repeat_issue_count: toNumber(row.repeat_issue_count),
    last_ticket_at: row.last_ticket_at ? String(row.last_ticket_at) : null,
    trend: String(row.trend) as CustomerHealth['trend'],
    calculated_at: String(row.calculated_at),
  }));
}

export async function getAtRiskCustomers(ctx: CallerContext): Promise<CustomerHealth[]> {
  const scores = await getHealthScores(ctx);
  return scores.filter((item) => item.health_score < 60 || item.trend === 'declining' || item.trend === 'critical');
}
