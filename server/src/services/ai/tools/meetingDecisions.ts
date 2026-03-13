/**
 * Tool: get_meeting_decisions
 *
 * Searches knowledge_documents of type 'meeting_note' for decisions and action items.
 * Uses parameterized date filter.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { truncateText } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const meetingDecisionsTool: Tool = {
  name: 'meeting:get_meeting_decisions',
  metadata: {
    namespace: 'meeting',
    name: 'get_meeting_decisions',
    summary: 'Meeting decisions, action items, and key outcomes from notes.',
    tags: ['meeting', 'decisions', 'notes', 'action-items'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },
  category: 'knowledge',

  description: `Search meeting notes for decisions, action items, and discussion outcomes.

Use this tool when someone asks:
- "What was decided in the [meeting name] meeting?"
- "Meeting notes about [topic]"
- "What action items came from [meeting]?"
- "Recent meeting decisions"
- "What did we agree on regarding [topic]?"
- Any question specifically about meeting outcomes, decisions, or action items`,

  parameters: {
    type: 'object',
    properties: {
      search_query: {
        type: 'string',
        description: 'Topic or keywords to search for in meeting notes.',
      },
      time_period: {
        type: 'string',
        description: 'How far back to search.',
        enum: ['this_week', 'this_month', 'this_quarter', 'all'],
      },
    },
    required: ['search_query'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const searchQuery = (args.search_query as string) || '';
    const timePeriod = (args.time_period as string) || 'this_month';

    const now = new Date();
    let dateFilter: Date;
    switch (timePeriod) {
      case 'this_week':
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this_quarter':
        dateFilter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      default:
        dateFilter = new Date(0);
    }

    const result = await query(
      `SELECT kd.id, kd.title, kd.plain_text, kd.created_at, kd.updated_at, kd.author_id
       FROM knowledge_documents kd
       WHERE kd.document_type = 'meeting_note'
         AND kd.status IN ('published', 'in_review')
         AND (LOWER(kd.title) LIKE LOWER($1) OR LOWER(COALESCE(kd.plain_text, '')) LIKE LOWER($1))
         AND kd.created_at >= $2
       ORDER BY kd.created_at DESC
       LIMIT 10`,
      [`%${searchQuery}%`, dateFilter]
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        data: [],
        summary: `No meeting notes found about "${searchQuery}" (${timePeriod}).`,
        metadata: { source: 'knowledge_documents (meeting_note)', count: 0, timeRange: timePeriod },
      };
    }

    const authorIds = [...new Set((result.rows as Record<string, unknown>[]).map((r) => r.author_id).filter(Boolean))];
    let authorMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const authorRes = await query<{ auth_user_id: string; full_name: string }>(
        `SELECT auth_user_id, full_name FROM reimbursement_users WHERE auth_user_id = ANY($1)`,
        [authorIds]
      );
      authorMap = new Map(authorRes.rows.map((r) => [r.auth_user_id, r.full_name]));
    }

    const summary = (result.rows as Record<string, unknown>[])
      .map((doc, i) => {
        const content = truncateText((doc.plain_text as string) || '', 1500);
        const authorName = authorMap.get(doc.author_id as string) || 'Unknown';
        return `### ${i + 1}. ${doc.title}
Author: ${authorName} | Date: ${new Date(doc.created_at as string).toLocaleDateString()}

${content}`;
      })
      .join('\n\n---\n\n');

    return {
      success: true,
      data: result.rows,
      summary,
      metadata: { source: 'knowledge_documents (meeting_note)', count: result.rows.length, timeRange: timePeriod },
    };
  },
};

registerTool(meetingDecisionsTool);
export default meetingDecisionsTool;
