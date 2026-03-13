/**
 * Tool: get_recent_activity
 *
 * Latest actions across the system — task updates, document changes, etc.
 * Adapted for Messign: activities (user_id VARCHAR), reimbursement_users.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

const activityFeedTool: Tool = {
  name: 'analytics:get_recent_activity',
  metadata: {
    namespace: 'analytics',
    name: 'get_recent_activity',
    summary: 'Recent activity feed: tasks, messages, docs, achievements.',
    tags: ['analytics', 'activity', 'feed'],
    alwaysLoaded: false,
    parameterHints: 'scope: system|user|team, user_identifier?: string, limit?: number',
  },
  category: 'analytics',

  description: `Get recent activity across the system — latest actions, changes, and events.

Use this tool when someone asks:
- "What happened today?" or "Recent activity"
- "What's been going on?" or "Activity feed"
- "What has [Name] been doing?"
- "Latest updates" or "Recent changes"
- "System activity log"`,

  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description: '"system" for all activity, "user" for specific user, "team" for team.',
        enum: ['system', 'user', 'team'],
      },
      user_identifier: {
        type: 'string',
        description: 'Name or "me" for user-scoped activity.',
      },
      limit: {
        type: 'number',
        description: 'Number of activities to return. Default 20.',
      },
    },
    required: ['scope'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const scope = (args.scope as string) || 'system';
    const userIdentifier = (args.user_identifier as string) || '';
    const limit = Math.min((args.limit as number) || 20, 50);

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    if (scope === 'user') {
      const identifier = userIdentifier.toLowerCase().trim();
      let targetUserId = context.userId;

      if (!['me', 'my', 'myself'].includes(identifier) && identifier) {
        if (!['admin', 'manager', 'cpo'].includes(context.userRole)) {
          return { success: false, data: null, summary: 'You can only view your own activity.' };
        }
        const search = await query<{ auth_user_id: string }>(
          `SELECT auth_user_id FROM reimbursement_users
           WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
             AND auth_user_id IS NOT NULL LIMIT 1`,
          [orgId, `%${identifier}%`]
        );
        if (search.rows.length === 0) {
          return { success: false, data: null, summary: `User not found: "${userIdentifier}".` };
        }
        targetUserId = search.rows[0].auth_user_id;
      }

      const result = await query(
        `SELECT a.id, a.user_id, a.type, a.message, a.metadata, a.xp_gained, a.created_at,
                ru.full_name as user_name
         FROM activities a
         LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id AND ru.organization_id = $2
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC
         LIMIT $3`,
        [targetUserId, orgId, limit]
      );

      const summary = `**Recent Activity (user) — ${result.rows.length} events:**\n${result.rows
        .map((a: Record<string, unknown>, i: number) => {
          const time = new Date(a.created_at as string).toLocaleString();
          return `${i + 1}. [${time}] ${a.user_name || a.user_id}: ${a.type || 'activity'} — ${a.message || 'No details'}`;
        })
        .join('\n')}`;

      return {
        success: true,
        data: result.rows,
        summary,
        metadata: { source: 'activities, reimbursement_users', count: result.rows.length },
      };
    }

    if (scope === 'team') {
      if (!context.teamId) {
        return { success: false, data: null, summary: 'Your team could not be determined.' };
      }
      const teamMembersResult = await query<{ employee_id: string }>(
        `SELECT employee_id FROM performance_team_members WHERE team_id = $1 AND is_active = TRUE`,
        [context.teamId]
      );
      const memberIds = teamMembersResult.rows.map((r) => r.employee_id);
      if (memberIds.length === 0) {
        return { success: true, data: [], summary: '**Recent Activity (team):** No team members or no activity.' };
      }

      const result = await query(
        `SELECT a.id, a.user_id, a.type, a.message, a.metadata, a.xp_gained, a.created_at,
                ru.full_name as user_name
         FROM activities a
         LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id AND ru.organization_id = $2
         WHERE a.user_id = ANY($1)
         ORDER BY a.created_at DESC
         LIMIT $3`,
        [memberIds, orgId, limit]
      );

      const summary = `**Recent Activity (team) — ${result.rows.length} events:**\n${result.rows
        .map((a: Record<string, unknown>, i: number) => {
          const time = new Date(a.created_at as string).toLocaleString();
          return `${i + 1}. [${time}] ${a.user_name || a.user_id}: ${a.type || 'activity'} — ${a.message || 'No details'}`;
        })
        .join('\n')}`;

      return {
        success: true,
        data: result.rows,
        summary,
        metadata: { source: 'activities, reimbursement_users', count: result.rows.length },
      };
    }

    if (!['admin', 'manager', 'cpo'].includes(context.userRole)) {
      return { success: false, data: null, summary: 'System-wide activity is restricted to admins and managers.' };
    }

    const result = await query(
      `SELECT a.id, a.user_id, a.type, a.message, a.metadata, a.xp_gained, a.created_at,
              ru.full_name as user_name
       FROM activities a
       LEFT JOIN reimbursement_users ru ON ru.auth_user_id = a.user_id AND ru.organization_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [orgId, limit]
    );

    const summary = `**Recent Activity (system) — ${result.rows.length} events:**\n${result.rows
      .map((a: Record<string, unknown>, i: number) => {
        const time = new Date(a.created_at as string).toLocaleString();
        return `${i + 1}. [${time}] ${a.user_name || a.user_id}: ${a.type || 'activity'} — ${a.message || 'No details'}`;
      })
      .join('\n')}`;

    return {
      success: true,
      data: result.rows,
      summary,
      metadata: { source: 'activities, reimbursement_users', count: result.rows.length },
    };
  },
};

registerTool(activityFeedTool);
export default activityFeedTool;
