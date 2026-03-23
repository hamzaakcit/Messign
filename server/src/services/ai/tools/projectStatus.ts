/**
 * Tool: get_project_status
 *
 * Queries project data including task breakdown, completion percentage,
 * team members (from tasks.assignees), and recent activity.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const projectStatusTool: Tool = {
  name: 'projects:get_project_status',
  metadata: {
    namespace: 'projects',
    name: 'get_project_status',
    summary: 'Project status: task breakdown, completion %, team members, recent activity.',
    tags: ['projects', 'status', 'tasks', 'progress'],
    alwaysLoaded: true,
    parameterHints: 'project_name: string, include_task_list?: yes|no, include_members?: yes|no',
  },
  category: 'projects',

  description: `Get the current status of one or more projects, including task breakdown by status,
completion percentage, assigned team members, and recent activity.

Use this tool when someone asks:
- "What's the status of [project name]?"
- "How is [project] progressing?"
- "Show me all active projects"
- "Which projects are behind schedule?"
- "How many tasks are done in [project]?"
- "Who is working on [project]?"
- Any question about project progress, tasks, deadlines, or project teams`,

  parameters: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Name or partial name of the project. Use "all" or "active" for all active projects. Use "my" for projects the user is involved in.',
      },
      include_task_list: {
        type: 'string',
        description: 'Whether to include individual task details (title, status, assignee). Use "yes" for detailed view, "no" for just summary stats. Defaults to "no".',
        enum: ['yes', 'no'],
      },
      include_members: {
        type: 'string',
        description: 'Whether to include team member list. Defaults to "yes".',
        enum: ['yes', 'no'],
      },
    },
    required: ['project_name'],
  },

  requiredRoles: undefined,

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const projectName = (args.project_name as string) || '';
    const includeTaskList = (args.include_task_list as string) || 'no';
    const includeMembers = (args.include_members as string) || 'yes';

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Unable to determine organization context.' };
    }

    const identifier = projectName.toLowerCase().trim();

    let projectsResult: { rows: Record<string, unknown>[] };

    if (['all', 'active', 'all active', 'every'].includes(identifier)) {
      projectsResult = await query(
        `SELECT * FROM projects WHERE organization_id = $1 AND status != 'archived' ORDER BY updated_at DESC LIMIT 15`,
        [orgId]
      );
    } else if (['my', 'mine', 'my projects'].includes(identifier)) {
      projectsResult = await query(
        `SELECT DISTINCT p.* FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.organization_id = $1
           AND (t.assignees @> jsonb_build_array($2) OR (p.team IS NOT NULL AND p.team @> jsonb_build_array($2)))
           AND p.status != 'archived'
         ORDER BY p.updated_at DESC
         LIMIT 15`,
        [orgId, context.userId]
      );
    } else {
      projectsResult = await query(
        `SELECT * FROM projects WHERE organization_id = $1 AND LOWER(name) LIKE LOWER($2) AND status != 'archived' ORDER BY updated_at DESC LIMIT 5`,
        [orgId, `%${identifier}%`]
      );
    }

    if (projectsResult.rows.length === 0) {
      return {
        success: false,
        data: null,
        summary: `No project found matching "${projectName}". Try "all" to see all active projects, or check the exact project name.`,
      };
    }

    const enrichedProjects: Record<string, unknown>[] = [];

    for (const project of projectsResult.rows as Record<string, unknown>[]) {
      const projectId = project.id as string;

      const taskStatsResult = await query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'completed' OR status = 'done')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
          COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
          COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'done', 'cancelled'))::int AS overdue
        FROM tasks
        WHERE project_id = $1`,
        [projectId]
      );

      const stats = (taskStatsResult.rows[0] as Record<string, unknown>) || {
        total: 0,
        completed: 0,
        in_progress: 0,
        todo: 0,
        blocked: 0,
        overdue: 0,
      };

      const total = (stats.total as number) || 0;
      const completed = (stats.completed as number) || 0;
      const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

      let tasks: Record<string, unknown>[] | null = null;
      if (includeTaskList === 'yes') {
        const taskListResult = await query(
          `SELECT t.id, t.title, t.status, t.priority, t.due_date
           FROM tasks t
           WHERE t.project_id = $1
           ORDER BY
             CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
             t.status,
             t.due_date NULLS LAST
           LIMIT 30`,
          [projectId]
        );
        tasks = taskListResult.rows as Record<string, unknown>[];
      }

      let members: Record<string, unknown>[] | null = null;
      if (includeMembers === 'yes') {
        const memberResult = await query(
          `WITH expanded AS (
            SELECT t.id, jsonb_array_elements_text(t.assignees) AS user_id
            FROM tasks t
            WHERE t.project_id = $1 AND jsonb_array_length(t.assignees) > 0
          )
          SELECT user_id, COUNT(*)::int AS task_count
          FROM expanded
          GROUP BY user_id`,
          [projectId]
        );
        members = memberResult.rows as Record<string, unknown>[];

        const userIds = members.map((m) => (m as { user_id: string }).user_id);
        if (userIds.length > 0) {
          const namesResult = await query(
            `SELECT auth_user_id, full_name FROM reimbursement_users WHERE auth_user_id = ANY($1)`,
            [userIds]
          );
          const nameMap = new Map((namesResult.rows as { auth_user_id: string; full_name: string }[]).map((r) => [r.auth_user_id, r.full_name]));
          for (const m of members) {
            (m as Record<string, unknown>).full_name = nameMap.get((m as { user_id: string }).user_id) || 'Unknown';
          }
        }
      }

      enrichedProjects.push({
        id: project.id,
        name: project.name,
        status: project.status,
        description: project.description,
        created_at: project.created_at,
        updated_at: project.updated_at,
        taskStats: stats,
        completionPercentage: completionPct,
        tasks,
        members,
      });
    }

    const summary = enrichedProjects
      .map((p) => {
        const stats = p.taskStats as Record<string, unknown>;
        let section = `**${p.name}** (${p.status || 'active'}):
- Progress: ${p.completionPercentage}% complete
- Tasks: ${stats.completed}/${stats.total} done, ${stats.in_progress} in progress, ${stats.todo} todo
- Blocked: ${stats.blocked} | Overdue: ${stats.overdue}`;

        const mems = p.members as { user_id?: string; full_name?: string; task_count?: number }[] | null;
        if (mems && mems.length > 0) {
          section += `\n- Team (${mems.length}): ${mems.map((m) => `${m.full_name || m.user_id || 'Unknown'} (${m.task_count} tasks)`).join(', ')}`;
        }

        const taskList = p.tasks as { title?: string; status?: string }[] | null;
        if (taskList && taskList.length > 0) {
          section += `\n- Task details:`;
          for (const task of taskList.slice(0, 15)) {
            section += `\n  • [${task.status}] ${task.title}`;
          }
          if (taskList.length > 15) {
            section += `\n  ... and ${taskList.length - 15} more tasks`;
          }
        }

        return section;
      })
      .join('\n\n');

    return {
      success: true,
      data: enrichedProjects,
      summary,
      metadata: {
        source: 'projects, tasks, reimbursement_users',
        count: enrichedProjects.length,
      },
    };
  },
};

registerTool(projectStatusTool);

export default projectStatusTool;
