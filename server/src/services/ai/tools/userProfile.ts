/**
 * Tool: get_user_profile
 *
 * User information: name, role, team, join date, contact info.
 * Adapted for Messign: reimbursement_users, performance_teams.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const userProfileTool: Tool = {
  name: 'system:get_user_profile',
  metadata: {
    namespace: 'system',
    name: 'get_user_profile',
    summary: 'User profile: name, role, team, XP, level, recent activity.',
    tags: ['system', 'user', 'profile'],
    alwaysLoaded: false,
    parameterHints: 'user_identifier: string',
  },
  category: 'people',

  description: `Get profile information for a user — name, role, team, join date, email, and basic stats.

Use this tool when someone asks:
- "Who is [Name]?" or "Tell me about [Name]"
- "What team is [Name] on?" or "What's [Name]'s role?"
- "When did [Name] join?"
- "My profile" or "User info"
- "How many employees do we have?"
- Any question about a specific person's identity, role, or basic info`,

  parameters: {
    type: 'object',
    properties: {
      user_identifier: {
        type: 'string',
        description: 'Name, username, email, or "me". Use "count" for total employee count.',
      },
    },
    required: ['user_identifier'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const identifier = ((args.user_identifier as string) || '').toLowerCase().trim();

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    if (['count', 'total', 'how many'].includes(identifier)) {
      const countResult = await query<{ total: number; active: number }>(
        `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL AND auth_user_id != '')::int as active
         FROM reimbursement_users WHERE organization_id = $1`,
        [orgId]
      );
      const { total, active } = countResult.rows[0];
      return {
        success: true,
        data: { total, active },
        summary: `**Employee Count:** ${active} active employees out of ${total} total.`,
        metadata: { source: 'reimbursement_users', count: 1 },
      };
    }

    let targetAuthUserId: string;
    if (['me', 'my', 'myself'].includes(identifier)) {
      targetAuthUserId = context.userId;
    } else {
      const search = await query<{ auth_user_id: string }>(
        `SELECT auth_user_id FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
           AND auth_user_id IS NOT NULL AND auth_user_id != ''
         LIMIT 1`,
        [orgId, `%${identifier}%`]
      );
      if (search.rows.length === 0) {
        return { success: false, data: null, summary: `No user found matching "${args.user_identifier}".` };
      }
      targetAuthUserId = search.rows[0].auth_user_id;
    }

    const profileResult = await query(
      `SELECT ru.id, ru.auth_user_id, ru.full_name, ru.email, ru.role, ru.xp, ru.created_at as join_date,
              team_info.team_name
       FROM reimbursement_users ru
       LEFT JOIN (
         SELECT ptm.employee_id, pteams.team_name
         FROM performance_team_members ptm
         JOIN performance_teams pteams ON pteams.id = ptm.team_id
         WHERE ptm.is_active = TRUE
       ) team_info ON team_info.employee_id = ru.auth_user_id
       WHERE ru.auth_user_id = $1 AND ru.organization_id = $2
       LIMIT 1`,
      [targetAuthUserId, orgId]
    );

    if (profileResult.rows.length === 0) {
      return { success: false, data: null, summary: 'User not found.' };
    }

    const user = profileResult.rows[0] as Record<string, unknown> & { team_name?: string };

    const statsResult = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM tasks WHERE assignees @> jsonb_build_array($1::text)) as total_tasks,
        (SELECT COUNT(*)::int FROM tasks WHERE assignees @> jsonb_build_array($1::text) AND status IN ('completed', 'done')) as completed_tasks,
        (SELECT COUNT(*)::int FROM knowledge_documents WHERE author_id = $1::text) as docs_authored
      `,
      [targetAuthUserId]
    );

    const stats = (statsResult.rows[0] as Record<string, unknown>) || {};
    const points = (user.xp as number) ?? 0;

    const summary = `**${user.full_name}**
- Role: ${user.role || 'N/A'}
- Team: ${user.team_name || 'N/A'}
- Email: ${user.email || 'N/A'}
- Joined: ${user.join_date ? new Date(user.join_date as string).toLocaleDateString() : 'N/A'}
- Stats: ${stats.completed_tasks || 0}/${stats.total_tasks || 0} tasks completed, ${stats.docs_authored || 0} documents, ${points} XP`;

    return {
      success: true,
      data: { profile: user, stats: { ...stats, points } },
      summary,
      metadata: { source: 'reimbursement_users, performance_teams, tasks, knowledge_documents', count: 1 },
    };
  },
};

registerTool(userProfileTool);
export default userProfileTool;
