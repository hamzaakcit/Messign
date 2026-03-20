/**
 * Tool: get_tasks_by_user
 *
 * Returns tasks assigned to a specific user (assignees JSONB).
 * Adapted for Messign: reimbursement_users, tasks.assignees.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { limitRecords } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const tasksByUserTool: Tool = {
  name: 'projects:get_tasks_by_user',
  category: 'projects',

  metadata: {
    namespace: 'projects',
    name: 'get_tasks_by_user',
    summary: 'Tasks assigned to a user. Status, priority, due date, project, overdue flag.',
    tags: ['projects', 'tasks', 'assignments', 'workload'],
    alwaysLoaded: true,
    parameterHints: 'user_identifier: string, status_filter?: all|active|completed|overdue|blocked|in_progress|todo, time_scope?: all|today|this_week|upcoming|overdue',
  },

  description: `Get all tasks assigned to or created by a specific user.
Returns: task title, status, priority, due date, project name, and whether overdue.

Use this tool when someone asks:
- "What are my tasks?" or "What am I working on?"
- "What tasks does [Name] have?"
- "Show me my open/pending/overdue tasks"
- "What's on my plate?" or "What should I work on next?"
- "What tasks are due this week?"
- Questions about someone's workload, assignments, or to-do items`,

  parameters: {
    type: 'object',
    properties: {
      user_identifier: {
        type: 'string',
        description: 'Name, username, or "me" for the requesting user.',
      },
      status_filter: {
        type: 'string',
        description: 'Filter by task status. Use "all" for everything, "active" for non-completed tasks.',
        enum: ['all', 'active', 'completed', 'overdue', 'blocked', 'in_progress', 'todo'],
      },
      time_scope: {
        type: 'string',
        description: 'Time scope for filtering. "upcoming" shows tasks due in next 7 days.',
        enum: ['all', 'today', 'this_week', 'upcoming', 'overdue'],
      },
    },
    required: ['user_identifier'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const userIdentifier = (args.user_identifier as string) || '';
    const statusFilter = (args.status_filter as string) || 'active';
    const timeScope = (args.time_scope as string) || 'all';

    if (!context.userId || typeof context.userId !== 'string') {
      return {
        success: false,
        data: null,
        summary: 'User session is required to view tasks. Please log in and try again.',
      };
    }

    const identifier = userIdentifier.toLowerCase().trim();
    let targetAuthUserId: string;
    let targetUserName: string;

    if (['me', 'myself', 'my'].includes(identifier)) {
      targetAuthUserId = context.userId;
      targetUserName = context.userName || 'You';
    } else {
      const orgId = await resolveOrgIdForTool(context);
      if (!orgId) {
        return { success: false, data: null, summary: 'Organization not configured.' };
      }
      const userSearch = await query<{ auth_user_id: string; full_name: string }>(
        `SELECT auth_user_id, full_name FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
           AND auth_user_id IS NOT NULL AND auth_user_id != ''
         LIMIT 1`,
        [orgId, `%${identifier}%`]
      );
      if (userSearch.rows.length === 0) {
        return { success: false, data: null, summary: `No user found matching "${userIdentifier}".` };
      }
      targetAuthUserId = userSearch.rows[0].auth_user_id;
      targetUserName = userSearch.rows[0].full_name;
    }

    const isOwnData = targetAuthUserId === context.userId;
    if (!isOwnData && !['admin', 'manager', 'cpo'].includes(context.userRole)) {
      return {
        success: false,
        data: null,
        summary: `You can only view your own tasks. Try asking: "What are my tasks?"`,
      };
    }

    let statusCondition = '';
    switch (statusFilter) {
      case 'active':
        statusCondition = `AND t.status NOT IN ('completed', 'done', 'cancelled', 'closed')`;
        break;
      case 'completed':
        statusCondition = `AND t.status IN ('completed', 'done')`;
        break;
      case 'overdue':
        statusCondition = `AND t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled')`;
        break;
      case 'blocked':
        statusCondition = `AND t.status = 'blocked'`;
        break;
      case 'in_progress':
        statusCondition = `AND t.status IN ('in_progress', 'in-progress')`;
        break;
      case 'todo':
        statusCondition = `AND t.status IN ('todo', 'open')`;
        break;
      case 'all':
      default:
        statusCondition = '';
    }

    let timeCondition = '';
    switch (timeScope) {
      case 'today':
        timeCondition = `AND t.due_date::date = CURRENT_DATE`;
        break;
      case 'this_week':
        timeCondition = `AND t.due_date >= date_trunc('week', NOW()) AND t.due_date < date_trunc('week', NOW()) + INTERVAL '7 days'`;
        break;
      case 'upcoming':
        timeCondition = `AND t.due_date >= NOW() AND t.due_date <= NOW() + INTERVAL '7 days'`;
        break;
      case 'overdue':
        timeCondition = `AND t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled')`;
        break;
      default:
        timeCondition = '';
    }

    let tasksResult: { rows: Record<string, unknown>[] };
    try {
      tasksResult = await query(
        `SELECT
          t.id,
          t.title,
          t.status,
          t.priority,
          t.due_date,
          t.created_at,
          p.name as project_name,
          CASE WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled') THEN true ELSE false END as is_overdue
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.assignees @> jsonb_build_array($1::text)
          ${statusCondition}
          ${timeCondition}
        ORDER BY
          CASE WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'done', 'cancelled') THEN 0 ELSE 1 END,
          CASE t.priority WHEN 'critical' THEN 0 WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          t.due_date NULLS LAST
        LIMIT 50`,
        [targetAuthUserId]
      );
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('[get_tasks_by_user] Query failed:', msg);
      if (msg.includes('does not exist') || msg.includes('relation')) {
        return {
          success: false,
          data: null,
          summary: 'The tasks feature is not fully set up yet. Please contact your administrator.',
        };
      }
      throw dbErr;
    }

    const tasks = limitRecords(tasksResult.rows as Record<string, unknown>[], 50);

    if (tasks.length === 0) {
      return {
        success: true,
        data: [],
        summary: `${targetUserName} has no tasks matching the filter (status: ${statusFilter}, scope: ${timeScope}).`,
        metadata: { source: 'tasks, projects', count: 0 },
      };
    }

    const overdue = tasks.filter((t: Record<string, unknown>) => t.is_overdue).length;
    const highPriority = tasks.filter((t: Record<string, unknown>) =>
      ['critical', 'urgent', 'high'].includes((t.priority as string) || '')
    ).length;

    const summary = `**${targetUserName}'s Tasks** (filter: ${statusFilter}, scope: ${timeScope}):
- Total: ${tasks.length} tasks
- Overdue: ${overdue} | High priority: ${highPriority}

${tasks.slice(0, 25).map((t: Record<string, unknown>, i: number) => {
  const due = t.due_date ? new Date(t.due_date as string).toLocaleDateString() : 'no due date';
  const overdueFlag = t.is_overdue ? ' OVERDUE' : '';
  const idPart = t.id ? ` (id: ${t.id})` : '';
  return `${i + 1}.${idPart} [${t.status}] [${(t.priority as string) || 'normal'}] ${t.title} — ${(t.project_name as string) || 'no project'} (due: ${due})${overdueFlag}`;
}).join('\n')}${tasks.length > 25 ? `\n... and ${tasks.length - 25} more tasks` : ''}`;

    return {
      success: true,
      data: { tasks, stats: { total: tasks.length, overdue, highPriority } },
      summary,
      metadata: { source: 'tasks, projects', count: tasks.length },
    };
  },
};

registerTool(tasksByUserTool);
export default tasksByUserTool;
