import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import type { CallerContext } from '../../../dal/types.js';
import { getExecutiveDashboard } from '../../../dal/executive/dashboard.js';
import { getOrGenerateBriefing } from '../../dora/dailyBriefing.js';

function toCallerContext(ctx: ToolContext): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole as CallerContext['role']) || 'employee',
    teamId: ctx.teamId ?? undefined,
  };
}

const executiveDashboardTool: Tool = {
  name: 'get_executive_dashboard',
  category: 'analytics',
  description:
    'Get a comprehensive overview of the entire company including revenue, support, marketing, hiring, and team metrics.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  requiredRoles: ['admin', 'manager', 'cpo'],
  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const data = await getExecutiveDashboard(toCallerContext(context));
      return {
        success: true,
        data,
        summary: `Executive overview loaded: revenue YTD ${data.revenue.totalYTD}, open tickets ${data.support.openTickets}, overall OKR progress ${data.okrs.overallProgress}%.`,
        metadata: { source: 'executive dashboard aggregate' },
      };
    } catch (error) {
      return { success: false, data: null, summary: `Failed to fetch executive dashboard: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

const dailyBriefingTool: Tool = {
  name: 'generate_daily_briefing',
  category: 'analytics',
  description: "Generate or retrieve today's personalized daily briefing.",
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  requiredRoles: ['admin', 'manager', 'member', 'cpo'],
  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const briefing = await getOrGenerateBriefing(toCallerContext(context));
      return {
        success: true,
        data: briefing,
        summary: `${briefing.greeting}. ${briefing.summary}`,
        metadata: { source: 'daily_briefings' },
      };
    } catch (error) {
      return { success: false, data: null, summary: `Failed to fetch daily briefing: ${error instanceof Error ? error.message : String(error)}` };
    }
  },
};

registerTool(executiveDashboardTool);
registerTool(dailyBriefingTool);

export default [executiveDashboardTool, dailyBriefingTool];
