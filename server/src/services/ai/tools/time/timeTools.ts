import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';
import * as timeUtil from '../../../../dal/time/utilization.js';
import * as doraReads from '../../../../dal/doraReads.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

async function resolveOrgId(): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    'SELECT id FROM organizations WHERE slug = $1 LIMIT 1',
    ['messign'],
  );
  return result.rows[0]?.id;
}

registerTool({
  name: 'get_time_summary',
  category: 'analytics',
  description: 'Get a summary of time logged by the current user or team including hours, utilization, and billable revenue.',
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['week', 'month'], description: 'Optional period for the summary.' },
      userId: { type: 'string', description: 'Optional user ID (admin/manager use only).' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const period = args.period === 'week' ? 'week' : 'month';

    if (typeof args.userId === 'string' && args.userId && ['system_admin', 'finance_admin', 'manager', 'admin'].includes(String(callerCtx.role))) {
      const data = await timeUtil.getUserUtilization(callerCtx, args.userId, period);
      return {
        success: true,
        data,
        summary: `${data.fullName}: ${data.totalHours.toFixed(2)}h logged, ${data.billableHours.toFixed(2)}h billable, utilization ${data.utilizationPercent.toFixed(1)}%, billable revenue €${data.billableRevenue.toFixed(2)}.`,
      };
    }

    const data = await timeUtil.getUserUtilization(callerCtx, callerCtx.userId, period);
    return {
      success: true,
      data,
      summary: `You logged ${data.totalHours.toFixed(2)}h (${data.billableHours.toFixed(2)} billable) with ${data.utilizationPercent.toFixed(1)}% utilization and €${data.billableRevenue.toFixed(2)} billable revenue.`,
    };
  },
});

registerTool({
  name: 'get_utilization_report',
  category: 'analytics',
  description: 'Get team utilization report showing billable vs non-billable hours and utilization percentages.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const report = await doraReads.getTimeUtilization(callerCtx);
    const preview = report.slice(0, 5).map((row: any) => `${row.full_name}: ${Number(row.utilization_percent).toFixed(1)}%`).join('\n');
    return {
      success: true,
      data: report,
      summary: `Utilization report for ${report.length} user(s).\n${preview || 'No utilization data found.'}`,
      metadata: { source: 'mv_time_utilization', count: report.length },
    };
  },
});

registerTool({
  name: 'suggest_time_allocation',
  category: 'analytics',
  description: 'Suggest optimal time allocation based on current projects, deadlines, and historical patterns.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const organizationId = await resolveOrgId();
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);

    const [recentProjects, userUtil] = await Promise.all([
      query<{ project_id: string; project_name: string; hours: string }>(
        `SELECT
           te.project_id,
           COALESCE(p.name, 'No Project') AS project_name,
           COALESCE(SUM(te.hours), 0)::float::text AS hours
         FROM time_entries te
         LEFT JOIN projects p ON p.id = te.project_id
         WHERE te.organization_id = $1
           AND te.user_id = $2
           AND te.date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY te.project_id, COALESCE(p.name, 'No Project')
         ORDER BY COALESCE(SUM(te.hours), 0) DESC
         LIMIT 5`,
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
      data: {
        targetWeekHours,
        billableTarget,
        allocation: suggested,
      },
      summary: `Suggested allocation for this week: target ${targetWeekHours}h (${billableTarget}h billable). Prioritize top active projects by historical effort and pending deadlines.`,
      metadata: { source: 'time_entries, projects', count: suggested.length },
    };
  },
});
