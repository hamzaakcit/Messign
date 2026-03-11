import { query } from '../../db/index.js';
import type { CallerContext } from '../types.js';

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getTimeToHire(ctx: CallerContext): Promise<number> {
  const result = await query<{ avg_days: string }>(
    `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (o.responded_at - a.applied_at)) / 86400), 0)::numeric::text AS avg_days
     FROM recruitment_offers o
     JOIN recruitment_applications a ON a.id = o.application_id
     JOIN recruitment_jobs j ON j.id = a.job_id
     WHERE o.status = 'accepted'
       AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)`,
    [ctx.organizationId ?? null],
  );
  return toNumber(result.rows[0]?.avg_days ?? 0);
}

export async function getFunnelConversion(ctx: CallerContext, jobId?: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT
       COALESCE(SUM(applied), 0)::int AS applied,
       COALESCE(SUM(screening), 0)::int AS screening,
       COALESCE(SUM(interviewing), 0)::int AS interviewing,
       COALESCE(SUM(offer), 0)::int AS offer,
       COALESCE(SUM(hired), 0)::int AS hired
     FROM mv_recruitment_funnel f
     JOIN recruitment_jobs j ON j.id = f.job_id
     WHERE ($1::uuid IS NULL OR f.job_id = $1::uuid)
       AND ($2::uuid IS NULL OR j.organization_id = $2::uuid)`,
    [jobId ?? null, ctx.organizationId ?? null],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  const applied = toNumber(row?.applied ?? 0);
  const screening = toNumber(row?.screening ?? 0);
  const interviewing = toNumber(row?.interviewing ?? 0);
  const offer = toNumber(row?.offer ?? 0);
  const hired = toNumber(row?.hired ?? 0);
  return {
    applied,
    screening,
    interviewing,
    offer,
    hired,
    screening_rate: applied > 0 ? screening / applied : 0,
    interview_rate: screening > 0 ? interviewing / screening : 0,
    offer_rate: interviewing > 0 ? offer / interviewing : 0,
    hire_rate: offer > 0 ? hired / offer : 0,
  };
}

export async function getDashboardMetrics(ctx: CallerContext): Promise<Record<string, unknown>> {
  const [summary, pipeline, offerStats, sourceStats, deptStats, upcomingInterviews, timeTrend] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(positions_count - positions_filled) FILTER (WHERE status IN ('open', 'paused')), 0)::int AS open_positions,
         COALESCE(SUM(total_applicants), 0)::int AS active_applicants
       FROM mv_recruitment_funnel f
       JOIN recruitment_jobs j ON j.id = f.job_id
       WHERE ($1::uuid IS NULL OR j.organization_id = $1::uuid)`,
      [ctx.organizationId ?? null],
    ),
    getFunnelConversion(ctx),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
         COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected'))::int AS responded
       FROM recruitment_offers o
       JOIN recruitment_applications a ON a.id = o.application_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE ($1::uuid IS NULL OR j.organization_id = $1::uuid)`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT COALESCE(a.source, c.source, 'unknown') AS source, COUNT(*)::int AS count
       FROM recruitment_applications a
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE ($1::uuid IS NULL OR j.organization_id = $1::uuid)
       GROUP BY 1
       ORDER BY count DESC`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT COALESCE(j.department, 'Unassigned') AS department,
              COALESCE(SUM(j.positions_count - j.positions_filled), 0)::int AS open_positions
       FROM recruitment_jobs j
       WHERE ($1::uuid IS NULL OR j.organization_id = $1::uuid)
         AND j.status IN ('open', 'paused')
       GROUP BY 1
       ORDER BY open_positions DESC, department ASC`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT
         i.id::text,
         i.scheduled_at::text,
         i.interview_type,
         ru.full_name AS interviewer_name,
         c.first_name,
         c.last_name,
         j.title AS job_title
       FROM recruitment_interviews i
       JOIN recruitment_applications a ON a.id = i.application_id
       JOIN recruitment_candidates c ON c.id = a.candidate_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       LEFT JOIN reimbursement_users ru ON ru.id = i.interviewer_id
       WHERE i.status = 'scheduled'
         AND i.scheduled_at >= NOW()
         AND i.scheduled_at < NOW() + INTERVAL '7 days'
         AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)
       ORDER BY i.scheduled_at ASC
       LIMIT 10`,
      [ctx.organizationId ?? null],
    ),
    query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', o.responded_at), 'YYYY-MM') AS month,
         COALESCE(AVG(EXTRACT(EPOCH FROM (o.responded_at - a.applied_at)) / 86400), 0)::numeric AS avg_days
       FROM recruitment_offers o
       JOIN recruitment_applications a ON a.id = o.application_id
       JOIN recruitment_jobs j ON j.id = a.job_id
       WHERE o.status = 'accepted'
         AND o.responded_at >= NOW() - INTERVAL '6 months'
         AND ($1::uuid IS NULL OR j.organization_id = $1::uuid)
       GROUP BY 1
       ORDER BY 1 ASC`,
      [ctx.organizationId ?? null],
    ),
  ]);
  const offerAccepted = toNumber(offerStats.rows[0]?.accepted ?? 0);
  const offerResponded = toNumber(offerStats.rows[0]?.responded ?? 0);
  return {
    openPositions: toNumber(summary.rows[0]?.open_positions ?? 0),
    activeApplicants: toNumber(summary.rows[0]?.active_applicants ?? 0),
    avgTimeToHire: await getTimeToHire(ctx),
    offerAcceptanceRate: offerResponded > 0 ? offerAccepted / offerResponded : 0,
    pipelineByStage: pipeline,
    sourceEffectiveness: sourceStats.rows,
    positionsByDepartment: deptStats.rows,
    upcomingInterviews: upcomingInterviews.rows,
    timeToHireTrend: timeTrend.rows,
  };
}
