/**
 * Executive Module — Tool registrations (dashboard, briefing)
 */
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import { getExecutiveDashboard } from '../../../dal/executive/dashboard.js';
import { getOrGenerateBriefing } from '../../../services/dora/dailyBriefing.js';
import { getAiRequestMetrics } from '../../../services/ai/telemetry/service.js';

function toCallerContext(ctx: ToolContext): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole as CallerContext['role']) || 'employee',
    teamId: ctx.teamId ?? undefined,
    organizationId: ctx.organizationId ?? undefined,
  };
}

export const getExecutiveDashboardTool: ToolRegistration = {
  name: 'executive:get_executive_dashboard',
  namespace: 'executive',
  summary: 'Executive dashboard: KPIs, cross-module metrics, critical alerts.',
  tags: ['executive', 'dashboard', 'kpis'],
  requiredRoles: ['admin', 'manager', 'cpo'],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'executive:get_executive_dashboard',
      description:
        'Get a comprehensive overview of the entire company including revenue, support, marketing, hiring, and team metrics.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, context): Promise<ToolResult> => {
    try {
      if (!context.organizationId) {
        return { success: false, data: null, summary: 'Cannot fetch executive dashboard: missing organization context.' };
      }
      const data = await getExecutiveDashboard(toCallerContext(context));
      return {
        success: true,
        data,
        summary: `Executive overview loaded: revenue YTD ${data.revenue.totalYTD}, open tickets ${data.support.openTickets}, overall OKR progress ${data.okrs.overallProgress}%.`,
        metadata: { source: 'executive dashboard aggregate' },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        summary: `Failed to fetch executive dashboard: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

export const generateDailyBriefingTool: ToolRegistration = {
  name: 'executive:generate_daily_briefing',
  namespace: 'executive',
  summary: 'Generate daily briefing: actions, sales, support, finance summary.',
  tags: ['executive', 'briefing', 'daily'],
  requiredRoles: ['admin', 'manager', 'member', 'cpo'],
  deferLoaded: true,
  parameterHints: 'date?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'executive:generate_daily_briefing',
      description: "Generate or retrieve today's personalized daily briefing.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, context): Promise<ToolResult> => {
    try {
      if (!context.organizationId) {
        return { success: false, data: null, summary: 'Cannot fetch daily briefing: missing organization context.' };
      }
      const briefing = await getOrGenerateBriefing(toCallerContext(context));
      return {
        success: true,
        data: briefing,
        summary: `${briefing.greeting}. ${briefing.summary}`,
        metadata: { source: 'daily_briefings' },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        summary: `Failed to fetch daily briefing: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

export const getAiMetricsTool: ToolRegistration = {
  name: 'executive:get_ai_metrics',
  namespace: 'executive',
  summary: 'AI observability: requests by path, fallback rate, duration percentiles, top errors.',
  tags: ['executive', 'ai', 'observability', 'metrics'],
  requiredRoles: ['admin'],
  deferLoaded: true,
  parameterHints: 'rangeDays?: number (default 7)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'executive:get_ai_metrics',
      description:
        'Get AI request observability metrics: total requests per day/week, breakdown by path (orchestrator vs agenticLoop vs intentRouter fallback), average duration by specialist, top error messages, fallback rate (target: orchestrator >90%), P50/P95 duration (target: P50 <5s, P95 <15s).',
      parameters: {
        type: 'object',
        properties: {
          rangeDays: {
            type: 'number',
            description: 'Number of days to include. Default 7.',
          },
        },
        required: [],
      },
    },
  },

  handler: async (args, context): Promise<ToolResult> => {
    try {
      if (!context.organizationId) {
        return { success: false, data: null, summary: 'Cannot fetch AI metrics: missing organization context.' };
      }
      const rangeDays = typeof args.rangeDays === 'number' ? Math.min(90, Math.max(1, args.rangeDays)) : 7;
      const data = await getAiRequestMetrics(context.organizationId, rangeDays);
      const summary =
        `AI metrics (${rangeDays}d): ${data.totalRequests} requests, fallback rate ${data.fallbackRate}% ` +
        `(target <10%), P50 ${data.p50DurationMs}ms P95 ${data.p95DurationMs}ms (target P50 <5s P95 <15s).`;
      return {
        success: true,
        data,
        summary,
        metadata: { source: 'ai_request_telemetry' },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        summary: `Failed to fetch AI metrics: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
