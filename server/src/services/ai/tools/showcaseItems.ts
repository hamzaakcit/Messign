/**
 * Tool: get_showcase_items
 *
 * Adapted for Messign: project_showcase (project_id, impact_summary, is_featured).
 * No user_id — links via projects.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const showcaseItemsTool: Tool = {
  name: 'achievements:get_showcase_items',
  metadata: {
    namespace: 'achievements',
    name: 'get_showcase_items',
    summary: 'Showcase/portfolio items: featured work, projects.',
    tags: ['achievements', 'showcase', 'portfolio'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },
  category: 'achievements',

  description: `Get showcase or portfolio items — work highlights, demos, and featured projects.

Use this tool when someone asks:
- "Show me the showcase" or "Featured projects"
- "What has [Name] showcased?"
- "Portfolio items" or "Work highlights"
- "Best work" or "Show me demos"`,

  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: '"all" for everything, "user" for specific user, "recent" for latest.',
        enum: ['all', 'user', 'recent', 'featured'],
      },
      user_identifier: {
        type: 'string',
        description: 'Name or "me" for user-specific showcase (projects they are involved in).',
      },
    },
    required: ['filter'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filter = (args.filter as string) || 'all';
    const userIdentifier = args.user_identifier as string | undefined;

    try {
      let baseQuery: string;
      const params: unknown[] = [];

      if (filter === 'user') {
        const identifier = (userIdentifier || 'me').toLowerCase().trim();
        const targetUserId = ['me', 'my'].includes(identifier) ? context.userId : null;
        let authUserId = targetUserId;

        if (!authUserId && identifier) {
          const search = await query<{ auth_user_id: string }>(
            `SELECT auth_user_id FROM reimbursement_users WHERE LOWER(full_name) LIKE LOWER($1) LIMIT 1`,
            [`%${identifier}%`]
          );
          if (search.rows.length === 0) {
            return { success: false, data: null, summary: `User not found: "${userIdentifier}".` };
          }
          authUserId = search.rows[0].auth_user_id;
        }

        baseQuery = `
          SELECT ps.*, p.name as project_name
          FROM project_showcase ps
          JOIN projects p ON p.id = ps.project_id
          WHERE p.team @> jsonb_build_array($1)
             OR EXISTS (
               SELECT 1 FROM tasks t
               WHERE t.project_id = ps.project_id AND t.assignees @> jsonb_build_array($1)
             )
          ORDER BY ps.created_at DESC
          LIMIT 10`;
        params.push(authUserId);
      } else if (filter === 'featured') {
        baseQuery = `
          SELECT ps.*, p.name as project_name
          FROM project_showcase ps
          JOIN projects p ON p.id = ps.project_id
          WHERE ps.is_featured = true
          ORDER BY ps.created_at DESC
          LIMIT 10`;
      } else if (filter === 'recent') {
        baseQuery = `
          SELECT ps.*, p.name as project_name
          FROM project_showcase ps
          JOIN projects p ON p.id = ps.project_id
          ORDER BY ps.created_at DESC
          LIMIT 10`;
      } else {
        baseQuery = `
          SELECT ps.*, p.name as project_name
          FROM project_showcase ps
          JOIN projects p ON p.id = ps.project_id
          ORDER BY ps.created_at DESC
          LIMIT 20`;
      }

      const result = await query(baseQuery, params.length > 0 ? params : undefined);

      if (result.rows.length === 0) {
        return { success: true, data: [], summary: 'No showcase items found.' };
      }

      const rows = result.rows as Record<string, unknown>[];
      const summary = `**Showcase Items (${rows.length}):**\n${rows
        .map(
          (s, i) =>
            `${i + 1}. "${s.project_name || s.impact_summary}" — ${((s.impact_summary as string) || '').slice(0, 100)} (${new Date(s.created_at as string).toLocaleDateString()})`
        )
        .join('\n')}`;

      return {
        success: true,
        data: rows,
        summary,
        metadata: { source: 'project_showcase, projects', count: rows.length },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Showcase data unavailable: ${(err as Error).message}.`,
      };
    }
  },
};

registerTool(showcaseItemsTool);
export default showcaseItemsTool;
