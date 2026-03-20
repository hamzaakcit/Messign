/**
 * Tool: get_system_stats
 *
 * System-wide aggregated statistics. Adapted for Messign: reimbursement_users.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const systemStatsTool: Tool = {
  name: 'analytics:get_system_stats',
  category: 'analytics',

  metadata: {
    namespace: 'analytics',
    name: 'get_system_stats',
    summary: 'System-wide stats: users, documents, projects, tasks, activity, health.',
    tags: ['analytics', 'dashboard', 'overview', 'stats'],
    alwaysLoaded: true,
    parameterHints: 'detail_level?: summary|detailed',
  },

  description: `Get system-wide aggregated statistics — total users, documents, projects, tasks, activity counts, and general health metrics.

Use this tool when someone asks:
- "System overview" or "Platform stats"
- "How big is our knowledge base?"
- "How many users/projects/tasks do we have?"
- "Company dashboard" or "Overall metrics"
- "Give me a summary of everything"
- Any general question about the overall state of the company's data`,

  parameters: {
    type: 'object',
    properties: {
      detail_level: {
        type: 'string',
        description: '"summary" for high-level KPIs, "detailed" for breakdowns.',
        enum: ['summary', 'detailed'],
      },
    },
    required: [],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const detailLevel = (args.detail_level as string) || 'summary';

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const [users, tasks, projects, docs, activities] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL AND auth_user_id != '')::int as active
        FROM reimbursement_users
        WHERE organization_id = $1`,
        [orgId]
      ),
      query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('completed', 'done'))::int as completed,
          COUNT(*) FILTER (WHERE status IN ('in_progress', 'in-progress'))::int as in_progress,
          COUNT(*) FILTER (WHERE status IN ('todo', 'open'))::int as open,
          COUNT(*) FILTER (WHERE status = 'blocked')::int as blocked,
          COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'done', 'cancelled'))::int as overdue
        FROM tasks`
      ),
      query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status != 'archived')::int as active
        FROM projects`
      ),
      query(
        `SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'published')::int as published,
          COUNT(*) FILTER (WHERE status = 'draft')::int as drafts,
          COUNT(*) FILTER (WHERE status = 'in_review')::int as in_review
        FROM knowledge_documents`
      ),
      query(
        `SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::int as today
        FROM activities`
      ),
    ]);

    const u = (users.rows[0] as Record<string, unknown>) || {};
    const t = (tasks.rows[0] as Record<string, unknown>) || {};
    const p = (projects.rows[0] as Record<string, unknown>) || {};
    const d = (docs.rows[0] as Record<string, unknown>) || {};
    const a = (activities.rows[0] as Record<string, unknown>) || {};

    const totalTasks = (t.total as number) || 0;
    const completedTasks = (t.completed as number) || 0;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    let summary = `**Messign Workspace — System Overview:**

**People:** ${u.active ?? 0} active users (${u.total ?? 0} total)
**Projects:** ${p.active ?? 0} active projects (${p.total ?? 0} total)
**Tasks:** ${totalTasks} total — ${completedTasks} completed (${taskCompletionRate}% rate), ${t.in_progress ?? 0} in progress, ${t.open ?? 0} open, ${t.blocked ?? 0} blocked, ${t.overdue ?? 0} overdue
**Knowledge Base:** ${d.total ?? 0} documents — ${d.published ?? 0} published, ${d.drafts ?? 0} drafts, ${d.in_review ?? 0} in review
**Activity:** ${a.today ?? 0} actions today, ${a.this_week ?? 0} this week (${a.total ?? 0} all time)`;

    if (detailLevel === 'detailed') {
      try {
        const topActiveResult = await query(
          `SELECT a.user_id, ru.full_name, COUNT(a.id)::int as activity_count
           FROM activities a
           LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id AND ru.organization_id = $1
           WHERE a.created_at >= NOW() - INTERVAL '7 days'
           GROUP BY a.user_id, ru.full_name
           ORDER BY activity_count DESC
           LIMIT 5`,
          [orgId]
        );
        const topActive = topActiveResult.rows as Record<string, unknown>[];
        summary += `\n\n**Most Active This Week:**\n${topActive.map((r, i) => `${i + 1}. ${r.full_name || r.user_id}: ${r.activity_count} actions`).join('\n')}`;
      } catch {
        /* skip */
      }
    }

    return {
      success: true,
      data: { users: u, tasks: t, projects: p, documents: d, activities: a },
      summary,
      metadata: { source: 'reimbursement_users, tasks, projects, knowledge_documents, activities' },
    };
  },
};

registerTool(systemStatsTool);
export default systemStatsTool;
