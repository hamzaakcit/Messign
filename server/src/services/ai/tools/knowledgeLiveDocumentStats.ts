/**
 * Tool: get_live_document_stats
 *
 * Direct SQL snapshot of knowledge_documents freshness (real-time counts).
 * Complements get_knowledge_base_stats with explicit staleness windows.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const knowledgeLiveDocumentStatsTool: Tool = {
  name: 'knowledge:get_live_document_stats',
  category: 'knowledge',

  metadata: {
    namespace: 'knowledge',
    name: 'get_live_document_stats',
    summary: 'Live document counts: total active, stale (90d), recently updated (7d).',
    tags: ['knowledge', 'documents', 'stats', 'staleness', 'realtime'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },

  description: `Get live counts from knowledge_documents: total non-archived documents, how many were last updated more than 90 days ago (stale), and how many were updated in the last 7 days.

Use for:
- "How many documents do we have right now?"
- "How many knowledge docs are stale?"
- "Recently updated documents count"
- Real-time metadata without search or LLM`,

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    try {
      const result = await query<{ total: string; stale: string; recently_updated: string }>(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '90 days')::int AS stale,
          COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days')::int AS recently_updated
        FROM knowledge_documents
        WHERE status != 'archived'
      `);

      const row = result.rows[0];
      const total = parseInt(row?.total ?? '0', 10);
      const stale = parseInt(row?.stale ?? '0', 10);
      const recentlyUpdated = parseInt(row?.recently_updated ?? '0', 10);

      const summary = `**Knowledge base (live)**\n\n- **Active documents** (not archived): ${total}\n- **Stale** (no update in 90+ days): ${stale}\n- **Recently updated** (last 7 days): ${recentlyUpdated}`;

      return {
        success: true,
        data: { total, stale, recently_updated: recentlyUpdated },
        summary,
        metadata: { source: 'knowledge_documents', count: total },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[get_live_document_stats]', msg);
      return {
        success: false,
        data: null,
        summary: 'Could not load live knowledge document statistics.',
      };
    }
  },
};

registerTool(knowledgeLiveDocumentStatsTool);
export default knowledgeLiveDocumentStatsTool;
