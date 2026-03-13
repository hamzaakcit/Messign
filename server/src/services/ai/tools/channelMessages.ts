/**
 * Tool: search_chat_messages
 *
 * Search through chat/messaging history.
 * Adapted for Messign: messages (user_id VARCHAR), channels.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { truncateText } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

const chatMessagesTool: Tool = {
  name: 'communication:search_chat_messages',
  metadata: {
    namespace: 'communication',
    name: 'search_chat_messages',
    summary: 'Search chat channels and DMs for messages by keyword or topic.',
    tags: ['communication', 'chat', 'messages', 'search'],
    alwaysLoaded: false,
    parameterHints: 'query: string',
  },
  category: 'communication',

  description: `Search through chat messages and channel conversations for specific topics or decisions.

Use this tool when someone asks:
- "What did we discuss about [topic] in chat?"
- "Find messages about [topic]"
- "What was decided in [channel] about [topic]?"
- "Recent messages from [Name]"
- "Search chat for [keyword]"
- Any question about past conversations, chat history, or decisions made in messaging`,

  parameters: {
    type: 'object',
    properties: {
      search_query: {
        type: 'string',
        description: 'Keywords to search for in messages.',
      },
      channel_name: {
        type: 'string',
        description: 'Optional: specific channel/room to search in.',
      },
      user_identifier: {
        type: 'string',
        description: 'Optional: filter messages by sender.',
      },
    },
    required: ['search_query'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const searchQuery = (args.search_query as string) || '';
    const channelName = args.channel_name as string | undefined;
    const userIdentifier = args.user_identifier as string | undefined;

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    try {
      let baseQuery = `
        SELECT m.id, m.content, m.created_at, m.user_id,
               ru.full_name as sender_name,
               ch.name as channel_name
        FROM messages m
        LEFT JOIN reimbursement_users ru ON ru.auth_user_id = m.user_id AND ru.organization_id = $1
        LEFT JOIN channels ch ON m.channel_id = ch.id
        WHERE LOWER(m.content) LIKE LOWER($2)
      `;
      const params: unknown[] = [orgId, `%${searchQuery}%`];
      let paramIdx = 3;

      if (channelName) {
        baseQuery += ` AND LOWER(ch.name) LIKE LOWER($${paramIdx})`;
        params.push(`%${channelName}%`);
        paramIdx++;
      }

      if (userIdentifier && !['me', 'my'].includes(userIdentifier.toLowerCase())) {
        baseQuery += ` AND (LOWER(ru.full_name) LIKE LOWER($${paramIdx}) OR LOWER(m.user_id) LIKE LOWER($${paramIdx}))`;
        params.push(`%${userIdentifier}%`);
        paramIdx++;
      } else if (userIdentifier && ['me', 'my'].includes(userIdentifier.toLowerCase())) {
        baseQuery += ` AND m.user_id = $${paramIdx}`;
        params.push(context.userId);
        paramIdx++;
      }

      baseQuery += ` ORDER BY m.created_at DESC LIMIT 20`;

      const result = await query(baseQuery, params);

      if (result.rows.length === 0) {
        return {
          success: true,
          data: [],
          summary: `No messages found matching "${searchQuery}"${channelName ? ` in #${channelName}` : ''}.`,
        };
      }

      const rows = result.rows as Record<string, unknown>[];
      const summary = `**Chat Search Results for "${searchQuery}" (${rows.length} messages):**\n${rows
        .map((m, i) => {
          const time = new Date(m.created_at as string).toLocaleString();
          const content = truncateText((m.content as string) || '', 200);
          return `${i + 1}. [${time}] ${m.sender_name || m.user_id} in #${m.channel_name || 'DM'}: ${content}`;
        })
        .join('\n')}`;

      return {
        success: true,
        data: rows,
        summary,
        metadata: { source: 'messages, channels, reimbursement_users', count: rows.length },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Chat search failed: ${(err as Error).message}. Your messaging tables may differ.`,
      };
    }
  },
};

registerTool(chatMessagesTool);
export default chatMessagesTool;
