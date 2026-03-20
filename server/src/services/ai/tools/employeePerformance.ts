/**
 * Tool: get_employee_performance
 *
 * Queries performance-related data: reimbursement_users, tasks (assignees JSONB),
 * user_badges, activities, knowledge_documents. Leaderboard from reimbursement_users.xp.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { limitRecords } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

function buildDateFilter(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
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
    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarter, 1);
    }
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1);
    case 'all_time':
    default:
      return new Date(0);
  }
}

function formatPerformanceSummary(
  employees: Record<string, unknown>[],
  teamAvg: Record<string, unknown> | null,
  period: string
): string {
  const periodLabel = period.replace('_', ' ');

  const employeeSections = employees.map((e) => {
    const tasksCompleted = (e.tasks_completed as number) ?? 0;
    const tasksAssignedPeriod = (e.tasks_assigned_period as number) ?? 0;
    const completionRate = tasksAssignedPeriod > 0 ? Math.round((tasksCompleted / tasksAssignedPeriod) * 100) : 0;

    let section = `**${e.full_name}** (${e.auth_user_id || e.id || 'N/A'}) — Performance for ${periodLabel}:
- Tasks completed: ${tasksCompleted} of ${tasksAssignedPeriod} assigned (${completionRate}% completion rate)
- Active tasks: ${e.tasks_active ?? 0} | Overdue: ${e.tasks_overdue ?? 0}
- XP (leaderboard): ${e.xp ?? 0}
- Badges: ${e.badges_earned_period ?? 0} earned this period (${e.total_badges ?? 0} total)
- Activities: ${e.activity_count ?? 0} actions
- Knowledge contributions: ${e.docs_authored ?? 0} documents authored`;

    if (teamAvg) {
      const avgTasks = parseFloat(String(teamAvg.avg_tasks_completed || 0));
      const vsAvgTasks = tasksCompleted - avgTasks;
      const direction = vsAvgTasks >= 0 ? 'above' : 'below';
      section += `\n- vs. team average: ${Math.abs(vsAvgTasks).toFixed(1)} tasks ${direction} average (team avg: ${avgTasks})`;
    }

    return section;
  });

  let result = employeeSections.join('\n\n');

  if (teamAvg) {
    result += `\n\n**Team Averages (${periodLabel}):**
- Avg tasks completed: ${teamAvg.avg_tasks_completed}
- Avg activities: ${teamAvg.avg_activity_count}
- Avg XP: ${teamAvg.avg_xp}`;
  }

  return result;
}

const employeePerformanceTool: Tool = {
  name: 'people:get_employee_performance',
  category: 'people',

  metadata: {
    namespace: 'people',
    name: 'get_employee_performance',
    summary: 'Employee performance: tasks, XP, badges, activity, knowledge contributions.',
    tags: ['people', 'performance', 'metrics', 'productivity'],
    alwaysLoaded: true,
    parameterHints: 'employee_identifier: string, time_period?: today|this_week|this_month|this_quarter|this_year|all_time, include_team_comparison?: yes|no',
  },

  description: `Get performance metrics for a specific employee or the whole team.
Returns: task completion stats (completed, active, total), XP/leaderboard rank,
badges earned, recent activity count, knowledge base contributions, and optionally
a comparison against team averages.

Use this tool when someone asks:
- "How is [Name] doing?" or "What's [Name]'s performance?"
- "Show me my stats" or "How am I performing?"
- "Who are the top performers?" or "Team performance this month"
- "Compare John and Sarah's output"
- Any question about employee productivity, output, work, or performance metrics
- "What has [Name] accomplished?"`,

  parameters: {
    type: 'object',
    properties: {
      employee_identifier: {
        type: 'string',
        description: 'Name, partial name, or username of the employee. Use "me" or "myself" for the requesting user. Use "all", "team", or "everyone" for all team members.',
      },
      time_period: {
        type: 'string',
        description: 'Time period to analyze. Defaults to "this_month" if not specified.',
        enum: ['today', 'this_week', 'this_month', 'this_quarter', 'this_year', 'all_time'],
      },
      include_team_comparison: {
        type: 'string',
        description: 'Whether to include team average for comparison. Defaults to "yes".',
        enum: ['yes', 'no'],
      },
    },
    required: ['employee_identifier'],
  },

  requiredRoles: undefined,

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const employeeIdentifier = (args.employee_identifier as string) || '';
    const timePeriod = (args.time_period as string) || 'this_month';
    const includeTeamComparison = (args.include_team_comparison as string) || 'yes';

    const identifier = employeeIdentifier.toLowerCase().trim();

    let targetAuthUserIds: string[] = [];
    let isOwnData = false;
    let orgId: string | null = null;

    orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    if (['me', 'myself', 'my'].includes(identifier)) {
      targetAuthUserIds = [context.userId];
      isOwnData = true;
    } else if (['all', 'team', 'everyone', 'all employees'].includes(identifier)) {
      if (context.userRole === 'admin' || context.userRole === 'manager') {
        const allRes = await query<{ auth_user_id: string }>(
          `SELECT auth_user_id FROM reimbursement_users WHERE organization_id = $1 AND auth_user_id IS NOT NULL AND auth_user_id != ''`,
          [orgId]
        );
        targetAuthUserIds = allRes.rows.map((r) => r.auth_user_id).filter(Boolean);
      } else if (context.teamId) {
        const teamRes = await query<{ employee_id: string }>(
          `SELECT employee_id FROM performance_team_members WHERE team_id = $1 AND is_active = TRUE`,
          [context.teamId]
        );
        targetAuthUserIds = teamRes.rows.map((r) => r.employee_id);
      } else {
        const myTeamRes = await query<{ team_id: string }>(
          `SELECT team_id FROM performance_team_members WHERE employee_id = $1 AND is_active = TRUE LIMIT 1`,
          [context.userId]
        );
        const myTeamId = myTeamRes.rows[0]?.team_id;
        if (myTeamId) {
          const teamRes = await query<{ employee_id: string }>(
            `SELECT employee_id FROM performance_team_members WHERE team_id = $1 AND is_active = TRUE`,
            [myTeamId]
          );
          targetAuthUserIds = teamRes.rows.map((r) => r.employee_id);
        }
      }
      if (targetAuthUserIds.length === 0) {
        return { success: false, data: null, summary: 'Could not determine your team. Try searching by name.' };
      }
    } else {
      const nameRes = await query<{ auth_user_id: string }>(
        `SELECT auth_user_id FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
           AND auth_user_id IS NOT NULL AND auth_user_id != ''
         LIMIT 5`,
        [orgId, `%${identifier}%`]
      );
      targetAuthUserIds = nameRes.rows.map((r) => r.auth_user_id);
    }

    if (!isOwnData && !['admin', 'manager', 'cpo', 'hr'].includes(context.userRole)) {
      return {
        success: false,
        data: null,
        summary: "You can only view your own performance data. Try asking: 'Show me my performance'",
      };
    }

    if (targetAuthUserIds.length === 0) {
      return {
        success: false,
        data: null,
        summary: `No employee found matching "${employeeIdentifier}". Try using their full name or email.`,
      };
    }

    const dateFilter = buildDateFilter(timePeriod);

    const perfQuery = `
      SELECT
        ru.auth_user_id,
        ru.id::text AS id,
        ru.full_name,
        ru.email,
        ru.role,
        COALESCE(ru.xp, 0)::int AS xp,

        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.assignees @> jsonb_build_array(ru.auth_user_id)
            AND t.status = 'completed'
            AND t.completed_at >= $2
        ), 0) AS tasks_completed,

        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.assignees @> jsonb_build_array(ru.auth_user_id)
            AND t.status IN ('in_progress', 'todo')
        ), 0) AS tasks_active,

        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.assignees @> jsonb_build_array(ru.auth_user_id)
            AND t.created_at >= $2
        ), 0) AS tasks_assigned_period,

        COALESCE((
          SELECT COUNT(*)::int FROM tasks t
          WHERE t.assignees @> jsonb_build_array(ru.auth_user_id)
            AND t.status NOT IN ('completed', 'done', 'cancelled')
            AND t.due_date < NOW()
        ), 0) AS tasks_overdue,

        COALESCE((SELECT COUNT(*)::int FROM user_badges ub WHERE ub.user_id = ru.auth_user_id), 0) AS total_badges,
        COALESCE((SELECT COUNT(*)::int FROM user_badges ub WHERE ub.user_id = ru.auth_user_id AND ub.earned_at >= $2), 0) AS badges_earned_period,
        COALESCE((SELECT COUNT(*)::int FROM activities a WHERE a.user_id = ru.auth_user_id AND a.created_at >= $2), 0) AS activity_count,
        COALESCE((SELECT COUNT(*)::int FROM knowledge_documents kd WHERE kd.author_id = ru.auth_user_id AND kd.created_at >= $2), 0) AS docs_authored

      FROM reimbursement_users ru
      WHERE ru.organization_id = $3
        AND ru.auth_user_id = ANY($1)
      ORDER BY ru.full_name
    `;

    const perfParams = [targetAuthUserIds, dateFilter, orgId];
    const perfResult = await query(perfQuery, perfParams);

    if (perfResult.rows.length === 0) {
      return {
        success: false,
        data: null,
        summary: 'Found user IDs but no performance data returned. The user(s) may be inactive.',
      };
    }

    let teamAverage: Record<string, unknown> | null = null;
    if (includeTeamComparison === 'yes') {
      try {
        const avgResult = await query(
          `SELECT
            ROUND(AVG(sub.tasks_completed), 1) AS avg_tasks_completed,
            ROUND(AVG(sub.activity_count), 1) AS avg_activity_count,
            ROUND(AVG(sub.xp), 0) AS avg_xp
          FROM (
            SELECT
              COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.status = 'completed' AND t.completed_at >= $1), 0) AS tasks_completed,
              COALESCE((SELECT COUNT(*) FROM activities a WHERE a.user_id = ru.auth_user_id AND a.created_at >= $1), 0) AS activity_count,
              COALESCE(ru.xp, 0) AS xp
            FROM reimbursement_users ru
            WHERE ru.organization_id = $2 AND ru.auth_user_id IS NOT NULL
          ) sub`,
          [dateFilter, orgId]
        );
        teamAverage = (avgResult.rows[0] as Record<string, unknown>) || null;
      } catch (avgError) {
        console.warn('[Employee Performance] Team average query failed:', avgError);
      }
    }

    const employees = limitRecords(perfResult.rows as Record<string, unknown>[], 20);
    const summary = formatPerformanceSummary(employees, teamAverage, timePeriod);

    return {
      success: true,
      data: { employees, teamAverage, period: timePeriod },
      summary,
      metadata: {
        source: 'reimbursement_users, tasks, user_badges, activities, knowledge_documents',
        count: employees.length,
        timeRange: timePeriod,
      },
    };
  },
};

registerTool(employeePerformanceTool);

export default employeePerformanceTool;
