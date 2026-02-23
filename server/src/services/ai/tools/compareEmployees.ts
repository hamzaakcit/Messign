/**
 * Tool: compare_employees
 *
 * Side-by-side comparison of 2+ employees across all metrics.
 * Adapted for Messign: reimbursement_users, tasks.assignees JSONB.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

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

const compareEmployeesTool: Tool = {
  name: 'compare_employees',
  category: 'people',

  description: `Compare two or more employees side-by-side on all performance metrics.

Use this tool when someone asks:
- "Compare John and Sarah"
- "Who is performing better, [A] or [B]?"
- "Side-by-side comparison of [A] vs [B]"
- "How does [A] stack up against [B]?"
- Any request to compare multiple specific employees`,

  parameters: {
    type: 'object',
    properties: {
      employee_names: {
        type: 'string',
        description: 'Comma-separated names of employees to compare. E.g., "John, Sarah, Mike"',
      },
      time_period: {
        type: 'string',
        description: 'Time period for comparison.',
        enum: ['this_week', 'this_month', 'this_quarter', 'this_year'],
      },
    },
    required: ['employee_names'],
  },

  requiredRoles: ['admin', 'manager', 'cpo', 'hr'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const employeeNames = (args.employee_names as string) || '';
    const timePeriod = (args.time_period as string) || 'this_month';
    const names = employeeNames.split(',').map((n) => n.trim()).filter(Boolean);

    if (names.length < 2) {
      return { success: false, data: null, summary: 'Please provide at least 2 employee names separated by commas.' };
    }

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const dateFilter = buildComparisonDateFilter(timePeriod);
    const users: { auth_user_id: string; full_name: string }[] = [];

    for (const name of names) {
      const result = await query<{ auth_user_id: string; full_name: string }>(
        `SELECT auth_user_id, full_name FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
           AND auth_user_id IS NOT NULL AND auth_user_id != ''
         LIMIT 1`,
        [orgId, `%${name}%`]
      );
      if (result.rows.length > 0) {
        users.push(result.rows[0]);
      }
    }

    if (users.length < 2) {
      return {
        success: false,
        data: null,
        summary: `Could only find ${users.length} of ${names.length} employees. Check the names and try again.`,
      };
    }

    const userIds = users.map((u) => u.auth_user_id);

    const metricsResult = await query(
      `SELECT
        ru.auth_user_id, ru.full_name,
        COALESCE(ru.xp, 0)::int as points,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.status IN ('completed', 'done') AND t.completed_at >= $2), 0) as tasks_completed,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.status NOT IN ('completed', 'done', 'cancelled')), 0) as tasks_active,
        COALESCE((SELECT COUNT(*)::int FROM tasks t WHERE t.assignees @> jsonb_build_array(ru.auth_user_id) AND t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled')), 0) as tasks_overdue,
        COALESCE((SELECT COUNT(*)::int FROM activities a WHERE a.user_id = ru.auth_user_id AND a.created_at >= $2), 0) as activities,
        COALESCE((SELECT COUNT(*)::int FROM user_badges ub WHERE ub.user_id = ru.auth_user_id), 0) as badges,
        COALESCE((SELECT COUNT(*)::int FROM knowledge_documents kd WHERE kd.author_id = ru.auth_user_id AND kd.created_at >= $2), 0) as docs
      FROM reimbursement_users ru
      WHERE ru.organization_id = $3 AND ru.auth_user_id = ANY($1)`,
      [userIds, dateFilter, orgId]
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

registerTool(compareEmployeesTool);
export default compareEmployeesTool;
