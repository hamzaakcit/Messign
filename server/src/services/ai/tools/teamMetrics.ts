/**
 * Tool: get_team_overview
 *
 * Aggregated metrics for a team: member count, total tasks, completion rates.
 * Adapted for Messign: performance_teams, performance_team_members, tasks.assignees.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

function buildTeamDateFilter(period: string): Date {
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

const teamOverviewTool: Tool = {
  name: 'people:get_team_overview',
  category: 'people',

  metadata: {
    namespace: 'people',
    name: 'get_team_overview',
    summary: 'Team metrics: member count, tasks, completion rate, top performers, XP.',
    tags: ['people', 'team', 'department', 'performance', 'metrics'],
    alwaysLoaded: false,
    parameterHints: 'team_identifier: string, time_period?: this_week|this_month|this_quarter|this_year',
  },

  description: `Get aggregated metrics for a specific team or department.
Returns: member count, total tasks (by status), completion rate, top performers,
average XP, recent activity summary, and knowledge contributions.

Use this tool when someone asks:
- "How is my team doing?" or "Team overview"
- "Show me [team name] metrics"
- "Which team is performing best?"
- "How many people are on [team]?"
- "Team productivity" or "department report"
- Any question about team-level or department-level aggregated performance`,

  parameters: {
    type: 'object',
    properties: {
      team_identifier: {
        type: 'string',
        description: 'Team name, team ID, or "my" for the requesting user\'s team. Use "all" for all teams comparison.',
      },
      time_period: {
        type: 'string',
        description: 'Time period for metrics. Defaults to "this_month".',
        enum: ['this_week', 'this_month', 'this_quarter', 'this_year'],
      },
    },
    required: ['team_identifier'],
  },

  requiredRoles: ['admin', 'manager', 'cpo', 'hr'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const teamIdentifier = (args.team_identifier as string) || '';
    const timePeriod = (args.time_period as string) || 'this_month';
    const identifier = teamIdentifier.toLowerCase().trim();

    const dateFilter = buildTeamDateFilter(timePeriod);

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    let teamsResult: { rows: Record<string, unknown>[] };
    if (['my', 'my team', 'mine'].includes(identifier)) {
      if (!context.teamId) {
        return { success: false, data: null, summary: 'Your team could not be determined. Please specify a team name.' };
      }
      teamsResult = await query(
        `SELECT id, team_name as name, team_code, team_type FROM performance_teams WHERE id = $1 AND is_active = TRUE`,
        [context.teamId]
      );
    } else if (['all', 'every', 'all teams', 'compare'].includes(identifier)) {
      teamsResult = await query(
        `SELECT id, team_name as name, team_code, team_type FROM performance_teams WHERE is_active = TRUE ORDER BY team_name LIMIT 20`
      );
    } else {
      teamsResult = await query(
        `SELECT id, team_name as name, team_code, team_type FROM performance_teams WHERE LOWER(team_name) LIKE LOWER($1) AND is_active = TRUE LIMIT 5`,
        [`%${identifier}%`]
      );
    }

    if (teamsResult.rows.length === 0) {
      return { success: false, data: null, summary: `No team found matching "${teamIdentifier}".` };
    }

    const teamMetrics: Record<string, unknown>[] = [];

    for (const team of teamsResult.rows as { id: string; name: string; team_code?: string; team_type?: string }[]) {
      const membersResult = await query(
        `SELECT ptm.employee_id, ru.full_name, ru.role
         FROM performance_team_members ptm
         LEFT JOIN reimbursement_users ru ON ru.auth_user_id = ptm.employee_id AND ru.organization_id = $1
         WHERE ptm.team_id = $2 AND ptm.is_active = TRUE`,
        [orgId, team.id]
      );

      const memberIds = (membersResult.rows as { employee_id: string }[]).map((m) => m.employee_id).filter(Boolean);

      if (memberIds.length === 0) {
        teamMetrics.push({
          id: team.id,
          name: team.name,
          memberCount: 0,
          members: [],
          taskStats: null,
          completionRate: 0,
          topPerformer: null,
          activityCount: 0,
        });
        continue;
      }

      const taskStatsResult = await query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE t.status IN ('completed', 'done'))::int as completed,
          COUNT(*) FILTER (WHERE t.status IN ('in_progress', 'in-progress'))::int as in_progress,
          COUNT(*) FILTER (WHERE t.status IN ('todo', 'open'))::int as todo,
          COUNT(*) FILTER (WHERE t.status = 'blocked')::int as blocked,
          COUNT(*) FILTER (WHERE t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled'))::int as overdue
        FROM tasks t
        WHERE EXISTS (
          SELECT 1 FROM unnest($1::text[]) AS uid WHERE t.assignees @> jsonb_build_array(uid)
        )
        AND t.created_at >= $2`,
        [memberIds, dateFilter]
      );

      const stats = taskStatsResult.rows[0] as Record<string, unknown>;
      const total = (stats?.total as number) || 0;
      const completed = (stats?.completed as number) || 0;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const topPerformerResult = await query(
        `WITH expanded AS (
          SELECT t.id, jsonb_array_elements_text(t.assignees) AS user_id
          FROM tasks t
          WHERE t.status IN ('completed', 'done') AND t.completed_at >= $2
            AND jsonb_array_length(t.assignees) > 0
        )
        SELECT e.user_id as full_name, COUNT(*)::int as completed
        FROM expanded e
        WHERE e.user_id = ANY($1)
        GROUP BY e.user_id
        ORDER BY completed DESC
        LIMIT 1`,
        [memberIds, dateFilter]
      );

      let topPerformer = topPerformerResult.rows[0] as Record<string, unknown> | null;
      if (topPerformer && topPerformer.full_name) {
        const nameRes = await query<{ full_name: string }>(
          `SELECT full_name FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
          [topPerformer.full_name]
        );
        topPerformer = { ...topPerformer, full_name: nameRes.rows[0]?.full_name || topPerformer.full_name };
      }

      const activityResult = await query(
        `SELECT COUNT(*)::int as total FROM activities WHERE user_id = ANY($1) AND created_at >= $2`,
        [memberIds, dateFilter]
      );

      let salesMetrics: { revenue: number; smsAttempts: number; emailAttempts?: number } | null = null;
      const isSalesTeam = (team.team_type === 'sales' || ['enterprise-sales', 'wholesale-sms', 'marketing', 'business-development'].includes(team.team_code || ''));
      if (isSalesTeam) {
        const salesResult = await query<{ revenue: string; sms_attempts: string; email_attempts: string | null }>(
          `SELECT
            COALESCE(SUM(revenue), 0)::text AS revenue,
            COALESCE(SUM(sms_attempts), 0)::text AS sms_attempts,
            COALESCE(SUM(email_attempts), 0)::text AS email_attempts
           FROM performance_metrics
           WHERE entity_type = 'team' AND entity_id = $1 AND metric_date >= $2`,
          [team.id, dateFilter]
        );
        const sm = salesResult.rows[0];
        if (sm) {
          const rev = parseFloat(sm.revenue ?? '0');
          const sms = parseFloat(sm.sms_attempts ?? '0');
          const email = sm.email_attempts ? parseFloat(sm.email_attempts) : 0;
          if (rev > 0 || sms > 0 || email > 0) {
            salesMetrics = { revenue: rev, smsAttempts: sms, emailAttempts: email };
          }
        }
        if (!salesMetrics) {
          const memberSalesResult = await query<{ revenue: string; sms_attempts: string; email_attempts: string | null }>(
            `SELECT COALESCE(SUM(pm.revenue), 0)::text AS revenue, COALESCE(SUM(pm.sms_attempts), 0)::text AS sms_attempts, COALESCE(SUM(pm.email_attempts), 0)::text AS email_attempts
             FROM performance_metrics pm
             WHERE pm.entity_type = 'member' AND pm.entity_id = ANY($1) AND pm.metric_date >= $2`,
            [memberIds, dateFilter]
          );
          const ms = memberSalesResult.rows[0];
          if (ms) {
            const rev = parseFloat(ms.revenue ?? '0');
            const sms = parseFloat(ms.sms_attempts ?? '0');
            const email = ms.email_attempts ? parseFloat(ms.email_attempts) : 0;
            salesMetrics = { revenue: rev, smsAttempts: sms, emailAttempts: email };
          }
        }
      }

      teamMetrics.push({
        id: team.id,
        name: team.name,
        memberCount: membersResult.rows.length,
        members: membersResult.rows.map((m: Record<string, unknown>) => ({ name: m.full_name, role: m.role })),
        taskStats: stats,
        completionRate,
        topPerformer,
        activityCount: activityResult.rows[0]?.total || 0,
        salesMetrics: salesMetrics ?? undefined,
      });
    }

    const periodLabel = timePeriod.replace('_', ' ');
    const formatRevenue = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
    const formatCompact = (v: number) => (v >= 1e6 ? `${Math.round(v / 1e6)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));

    const summary = teamMetrics
      .map((tm) => {
        if ((tm.memberCount as number) === 0) return `**${tm.name}**: No active members.`;
        const ts = tm.taskStats as Record<string, unknown>;
        let section = `**${tm.name}** (${tm.memberCount} members) — ${periodLabel}:
- Tasks: ${ts?.completed || 0}/${ts?.total || 0} completed (${tm.completionRate}% completion rate)
- In progress: ${ts?.in_progress || 0} | Todo: ${ts?.todo || 0} | Blocked: ${ts?.blocked || 0} | Overdue: ${ts?.overdue || 0}
- Total activities: ${tm.activityCount}`;
        const sales = tm.salesMetrics as { revenue: number; smsAttempts: number; emailAttempts?: number } | undefined;
        if (sales && (sales.revenue > 0 || sales.smsAttempts > 0)) {
          section += `\n- Sales: Revenue ${formatRevenue(sales.revenue)} | SMS ${formatCompact(sales.smsAttempts)}`;
          if (sales.emailAttempts && sales.emailAttempts > 0) {
            section += ` | Email ${formatCompact(sales.emailAttempts)}`;
          }
        }
        if (tm.topPerformer) {
          const tp = tm.topPerformer as Record<string, unknown>;
          section += `\n- Top performer: ${tp.full_name || tp.completed} (${tp.completed} tasks completed)`;
        }
        const mems = tm.members as { name: string }[];
        section += `\n- Members: ${mems.map((m) => m.name).join(', ')}`;
        return section;
      })
      .join('\n\n');

    return {
      success: true,
      data: teamMetrics,
      summary,
      metadata: { source: 'performance_teams, performance_team_members, tasks, activities', count: teamMetrics.length, timeRange: timePeriod },
    };
  },
};

registerTool(teamOverviewTool);
export default teamOverviewTool;
