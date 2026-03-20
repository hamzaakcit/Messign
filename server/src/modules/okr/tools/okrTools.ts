/**
 * OKR Module — Tool registrations
 */
import { query } from '../../../db/index.js';
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as okrsDal from '../../../dal/okrs.js';
import { resolveOrgIdForTool } from '../../../services/ai/tools/resolveOrgIdForTool.js';

function buildCtx(ctx: ToolContext, organizationId?: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

export const getOKRMetrics: ToolRegistration = {
  name: 'okr:get_okr_metrics',
  namespace: 'okr',
  summary: 'OKR metrics: goals on track, at risk, completed, avg progress.',
  tags: ['okr', 'goals', 'metrics'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'periodId?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'okr:get_okr_metrics',
      description: 'Get OKR metrics including total goals, on track, at risk, behind, completed, and average progress.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'Optional OKR period ID to filter by.' },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const metrics = await okrsDal.getOKRMetrics(callerCtx, args.periodId as string | undefined);
    return {
      success: true,
      data: metrics,
      summary: `OKR metrics: ${metrics.totalGoals} goals (${metrics.onTrack} on track, ${metrics.atRisk} at risk, ${metrics.behind} behind, ${metrics.completed} completed). Avg progress: ${metrics.avgProgress.toFixed(1)}%.`,
      metadata: { source: 'okr_goals', count: metrics.totalGoals },
    };
  },
};

export const listOKRGoals: ToolRegistration = {
  name: 'okr:list_goals',
  namespace: 'okr',
  summary: 'List OKR goals with key results. Filter by period, level, parent.',
  tags: ['okr', 'goals', 'key-results'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'periodId?: string, level?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'okr:list_goals',
      description: 'List OKR goals with their key results. Can filter by period, level (company/department/team/individual), or parent goal.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'Optional period ID.' },
          level: { type: 'string', enum: ['company', 'department', 'team', 'individual'], description: 'Optional goal level.' },
          parentGoalId: { type: 'string', description: 'Optional parent goal ID.' },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const goals = await okrsDal.listGoals(
      callerCtx,
      args.periodId as string | undefined,
      args.level as string | undefined,
      args.parentGoalId as string | undefined,
    );
    return {
      success: true,
      data: goals,
      summary: `Found ${goals.length} OKR goals.`,
      metadata: { source: 'okr_goals', count: goals.length },
    };
  },
};

export const getOKRGoalTree: ToolRegistration = {
  name: 'okr:get_goal_tree',
  namespace: 'okr',
  summary: 'Get OKR goal tree for a period (hierarchical structure).',
  tags: ['okr', 'goals', 'tree'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'periodId: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'okr:get_goal_tree',
      description: 'Get the hierarchical OKR goal tree for a given period.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'OKR period ID.' },
        },
        required: ['periodId'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const periodId = args.periodId as string;
    if (!periodId) return { success: false, data: null, summary: 'periodId is required.' };
    const callerCtx = buildCtx(ctx, organizationId);
    const tree = await okrsDal.getGoalTree(callerCtx, periodId);
    return {
      success: true,
      data: tree,
      summary: `Goal tree for period: ${tree.length} top-level goals.`,
      metadata: { source: 'okr_goals', count: tree.length },
    };
  },
};
