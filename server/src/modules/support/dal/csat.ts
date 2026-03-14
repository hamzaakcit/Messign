import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext } from '../../../dal/types.js';
import { buildSupportVisibilityClause, toNumber } from './shared.js';

export interface CsatRating {
  id: string;
  ticket_id: string;
  rating: number;
  comment: string | null;
  submitted_at: string;
}

export interface CsatSummary {
  averageRating: number;
  totalResponses: number;
  distribution: Array<{ rating: number; count: number }>;
  trend: Array<{ date: string; averageRating: number; count: number }>;
}

async function ensureVisibleTicket(ctx: CallerContext, ticketId: string): Promise<{ ticketId: string; crmCompanyId: string | null } | null> {
  const conditions = ['t.id = $1'];
  const params: unknown[] = [ticketId];
  let idx = 2;
  if (ctx.organizationId) {
    conditions.push(`t.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  const visibility = buildSupportVisibilityClause(ctx, 't', idx);
  if (visibility.clause !== '1=1') {
    conditions.push(visibility.clause);
    params.push(...visibility.params);
  }

  const result = await query<{ ticket_id: string; crm_company_id: string | null }>(
    `SELECT t.id::text AS ticket_id, t.crm_company_id::text AS crm_company_id
     FROM support_tickets t
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params,
  );
  const row = result.rows[0];
  return row ? { ticketId: row.ticket_id, crmCompanyId: row.crm_company_id ?? null } : null;
}

export async function submitRating(
  ctx: CallerContext,
  ticketId: string,
  rating: number,
  comment?: string,
): Promise<CsatRating> {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  const ticket = await ensureVisibleTicket(ctx, ticketId);
  if (!ticket) throw new Error('Ticket not found');

  const result = await query(
    `INSERT INTO support_csat_ratings (ticket_id, rating, comment)
     VALUES ($1, $2, $3)
     ON CONFLICT (ticket_id) DO UPDATE SET
       rating = EXCLUDED.rating,
       comment = EXCLUDED.comment,
       submitted_at = NOW()
     RETURNING id::text AS id, ticket_id::text AS ticket_id, rating::int AS rating, comment, submitted_at::text AS submitted_at`,
    [ticketId, rating, comment ?? null],
  );

  const row = result.rows[0] as Record<string, unknown>;
  const submitted: CsatRating = {
    id: String(row.id),
    ticket_id: String(row.ticket_id),
    rating: toNumber(row.rating),
    comment: row.comment ? String(row.comment) : null,
    submitted_at: String(row.submitted_at),
  };

  eventBus.emit('support.csat.submitted', {
    ticketId,
    rating,
    comment,
    crmCompanyId: ticket.crmCompanyId ?? undefined,
  });

  return submitted;
}

export async function getCsatSummary(
  ctx: CallerContext,
  days: number = 30,
): Promise<CsatSummary> {
  const conditions: string[] = [];
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
    idx += visibility.params.length;
  }
  conditions.push(`r.submitted_at >= NOW() - ($${idx++}::int * INTERVAL '1 day')`);
  params.push(days);
  const whereSQL = conditions.join(' AND ');

  const [summaryResult, distributionResult, trendResult] = await Promise.all([
    query<{ avg_rating: string; total_responses: string }>(
      `SELECT COALESCE(AVG(r.rating), 0)::numeric AS avg_rating, COUNT(*)::int AS total_responses
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ${whereSQL}`,
      params,
    ),
    query<{ rating: string; count: string }>(
      `SELECT r.rating::text AS rating, COUNT(*)::int AS count
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ${whereSQL}
       GROUP BY r.rating
       ORDER BY r.rating ASC`,
      params,
    ),
    query<{ date: string; avg_rating: string; count: string }>(
      `SELECT DATE(r.submitted_at)::text AS date,
              COALESCE(AVG(r.rating), 0)::numeric AS avg_rating,
              COUNT(*)::int AS count
       FROM support_csat_ratings r
       JOIN support_tickets t ON t.id = r.ticket_id
       WHERE ${whereSQL}
       GROUP BY DATE(r.submitted_at)
       ORDER BY DATE(r.submitted_at) ASC`,
      params,
    ),
  ]);

  const summary = summaryResult.rows[0];
  return {
    averageRating: toNumber(summary?.avg_rating ?? 0),
    totalResponses: parseInt(summary?.total_responses ?? '0', 10),
    distribution: distributionResult.rows.map((row) => ({
      rating: toNumber(row.rating),
      count: parseInt(row.count, 10),
    })),
    trend: trendResult.rows.map((row) => ({
      date: row.date,
      averageRating: toNumber(row.avg_rating),
      count: parseInt(row.count, 10),
    })),
  };
}
