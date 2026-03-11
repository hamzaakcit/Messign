import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';
import * as recruitmentMetrics from '../../../../dal/recruitment/metrics.js';
import { scoreCandidateResume } from '../../../../services/recruitment/aiScoring.js';
import {
  getExecutiveSummary,
  getHiringNeedsForecast,
  getMarketingToRevenueCorrelation,
  getSupportToProductCorrelation,
  getTimeToProjectProfitability,
} from '../../../../services/dora/crossModuleAnalytics.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    ['messign'],
  );
  return result.rows[0]?.id;
}

registerTool({
  name: 'get_hiring_pipeline',
  category: 'analytics',
  description: 'Get the current hiring pipeline status showing open positions, applicants by stage, and time-to-hire metrics.',
  parameters: {
    type: 'object',
    properties: {
      jobTitle: { type: 'string', description: 'Optional fuzzy job title filter.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const conditions = ['j.organization_id = $1::uuid'];
    const params: unknown[] = [organizationId];
    let idx = 2;
    if (typeof args.jobTitle === 'string' && args.jobTitle.trim()) {
      conditions.push(`j.title ILIKE $${idx++}`);
      params.push(`%${args.jobTitle.trim()}%`);
    }
    const jobs = await query(
      `SELECT
         f.job_id::text,
         f.job_title,
         f.department,
         f.job_status,
         f.total_applicants,
         f.applied,
         f.screening,
         f.interviewing,
         f.offer,
         f.hired,
         f.rejected,
         f.avg_match_score,
         f.positions_count,
         f.positions_filled
       FROM mv_recruitment_funnel f
       JOIN recruitment_jobs j ON j.id = f.job_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.total_applicants DESC, f.job_title ASC`,
      params,
    );
    const dashboard = await recruitmentMetrics.getDashboardMetrics(buildCtx(ctx, organizationId)) as {
      openPositions: number;
      activeApplicants: number;
      avgTimeToHire: number;
    };
    return {
      success: true,
      data: { jobs: jobs.rows, dashboard },
      summary: `Hiring pipeline: ${dashboard.openPositions} open positions, ${dashboard.activeApplicants} active applicants, ${(dashboard.avgTimeToHire ?? 0).toFixed(1)} days average time to hire.`,
      metadata: { source: 'mv_recruitment_funnel, recruitment_jobs', count: jobs.rows.length },
    };
  },
});

registerTool({
  name: 'score_candidate',
  category: 'analytics',
  description: "AI-score a candidate's resume against a job's requirements and return a match analysis.",
  parameters: {
    type: 'object',
    properties: {
      candidateId: { type: 'string', description: 'Optional candidate UUID.' },
      candidateName: { type: 'string', description: 'Optional fuzzy candidate name.' },
      jobId: { type: 'string', description: 'Optional job UUID.' },
      jobTitle: { type: 'string', description: 'Optional fuzzy job title.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const candidateResult = await query<{
      id: string;
      first_name: string;
      last_name: string | null;
      email: string;
      resume_text: string | null;
    }>(
      `SELECT id::text, first_name, last_name, email, resume_text
       FROM recruitment_candidates
       WHERE organization_id = $1::uuid
         AND (
           ($2::uuid IS NOT NULL AND id = $2::uuid)
           OR ($3::text IS NOT NULL AND (first_name || ' ' || COALESCE(last_name, '')) ILIKE $3)
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        organizationId,
        typeof args.candidateId === 'string' ? args.candidateId : null,
        typeof args.candidateName === 'string' && args.candidateName.trim() ? `%${args.candidateName.trim()}%` : null,
      ],
    );
    const jobResult = await query<{
      id: string;
      title: string;
      requirements: string[];
    }>(
      `SELECT id::text, title, requirements
       FROM recruitment_jobs
       WHERE organization_id = $1::uuid
         AND (
           ($2::uuid IS NOT NULL AND id = $2::uuid)
           OR ($3::text IS NOT NULL AND title ILIKE $3)
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        organizationId,
        typeof args.jobId === 'string' ? args.jobId : null,
        typeof args.jobTitle === 'string' && args.jobTitle.trim() ? `%${args.jobTitle.trim()}%` : null,
      ],
    );

    const candidate = candidateResult.rows[0];
    const job = jobResult.rows[0];
    if (!candidate || !job) {
      return { success: false, data: null, summary: 'Candidate or job could not be resolved.' };
    }

    const score = await scoreCandidateResume({
      candidateId: candidate.id,
      jobId: job.id,
      candidateName: `${candidate.first_name} ${candidate.last_name ?? ''}`.trim(),
      jobTitle: job.title,
      resumeText: candidate.resume_text ?? '',
      requirements: Array.isArray(job.requirements) ? job.requirements : [],
    });
    return {
      success: true,
      data: { candidate, job, ...score },
      summary: `${candidate.first_name} ${candidate.last_name ?? ''} scored ${score.match_score}% for ${job.title}. Recommendation: ${score.recommendation}.`,
      metadata: { source: 'recruitment_candidates, recruitment_jobs, aiScoring', count: 1 },
    };
  },
});

registerTool({
  name: 'get_recruitment_metrics',
  category: 'analytics',
  description: 'Get recruitment metrics including time-to-hire, offer acceptance rate, source effectiveness, and pipeline conversion rates.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const dashboard = await recruitmentMetrics.getDashboardMetrics(buildCtx(ctx, organizationId)) as {
      openPositions: number;
      activeApplicants: number;
      avgTimeToHire: number;
      offerAcceptanceRate: number;
    };
    return {
      success: true,
      data: dashboard,
      summary: `Recruitment metrics: ${dashboard.openPositions} open positions, ${dashboard.activeApplicants} active applicants, ${(dashboard.avgTimeToHire ?? 0).toFixed(1)} days time to hire, ${(dashboard.offerAcceptanceRate * 100).toFixed(0)}% offer acceptance.`,
      metadata: { source: 'recruitment metrics', count: 1 },
    };
  },
});

registerTool({
  name: 'get_cross_module_report',
  category: 'analytics',
  description: 'Generate a cross-module analytics report showing correlations between marketing campaigns and revenue, support trends and product issues, project profitability, and hiring needs.',
  parameters: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Which cross-module report to run.',
        enum: ['marketing_revenue', 'support_product', 'project_profitability', 'hiring_forecast', 'executive'],
      },
      period: { type: 'string', description: 'Optional reporting period.', enum: ['month', 'quarter', 'year'] },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const focus = typeof args.focus === 'string' ? args.focus : 'executive';
    const period = typeof args.period === 'string' ? args.period : undefined;

    const data =
      focus === 'marketing_revenue' ? await getMarketingToRevenueCorrelation(callerCtx, period) :
      focus === 'support_product' ? await getSupportToProductCorrelation(callerCtx) :
      focus === 'project_profitability' ? await getTimeToProjectProfitability(callerCtx) :
      focus === 'hiring_forecast' ? await getHiringNeedsForecast(callerCtx) :
      await getExecutiveSummary(callerCtx);

    return {
      success: true,
      data,
      summary:
        focus === 'marketing_revenue' ? 'Cross-module report: marketing campaigns correlated to converted CRM revenue.' :
        focus === 'support_product' ? 'Cross-module report: support categories correlated to product bug work.' :
        focus === 'project_profitability' ? 'Cross-module report: time tracking correlated to project profitability.' :
        focus === 'hiring_forecast' ? 'Cross-module report: utilization and upcoming work correlated to hiring needs.' :
        'Cross-module executive summary generated across revenue, support, delivery, and hiring.',
      metadata: { source: `crossModuleAnalytics:${focus}` },
    };
  },
});
