/**
 * Time Module — Tool registrations
 */
import { query } from '../../../db/index.js';
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as timeUtil from '../../../dal/time/utilization.js';
import * as doraReads from '../../../dal/doraReads.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', ['messign']);
  return result.rows[0]?.id;
}

export const getTimeSummary: ToolRegistration = {
  name: 'time:get_time_summary',
  namespace: 'time',
  summary: 'Time tracking summary: hours logged, by project, billable.',
  tags: ['time', 'timesheet', 'hours'],
  requiredRoles: [],
  deferLoaded: true,
  parameterHints: 'period?: string, userId?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'time:get_time_summary',
      description: 'Get a summary of time logged by the current user or team including hours, utilization, and billable revenue.',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month'], description: 'Optional period for the summary.' },
          userId: { type: 'string', description: 'Optional user ID (admin/manager use only).' },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const period = args.period === 'week' ? 'week' : 'month';
    if (typeof args.userId === 'string' && args.userId && ['system_admin', 'finance_admin', 'manager', 'admin'].includes(String(callerCtx.role))) {
      const data = await timeUtil.getUserUtilization(callerCtx, args.userId, period);
      return { success: true, data, summary: `${data.fullName}: ${data.totalHours.toFixed(2)}h logged, ${data.billableHours.toFixed(2)}h billable, utilization ${data.utilizationPercent.toFixed(1)}%, billable revenue €${data.billableRevenue.toFixed(2)}.`, metadata: { source: 'time' } };
    }
    const data = await timeUtil.getUserUtilization(callerCtx, callerCtx.userId, period);
    return { success: true, data, summary: `You logged ${data.totalHours.toFixed(2)}h (${data.billableHours.toFixed(2)} billable) with ${data.utilizationPercent.toFixed(1)}% utilization and €${data.billableRevenue.toFixed(2)} billable revenue.`, metadata: { source: 'time' } };
  },
};

export const getUtilizationReport: ToolRegistration = {
  name: 'time:get_utilization_report',
  namespace: 'time',
  summary: 'Team utilization report: billable vs non-billable hours.',
  tags: ['time', 'utilization', 'team'],
  requiredRoles: [],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'time:get_utilization_report',
      description: 'Get team utilization report showing billable vs non-billable hours and utilization percentages.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const report = await doraReads.getTimeUtilization(callerCtx);
    const preview = report.slice(0, 5).map((row: Record<string, unknown>) => `${row.full_name}: ${Number(row.utilization_percent).toFixed(1)}%`).join('\n');
    return { success: true, data: report, summary: `Utilization report for ${report.length} user(s).\n${preview || 'No utilization data found.'}`, metadata: { source: 'mv_time_utilization', count: report.length } };
  },
};

export const suggestTimeAllocation: ToolRegistration = {
  name: 'time:suggest_time_allocation',
  namespace: 'time',
  summary: 'Suggest time allocation across projects based on capacity.',
  tags: ['time', 'allocation', 'suggestions'],
  requiredRoles: [],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'time:suggest_time_allocation',
      description: 'Suggest optimal time allocation based on current projects, deadlines, and historical patterns.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const [recentProjects, userUtil] = await Promise.all([
      query<{ project_id: string; project_name: string; hours: string }>(
        `SELECT te.project_id, COALESCE(p.name, 'No Project') AS project_name, COALESCE(SUM(te.hours), 0)::float::text AS hours
         FROM time_entries te LEFT JOIN projects p ON p.id = te.project_id
         WHERE te.organization_id = $1 AND te.user_id = $2 AND te.date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY te.project_id, COALESCE(p.name, 'No Project')
         ORDER BY COALESCE(SUM(te.hours), 0) DESC LIMIT 5`,
        [organizationId, callerCtx.userId],
      ),
      timeUtil.getUserUtilization(callerCtx, callerCtx.userId),
    ]);
    const targetWeekHours = 40;
    const billableTarget = Math.round((targetWeekHours * Math.max(75, userUtil.targetUtilization)) / 100);
    const suggested = recentProjects.rows.map((row) => ({
      projectId: row.project_id,
      projectName: row.project_name,
      suggestedHours: Number(((Number(row.hours) / Math.max(1, recentProjects.rows.reduce((s, r) => s + Number(r.hours), 0))) * targetWeekHours).toFixed(1)),
    }));
    return {
      success: true,
      data: { targetWeekHours, billableTarget, allocation: suggested },
      summary: `Suggested allocation for this week: target ${targetWeekHours}h (${billableTarget}h billable). Prioritize top active projects by historical effort and pending deadlines.`,
      metadata: { source: 'time_entries, projects', count: suggested.length },
    };
  },
};
