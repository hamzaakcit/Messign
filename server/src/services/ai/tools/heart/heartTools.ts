/**
 * Dora Heart Tools — Team health, wellness, culture, pulse surveys
 *
 * 5 tools: get_team_sentiment, get_burnout_risk, get_culture_score,
 * get_my_wellness, send_pulse_survey (HITL)
 */

import { query } from '../../../../db/index.js';
import { registerTool } from '../../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../../types.js';
import type { CallerContext } from '../../../../dal/types.js';
import * as heart from '../../../../dal/heart/index.js';

const DEFAULT_ORG_SLUG = 'messign';

async function resolveReimbursementUserId(authUserId: string): Promise<string | null> {
  const r = await query<{ id: string }>(
    `SELECT id::text AS id FROM reimbursement_users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
    [authUserId]
  );
  return r.rows[0]?.id ?? null;
}

async function buildCallerContext(ctx: ToolContext): Promise<CallerContext | null> {
  const ruId = await resolveReimbursementUserId(ctx.userId);
  if (!ruId) return null;

  let teamId = ctx.teamId;
  let departmentId: string | undefined;

  if (ctx.userId) {
    const teamRow = await query<{ team_id: string; team_name: string }>(
      `SELECT ptm.team_id::text AS team_id, pt.team_name
       FROM performance_team_members ptm
       JOIN performance_teams pt ON pt.id = ptm.team_id
       WHERE ptm.employee_id = $1 AND ptm.is_active = TRUE LIMIT 1`,
      [ctx.userId]
    );
    teamId = teamRow.rows[0]?.team_id ?? teamId;
    departmentId = teamRow.rows[0]?.team_name;
  }

  const orgRow = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const organizationId = orgRow.rows[0]?.id;

  return {
    userId: ruId,
    role: (ctx.userRole as CallerContext['role']) || 'employee',
    teamId,
    departmentId,
    organizationId,
  };
}

// ── Tool 1: get_team_sentiment ──
registerTool({
  name: 'heart:get_team_sentiment',
  metadata: {
    namespace: 'heart',
    name: 'get_team_sentiment',
    summary: 'Team sentiment: engagement, morale, trend over time.',
    tags: ['heart', 'sentiment', 'engagement', 'morale'],
    alwaysLoaded: false,
    parameterHints: 'team_id?: string',
  },
  category: 'people',
  description: `Get the current team or department sentiment and engagement metrics. Shows anonymized aggregate data only — no individual names. Use when the user asks about team sentiment, morale, engagement, or how the team is feeling.`,
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: 'Scope of data: team (manager sees only their team), department (dept_head+), or organization (admin).',
        enum: ['team', 'department', 'organization'],
      },
    },
    required: [],
  },
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  async execute(args: Record<string, unknown>, context: ToolContext) {
    const scope = (args.scope as string) || 'team';
    const callerCtx = await buildCallerContext(context);
    if (!callerCtx) return { success: false, data: null, summary: 'User not found.' };

    const scopeType = scope as 'team' | 'department' | 'organization';
    const scopeId = scopeType === 'team' ? callerCtx.teamId : scopeType === 'department' ? callerCtx.departmentId : undefined;

    const health = await heart.getTeamHealth(callerCtx, scopeType, scopeId);
    if (!health) {
      return {
        success: true,
        data: null,
        summary: `No team health data available for ${scope} yet. Data is calculated periodically.`,
        metadata: { source: 'heart_team_health' },
      };
    }

    const trend = health.healthTrend === 'improving' ? '↑ improving' : health.healthTrend === 'declining' ? '↓ declining' : '→ stable';
    return {
      success: true,
      data: health,
      summary: `Team health: ${health.healthScore}/100 (${trend}). Engagement: ${health.engagementScore}, Sentiment: ${health.sentimentScore}. ${health.atRiskCount} team members at elevated risk (anonymized).`,
      metadata: { source: 'heart_team_health', count: 1 },
    };
  },
} as Tool);

// ── Tool 2: get_burnout_risk ──
registerTool({
  name: 'heart:get_burnout_risk',
  metadata: {
    namespace: 'heart',
    name: 'get_burnout_risk',
    summary: 'Burnout risk: signals, risk level, wellness indicators.',
    tags: ['heart', 'burnout', 'wellness'],
    alwaysLoaded: false,
    parameterHints: 'user_identifier?: string',
  },
  category: 'people',
  description: `Check burnout risk indicators for the team. Returns anonymized aggregate only — no individual names. Use when the user asks about burnout, stress, workload, or team exhaustion.`,
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: 'Scope: team, department, or organization.',
        enum: ['team', 'department', 'organization'],
      },
    },
    required: [],
  },
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  async execute(args: Record<string, unknown>, context: ToolContext) {
    const scope = (args.scope as string) || 'team';
    const callerCtx = await buildCallerContext(context);
    if (!callerCtx) return { success: false, data: null, summary: 'User not found.' };

    const scopeType = scope as 'team' | 'department' | 'organization';
    const scopeId = scopeType === 'team' ? callerCtx.teamId : scopeType === 'department' ? callerCtx.departmentId : undefined;

    const health = await heart.getTeamHealth(callerCtx, scopeType, scopeId);
    if (!health) {
      return {
        success: true,
        data: null,
        summary: `No burnout risk data for ${scope} yet.`,
        metadata: { source: 'heart_team_health' },
      };
    }

    const suggestions: string[] = [];
    if (health.atRiskCount > 0) suggestions.push('Schedule a casual team check-in this week.');
    if (health.healthScore < 60) suggestions.push('Consider workload review and prioritization.');
    if (health.sentimentScore < 50) suggestions.push('Team morale may need attention. Consider anonymous feedback.');

    return {
      success: true,
      data: {
        teamSize: health.memberCount,
        atRiskCount: health.atRiskCount,
        healthScore: health.healthScore,
        suggestedActions: suggestions.length ? suggestions : ['No immediate actions suggested.'],
      },
      summary: `Team size: ${health.memberCount}. ${health.atRiskCount} members at elevated burnout risk (anonymized). Health score: ${health.healthScore}/100. ${suggestions.length ? `Suggested: ${suggestions.join(' ')}` : 'No immediate actions.'}`,
      metadata: { source: 'heart_team_health', count: 1 },
    };
  },
} as Tool);

// ── Tool 3: get_culture_score ──
registerTool({
  name: 'heart:get_culture_score',
  metadata: {
    namespace: 'heart',
    name: 'get_culture_score',
    summary: 'Culture score: team health, engagement, pulse survey results.',
    tags: ['heart', 'culture', 'team-health'],
    alwaysLoaded: false,
    parameterHints: 'department_id?: string',
  },
  category: 'people',
  description: `Get the overall company culture score with department breakdown and trend data. Use when the user asks about culture, company health, or department comparison.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  requiredRoles: ['admin', 'dept_head', 'system_admin', 'finance_admin'],
  async execute(_args: Record<string, unknown>, context: ToolContext) {
    const callerCtx = await buildCallerContext(context);
    if (!callerCtx) return { success: false, data: null, summary: 'User not found.' };

    const orgHealth = await heart.getTeamHealth(callerCtx, 'organization');
    const departments = await heart.getDepartmentComparison(callerCtx);

    const summary = orgHealth
      ? `Organization health: ${orgHealth.healthScore}/100 (${orgHealth.healthTrend}). `
      : '';
    const deptSummary = departments.length
      ? `Departments: ${departments.map((d) => `${d.scopeName ?? 'Unknown'}: ${d.healthScore}`).join(', ')}.`
      : '';

    return {
      success: true,
      data: { orgHealth, departments },
      summary: `${summary}${deptSummary}`,
      metadata: { source: 'heart_team_health', count: departments.length + 1 },
    };
  },
} as Tool);

// ── Tool 4: get_my_wellness (personal tool) ──
registerTool({
  name: 'heart:get_my_wellness',
  category: 'people',
  description: `Get your personal wellness insights including work-life balance, engagement, and sentiment trends. Only returns data for the asking user. Use when the user asks about their own wellness, work-life balance, burnout, or how they're doing.`,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  requiredRoles: [],
  async execute(_args, context) {
    const callerCtx = await buildCallerContext(context);
    if (!callerCtx) return { success: false, data: null, summary: 'User not found.' };

    const [insights, history] = await Promise.all([
      heart.getMyWellnessInsights(callerCtx),
      heart.getMySentimentHistory(callerCtx, 30),
    ]);

    const trend = insights.sentimentTrend === 'improving' ? 'improving' : insights.sentimentTrend === 'declining' ? 'declining' : 'stable';
    return {
      success: true,
      data: { insights, sentimentHistory: history },
      summary: `Your wellness: sentiment trend ${trend}, burnout risk ${insights.burnoutRisk}. ${insights.hoursThisWeek} hours this week. Suggestions: ${insights.suggestions.join(' ')}`,
      metadata: { source: 'heart_sentiment_scores, heart_burnout_assessments, time_entries' },
    };
  },
} as Tool);

// ── Tool 5: send_pulse_survey (write tool — HITL) ──
registerTool({
  name: 'heart:send_pulse_survey',
  metadata: {
    namespace: 'heart',
    name: 'send_pulse_survey',
    summary: 'Send pulse survey to team. Manager/admin only.',
    tags: ['heart', 'pulse', 'survey'],
    alwaysLoaded: false,
    parameterHints: 'team_id?: string',
  },
  category: 'people',
  description: `Send a wellness pulse survey to the team. Requires human confirmation before sending. Use when the user wants to send a pulse check, wellness survey, or quick team feedback.`,
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: 'Target scope: team, department, or organization.',
        enum: ['team', 'department', 'organization'],
      },
      customQuestions: {
        type: 'array',
        description: 'Optional custom questions. If not provided, Dora uses rotating questions.',
        items: { type: 'string' },
      },
    },
    required: [],
  },
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  async execute(args: Record<string, unknown>, _context: ToolContext) {
    const scope = (args.scope as string) || 'organization';
    const customQuestions = args.customQuestions as string[] | undefined;

    const questions = Array.isArray(customQuestions) && customQuestions.length > 0
      ? customQuestions.map((q, i) => ({ id: `q${i + 1}`, text: q, scale: '1-5' }))
      : [
          { id: 'supported', text: 'How supported do you feel by your team this week?', scale: '1-5' },
          { id: 'workload', text: 'How manageable is your current workload?', scale: '1-5' },
        ];

    return {
      success: true,
      data: {
        actionType: 'send_pulse_survey',
        requiresConfirmation: true,
        scope,
        questions,
        description: `Send a ${questions.length}-question pulse survey to ${scope}`,
      },
      summary: `To send this pulse survey, please confirm in the app. Questions: ${questions.map((q) => q.text).join('; ')}`,
      metadata: { source: 'heart_pulse_surveys', hitl: true },
    };
  },
} as Tool);
