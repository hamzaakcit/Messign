/**
 * Tool: get_knowledge_base_stats
 *
 * Returns document counts, staleness breakdown, and knowledge base health.
 * Use for "how many documents", "how many are stale", "knowledge base stats".
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const knowledgeBaseStatsTool: Tool = {
  name: 'knowledge:get_knowledge_base_stats',
  category: 'knowledge',

  metadata: {
    namespace: 'knowledge',
    name: 'get_knowledge_base_stats',
    summary: 'Document counts, staleness breakdown, knowledge base health stats.',
    tags: ['knowledge', 'documents', 'stats', 'staleness'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },

  description: `Get knowledge base statistics: total document count, count by status (published, draft, in_review), and staleness breakdown (fresh, aging, stale).

Use this tool when someone asks:
- "How many documents are in the knowledge base?"
- "How many documents are stale?"
- "Knowledge base stats" or "Document count"
- "How big is our knowledge base?"
- "How many docs need review?"
- Any question about document counts, staleness, or knowledge base size`,

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    try {
      const [countsResult, healthResult] = await Promise.all([
        query<{ total: string; published: string; draft: string; in_review: string }>(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'published')::int AS published,
            COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
            COUNT(*) FILTER (WHERE status = 'in_review')::int AS in_review
          FROM knowledge_documents
        `),
        query<{ status: string; count: string }>(`
          SELECT
            CASE
              WHEN updated_at > NOW() - INTERVAL '90 days' THEN 'fresh'
              WHEN updated_at > NOW() - INTERVAL '180 days' THEN 'aging'
              ELSE 'stale'
            END AS status,
            COUNT(*)::int AS count
          FROM knowledge_documents WHERE status = 'published'
          GROUP BY 1
        `),
      ]);

      const counts = countsResult.rows[0];
      const health = healthResult.rows as { status: string; count: string }[];

      const total = parseInt(counts?.total ?? '0', 10);
      const published = parseInt(counts?.published ?? '0', 10);
      const draft = parseInt(counts?.draft ?? '0', 10);
      const inReview = parseInt(counts?.in_review ?? '0', 10);

      const fresh = health.find((r) => r.status === 'fresh')?.count ?? '0';
      const aging = health.find((r) => r.status === 'aging')?.count ?? '0';
      const stale = health.find((r) => r.status === 'stale')?.count ?? '0';
      const staleCount = parseInt(stale, 10);
      const freshCount = parseInt(fresh, 10);
      const agingCount = parseInt(aging, 10);

      let summary = `**Knowledge Base — Document Statistics**

**Total documents:** ${total}
- Published: ${published}
- Draft: ${draft}
- In review: ${inReview}

**Content freshness** (published docs only):
- Fresh (updated in last 90 days): ${freshCount}
- Aging (90–180 days since update): ${agingCount}
- Stale (not updated in 180+ days): ${staleCount}`;

      if (staleCount > 0) {
        summary += `\n\n${staleCount} document(s) may need review for outdated content.`;
      }

      return {
        success: true,
        data: {
          total,
          published,
          draft,
          in_review: inReview,
          fresh: freshCount,
          aging: agingCount,
          stale: staleCount,
        },
        summary,
        metadata: { source: 'knowledge_documents', count: 1 },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[get_knowledge_base_stats]', msg);
      return {
        success: false,
        data: null,
        summary: 'Could not retrieve knowledge base statistics.',
      };
    }
  },
};

registerTool(knowledgeBaseStatsTool);
export default knowledgeBaseStatsTool;
