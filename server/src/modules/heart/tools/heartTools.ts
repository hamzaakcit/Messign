/**
 * Heart Module — Tool registrations
 */
import { query } from '../../../db/index.js';
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as heart from '../../../dal/heart/index.js';

const DEFAULT_ORG_SLUG = 'messign';

async function resolveReimbursementUserId(authUserId: string): Promise<string | null> {
  const r = await query<{ id: string }>(
    `SELECT id::text AS id FROM reimbursement_users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
    [authUserId],
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
      [ctx.userId],
    );
    teamId = teamRow.rows[0]?.team_id ?? teamId;
    departmentId = teamRow.rows[0]?.team_name;
  }

  const orgRow = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG],
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

export const getTeamSentiment: ToolRegistration = {
  name: 'heart:get_team_sentiment',
  namespace: 'heart',
  summary: 'Team sentiment: engagement, morale, trend over time.',
  tags: ['heart', 'sentiment', 'engagement', 'morale'],
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  deferLoaded: true,
  parameterHints: 'scope?: team|department|organization',

  llmSchema: {
    type: 'function',
    function: {
      name: 'heart:get_team_sentiment',
      description: 'Get the current team or department sentiment and engagement metrics. Shows anonymized aggregate data only.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description: 'Scope of data: team, department, or organization.',
            enum: ['team', 'department', 'organization'],
          },
        },
        required: [],
      },
    },
  },

  handler: async (args, context): Promise<ToolResult> => {
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
        summary: `No team health data available for ${scope} yet.`,
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
};

export const getBurnoutRisk: ToolRegistration = {
  name: 'heart:get_burnout_risk',
  namespace: 'heart',
  summary: 'Burnout risk: signals, risk level, wellness indicators.',
  tags: ['heart', 'burnout', 'wellness'],
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  deferLoaded: true,
  parameterHints: 'scope?: team|department|organization',

  llmSchema: {
    type: 'function',
    function: {
      name: 'heart:get_burnout_risk',
      description: 'Check burnout risk indicators for the team. Returns anonymized aggregate only.',
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
    },
  },

  handler: async (args, context): Promise<ToolResult> => {
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
      summary: `Team size: ${health.memberCount}. ${health.atRiskCount} members at elevated burnout risk (anonymized). Health score: ${health.healthScore}/100.`,
      metadata: { source: 'heart_team_health', count: 1 },
    };
  },
};

export const getCultureScore: ToolRegistration = {
  name: 'heart:get_culture_score',
  namespace: 'heart',
  summary: 'Culture score: team health, engagement, pulse survey results.',
  tags: ['heart', 'culture', 'team-health'],
  requiredRoles: ['admin', 'dept_head', 'system_admin', 'finance_admin'],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'heart:get_culture_score',
      description: 'Get the overall company culture score with department breakdown and trend data.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, context): Promise<ToolResult> => {
    const callerCtx = await buildCallerContext(context);
    if (!callerCtx) return { success: false, data: null, summary: 'User not found.' };

    const orgHealth = await heart.getTeamHealth(callerCtx, 'organization');
    const departments = await heart.getDepartmentComparison(callerCtx);

    const summary = orgHealth ? `Organization health: ${orgHealth.healthScore}/100 (${orgHealth.healthTrend}). ` : '';
    const deptSummary = departments.length ? `Departments: ${departments.map((d) => `${d.scopeName ?? 'Unknown'}: ${d.healthScore}`).join(', ')}.` : '';

    return {
      success: true,
      data: { orgHealth, departments },
      summary: `${summary}${deptSummary}`,
      metadata: { source: 'heart_team_health', count: departments.length + 1 },
    };
  },
};

export const getMyWellness: ToolRegistration = {
  name: 'heart:get_my_wellness',
  namespace: 'heart',
  summary: 'Personal wellness: work-life balance, engagement, sentiment.',
  tags: ['heart', 'wellness', 'personal'],
  requiredRoles: [],
  deferLoaded: true,
  parameterHints: '(none)',

  llmSchema: {
    type: 'function',
    function: {
      name: 'heart:get_my_wellness',
      description: 'Get your personal wellness insights including work-life balance, engagement, and sentiment trends.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  handler: async (_args, context): Promise<ToolResult> => {
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
};

export const sendPulseSurvey: ToolRegistration = {
  name: 'heart:send_pulse_survey',
  namespace: 'heart',
  summary: 'Send pulse survey to team. Manager/admin only.',
  tags: ['heart', 'pulse', 'survey'],
  requiredRoles: ['admin', 'manager', 'dept_head', 'finance_admin', 'system_admin'],
  deferLoaded: true,
  parameterHints: 'scope?: string, customQuestions?: string[]',

  llmSchema: {
    type: 'function',
    function: {
      name: 'heart:send_pulse_survey',
      description: 'Send a wellness pulse survey to the team. Requires human confirmation before sending.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description: 'Target scope: team, department, or organization.',
            enum: ['team', 'department', 'organization'],
          },
          customQuestions: {
            type: 'string',
            description: 'Optional custom questions as comma-separated list.',
          },
        },
        required: [],
      },
    },
  },

  handler: async (args): Promise<ToolResult> => {
    const scope = (args.scope as string) || 'organization';
    const customQuestionsRaw = args.customQuestions as string | string[] | undefined;
    const customQuestions = typeof customQuestionsRaw === 'string'
      ? customQuestionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(customQuestionsRaw) ? customQuestionsRaw : [];

    const questions =
      customQuestions.length > 0
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
      metadata: { source: 'heart_pulse_surveys', count: 1 },
    };
  },
};
