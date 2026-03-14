/**
 * HR Module — Tool registrations (recruitment + people)
 * Namespace: hr (recruitment:* -> hr:*)
 */
import { query } from '../../../db/index.js';
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as recruitmentMetrics from '../dal/recruitment/metrics.js';
import { scoreCandidateResume } from '../../../services/recruitment/aiScoring.js';
import {
  getExecutiveSummary,
  getHiringNeedsForecast,
  getMarketingToRevenueCorrelation,
  getSupportToProductCorrelation,
  getTimeToProjectProfitability,
} from '../../../services/dora/crossModuleAnalytics.js';

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

function buildComparisonDateFilter(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'this_quarter':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export const getHiringPipeline: ToolRegistration = {
  name: 'hr:get_hiring_pipeline',
  namespace: 'hr',
  summary: 'Hiring pipeline: jobs, applications, stages, candidates.',
  tags: ['hr', 'recruitment', 'hiring', 'pipeline', 'ats'],
  requiredRoles: ['hr', 'manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'jobTitle?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'hr:get_hiring_pipeline',
      description: 'Get the current hiring pipeline status showing open positions, applicants by stage, and time-to-hire metrics.',
      parameters: { type: 'object', properties: { jobTitle: { type: 'string', description: 'Optional fuzzy job title filter.' } }, required: [] },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
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
      `SELECT f.job_id::text, f.job_title, f.department, f.job_status, f.total_applicants, f.applied, f.screening, f.interviewing, f.offer, f.hired, f.rejected, f.avg_match_score, f.positions_count, f.positions_filled
       FROM mv_recruitment_funnel f JOIN recruitment_jobs j ON j.id = f.job_id
       WHERE ${conditions.join(' AND ')} ORDER BY f.total_applicants DESC, f.job_title ASC`,
      params,
    );
    const dashboard = await recruitmentMetrics.getDashboardMetrics(buildCtx(ctx, organizationId)) as { openPositions: number; activeApplicants: number; avgTimeToHire: number };
    return {
      success: true,
      data: { jobs: jobs.rows, dashboard },
      summary: `Hiring pipeline: ${dashboard.openPositions} open positions, ${dashboard.activeApplicants} active applicants, ${(dashboard.avgTimeToHire ?? 0).toFixed(1)} days average time to hire.`,
      metadata: { source: 'mv_recruitment_funnel', count: jobs.rows.length },
    };
  },
};

export const scoreCandidate: ToolRegistration = {
  name: 'hr:score_candidate',
  namespace: 'hr',
  summary: 'AI score candidate: match score, skills, fit for role.',
  tags: ['hr', 'recruitment', 'candidate', 'scoring', 'ai'],
  requiredRoles: ['hr', 'manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'candidateId?: string, candidateName?: string, jobId?: string, jobTitle?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'hr:score_candidate',
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
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const candidateResult = await query<{ id: string; first_name: string; last_name: string | null; email: string; resume_text: string | null }>(
      `SELECT id::text, first_name, last_name, email, resume_text FROM recruitment_candidates
       WHERE organization_id = $1::uuid AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR ($3::text IS NOT NULL AND (first_name || ' ' || COALESCE(last_name, '')) ILIKE $3))
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, typeof args.candidateId === 'string' ? args.candidateId : null, typeof args.candidateName === 'string' && args.candidateName.trim() ? `%${args.candidateName.trim()}%` : null],
    );
    const jobResult = await query<{ id: string; title: string; requirements: string[] }>(
      `SELECT id::text, title, requirements FROM recruitment_jobs
       WHERE organization_id = $1::uuid AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR ($3::text IS NOT NULL AND title ILIKE $3))
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, typeof args.jobId === 'string' ? args.jobId : null, typeof args.jobTitle === 'string' && args.jobTitle.trim() ? `%${args.jobTitle.trim()}%` : null],
    );
    const candidate = candidateResult.rows[0];
    const job = jobResult.rows[0];
    if (!candidate || !job) return { success: false, data: null, summary: 'Candidate or job could not be resolved.' };
    const score = await scoreCandidateResume({
      candidateId: candidate.id,
      jobId: job.id,
      candidateName: `${candidate.first_name} ${candidate.last_name ?? ''}`.trim(),
      jobTitle: job.title,
      resumeText: candidate.resume_text ?? '',
      requirements: Array.isArray(job.requirements) ? job.requirements : [],
      tenantId: ctx.organizationId ?? organizationId ?? 'system',
    });
    return {
      success: true,
      data: { candidate, job, ...score },
      summary: `${candidate.first_name} ${candidate.last_name ?? ''} scored ${score.match_score}% for ${job.title}. Recommendation: ${score.recommendation}.`,
      metadata: { source: 'recruitment_candidates, recruitment_jobs, aiScoring', count: 1 },
    };
  },
};

export const getRecruitmentMetrics: ToolRegistration = {
  name: 'hr:get_recruitment_metrics',
  namespace: 'hr',
  summary: 'Recruitment metrics: time-to-hire, fill rate, conversion.',
  tags: ['hr', 'recruitment', 'metrics', 'analytics'],
  requiredRoles: ['hr', 'manager', 'admin'],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'hr:get_recruitment_metrics',
      description: 'Get recruitment metrics including time-to-hire, offer acceptance rate, source effectiveness, and pipeline conversion rates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const dashboard = await recruitmentMetrics.getDashboardMetrics(buildCtx(ctx, organizationId)) as { openPositions: number; activeApplicants: number; avgTimeToHire: number; offerAcceptanceRate: number };
    return {
      success: true,
      data: dashboard,
      summary: `Recruitment metrics: ${dashboard.openPositions} open positions, ${dashboard.activeApplicants} active applicants, ${(dashboard.avgTimeToHire ?? 0).toFixed(1)} days time to hire, ${(dashboard.offerAcceptanceRate * 100).toFixed(0)}% offer acceptance.`,
      metadata: { source: 'recruitment metrics', count: 1 },
    };
  },
};

export const getCrossModuleReport: ToolRegistration = {
  name: 'hr:get_cross_module_report',
  namespace: 'hr',
  summary: 'Cross-module recruitment report: hiring + onboarding + performance.',
  tags: ['hr', 'recruitment', 'cross-module', 'report'],
  requiredRoles: ['hr', 'manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'focus?: string, period?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'hr:get_cross_module_report',
      description: 'Generate a cross-module analytics report showing correlations between marketing campaigns and revenue, support trends and product issues, project profitability, and hiring needs.',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: 'Which cross-module report to run.', enum: ['marketing_revenue', 'support_product', 'project_profitability', 'hiring_forecast', 'executive'] },
          period: { type: 'string', description: 'Optional reporting period.', enum: ['month', 'quarter', 'year'] },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
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
};

export const compareEmployees: ToolRegistration = {
  name: 'hr:compare_employees',
  namespace: 'hr',
  summary: 'Compare two employees: performance, tasks, metrics side-by-side.',
  tags: ['hr', 'people', 'compare', 'performance'],
  requiredRoles: ['admin', 'manager', 'cpo', 'hr'],
  deferLoaded: true,
  parameterHints: 'employee_names: string, time_period?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'hr:compare_employees',
      description: 'Compare two or more employees side-by-side on all performance metrics. Use when asked to compare John and Sarah, who is performing better, side-by-side comparison, etc.',
      parameters: {
        type: 'object',
        properties: {
          employee_names: { type: 'string', description: 'Comma-separated names of employees to compare. E.g., "John, Sarah, Mike"' },
          time_period: { type: 'string', description: 'Time period for comparison.', enum: ['this_week', 'this_month', 'this_quarter', 'this_year'] },
        },
        required: ['employee_names'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const employeeNames = (args.employee_names as string) || '';
    const timePeriod = (args.time_period as string) || 'this_month';
    const names = employeeNames.split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length < 2) return { success: false, data: null, summary: 'Please provide at least 2 employee names separated by commas.' };
    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) return { success: false, data: null, summary: 'Organization not configured.' };
    const dateFilter = buildComparisonDateFilter(timePeriod);
    const users: { auth_user_id: string; full_name: string }[] = [];
    for (const name of names) {
      const result = await query<{ auth_user_id: string; full_name: string }>(
        `SELECT auth_user_id, full_name FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
           AND auth_user_id IS NOT NULL AND auth_user_id != ''
         LIMIT 1`,
        [orgId, `%${name}%`],
      );
      if (result.rows.length > 0) users.push(result.rows[0]);
    }
    if (users.length < 2) return { success: false, data: null, summary: `Could only find ${users.length} of ${names.length} employees. Check the names and try again.` };
    const userIds = users.map((u) => u.auth_user_id);
    const metricsResult = await query(
      `SELECT ru.auth_user_id, ru.full_name, COALESCE(ru.xp, 0)::int as points,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.status IN ('completed', 'done') AND t.completed_at >= $2), 0) as tasks_completed,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.status NOT IN ('completed', 'done', 'cancelled')), 0) as tasks_active,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled')), 0) as tasks_overdue,
        COALESCE((SELECT COUNT(*)::int FROM activities a WHERE a.user_id = ru.auth_user_id AND a.created_at >= $2), 0) as activities,
        COALESCE((SELECT COUNT(*)::int FROM user_badges ub WHERE ub.user_id = ru.auth_user_id), 0) as badges,
        COALESCE((SELECT COUNT(*)::int FROM knowledge_documents kd WHERE kd.author_id = ru.auth_user_id AND kd.created_at >= $2), 0) as docs
       FROM reimbursement_users ru WHERE ru.organization_id = $3 AND ru.auth_user_id = ANY($1)`,
      [userIds, dateFilter, orgId],
    );
    const metrics = metricsResult.rows as Record<string, unknown>[];
    const periodLabel = timePeriod.replace('_', ' ');
    let summary = `**Employee Comparison (${periodLabel}):**\n\n`;
    summary += `| Metric | ${metrics.map((r) => r.full_name).join(' | ')} |\n`;
    summary += `|--------|${metrics.map(() => '---').join('|')}|\n`;
    summary += `| Tasks Completed | ${metrics.map((r) => r.tasks_completed).join(' | ')} |\n`;
    summary += `| Active Tasks | ${metrics.map((r) => r.tasks_active).join(' | ')} |\n`;
    summary += `| Overdue | ${metrics.map((r) => r.tasks_overdue).join(' | ')} |\n`;
    summary += `| XP (Points) | ${metrics.map((r) => r.points).join(' | ')} |\n`;
    summary += `| Activities | ${metrics.map((r) => r.activities).join(' | ')} |\n`;
    summary += `| Badges | ${metrics.map((r) => r.badges).join(' | ')} |\n`;
    summary += `| Docs Authored | ${metrics.map((r) => r.docs).join(' | ')} |\n`;
    return {
      success: true,
      data: metrics,
      summary,
      metadata: { source: 'reimbursement_users, tasks, activities, user_badges, knowledge_documents', count: metrics.length, timeRange: timePeriod },
    };
  },
};
