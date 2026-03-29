/**
 * Tool: search_knowledge_base
 *
 * Searches Knowledge Hub documents. Prefers new Phase 2 RAG pipeline (heading-aware
 * chunks + OpenAI embeddings + hybrid 70/30 vector/BM25) when available. Falls back
 * to legacy chunk search or document-level ILIKE search.
 *
 * Context format: ### Source: {Title} > {HeadingPath}\n{Content}
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { buildParameterHints } from './toolIndex.js';
import { hybridSearchChunks, semanticSearchChunks, hybridSearch } from '../../knowledgeSearch.js';
import { hybridSearch as ragHybridSearch, hasRAGData } from '../../rag/db.js';
import { embedQuery } from '../../rag/embeddings.js';
import { searchEmbeddings, type SearchResult as EntitySearchResult } from '../rag/embeddingPipeline.js';
import type { SearchResult as RAGSearchResult } from '../../rag/types.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { computeKnowledgeSearchAggregates } from './knowledgeSearchAggregates.js';

const statusFilter = `(d.status = 'published' OR d.status = 'in_review')`;
const limit = 5;
const RAG_CHUNK_LIMIT = 10;

interface DocRow {
  id: string;
  title: string;
  slug: string;
  document_type?: string;
  status?: string;
  plain_text?: string | null;
  author_id?: string;
  updated_at?: string;
  excerpt?: string | null;
}

/** Structured tool payload for Dora widget + short synthesis line */
export interface KnowledgeSearchPayload {
  documents: Array<{
    id: string;
    title: string;
    slug: string;
    document_type?: string;
  }>;
  aggregates: ReturnType<typeof computeKnowledgeSearchAggregates>;
  query: string;
  confidence: number;
}

function buildKnowledgeSearchPayload(
  documents: KnowledgeSearchPayload['documents'],
  queryText: string,
  confidence: number,
): KnowledgeSearchPayload {
  return {
    documents,
    aggregates: computeKnowledgeSearchAggregates(documents),
    query: queryText,
    confidence,
  };
}

function shortKnowledgeSearchSummary(docCount: number, queryText: string, confidence: number): string {
  if (docCount === 0) {
    return `**No documents** found for "${queryText}".`;
  }
  return `**${docCount} document(s)** for "${queryText}" · ${Math.round(confidence * 100)}% match — details in the widget below.`;
}

async function searchDocuments(userQuery: string, tenantId: string = 'system'): Promise<DocRow[]> {
  const words = userQuery.split(/\s+/).filter((w) => w.length > 0).map((w) => w.trim());
  const phrase = `%${userQuery.trim()}%`;

  try {
    const hybridResults = await hybridSearch(userQuery, limit, tenantId);
    if (hybridResults.length > 0) {
      const enriched = await Promise.all(
        hybridResults.map(async (r) => {
          const meta = await query<{ document_type: string; status: string; author_id: string; updated_at: string }>(
            `SELECT document_type, status, author_id, updated_at FROM knowledge_documents WHERE id = $1`,
            [r.id]
          );
          const m = meta.rows[0];
          return {
            id: r.id,
            title: r.title,
            slug: r.slug,
            document_type: m?.document_type ?? 'document',
            status: m?.status ?? 'published',
            plain_text: r.plain_text,
            author_id: m?.author_id ?? 'unknown',
            updated_at: m?.updated_at ?? null,
            excerpt: r.excerpt,
          };
        })
      );
      return enriched;
    }
  } catch (e) {
    console.warn('[searchKnowledgeBase] hybridSearch failed, falling back to ILIKE:', e instanceof Error ? e.message : e);
  }

  try {
    const orConditions = words.length >= 2
      ? words.map((_, i) => `(d.title ILIKE $${i + 1} OR d.plain_text ILIKE $${i + 1})`).join(' OR ')
      : `(d.title ILIKE $1 OR d.plain_text ILIKE $1)`;
    const params = words.length >= 2 ? words.map((w) => `%${w}%`) : [phrase];

    const res = await query<DocRow>(
      `SELECT id, title, slug, document_type, status, plain_text, author_id, updated_at
       FROM knowledge_documents d
       WHERE ${statusFilter} AND (${orConditions})
       ORDER BY d.updated_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return res.rows;
  } catch {
    /* search failed */
  }
  return [];
}

const searchKnowledgeBaseTool: Tool = {
  name: 'knowledge:search_knowledge_base',
  category: 'knowledge',

  metadata: {
    namespace: 'knowledge',
    name: 'search_knowledge_base',
    summary: 'Search company docs, guides, policies, SOPs, FAQs. RAG + hybrid vector/BM25.',
    tags: ['knowledge', 'search', 'rag', 'documents', 'policies'],
    alwaysLoaded: true,
    parameterHints: buildParameterHints({
      properties: { query: { type: 'string' } },
      required: ['query'],
    }),
  },

  description: `Search the company knowledge base for documents, guides, policies, SOPs, FAQs, meeting notes, announcements, and other written content.
Use this tool when someone asks:
- "How do I...?" or "What is our policy on...?"
- Questions about processes, procedures, or guidelines
- Looking for specific documents or guides
- Any question that might be answered by internal documentation
- "What does the documentation say about...?"
Returns: Matching documents with title, type, content excerpt, section heading, author, and last updated date.`,

  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "Key terms from the user's question, verbatim when possible (acronyms, product names). Do not rewrite into 'X description' or 'X overview' unless the user said those words.",
      },
    },
    required: ['query'],
  },

  requiredRoles: undefined,

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const queryArg = args.query;
    const q = typeof queryArg === 'string' ? queryArg : String(queryArg ?? '');

    if (!q.trim()) {
      return { success: false, data: null, summary: 'No search query provided.' };
    }

    try {
      // 1. Try new Phase 2 RAG pipeline (heading-aware chunks, OpenAI embeddings, 70/30 hybrid)
      const tenantId = _context.organizationId ?? 'system';
      const userRoles = [_context.userRole, 'employee', 'manager', 'admin'].filter(Boolean);

      let entityResults: EntitySearchResult[] = [];
      try {
        entityResults = await searchEmbeddings(tenantId, q, userRoles, { limit: 5, minSimilarity: 0.7 });
      } catch (entityErr) {
        console.warn('[searchKnowledgeBase] entity_embeddings search failed:', entityErr instanceof Error ? entityErr.message : entityErr);
      }

      const ragAvailable = await hasRAGData();
      if (ragAvailable) {
        try {
          const queryEmbedding = await embedQuery(q, tenantId);
          const ragResults = await ragHybridSearch(queryEmbedding, q, RAG_CHUNK_LIMIT);

          if (ragResults.length > 0) {
            const seenIds = new Set<string>();
            const documents = ragResults
              .filter((r) => {
                if (seenIds.has(r.documentId)) return false;
                seenIds.add(r.documentId);
                return true;
              })
              .map((r) => ({
                id: r.documentId,
                title: r.documentTitle,
                slug: r.documentSlug,
                document_type: r.metadata?.documentType ?? 'document',
              }));

            const avgScore = ragResults.reduce((s, r) => s + r.score, 0) / ragResults.length;
            const confidence = Math.min(1, avgScore * 1.2);
            const data = buildKnowledgeSearchPayload(documents, q, confidence);

            return {
              success: true,
              data,
              summary: shortKnowledgeSearchSummary(documents.length, q, confidence),
              metadata: {
                source: 'rag_pipeline_v2',
                count: documents.length,
                chunksReturned: ragResults.length,
                confidence,
                avgVectorScore: ragResults.length > 0 ? ragResults.reduce((s, r) => s + r.vectorScore, 0) / ragResults.length : 0,
                avgKeywordScore: ragResults.length > 0 ? ragResults.reduce((s, r) => s + r.keywordScore, 0) / ragResults.length : 0,
              },
            };
          }
        } catch (ragErr) {
          console.warn('[searchKnowledgeBase] RAG v2 search failed, falling back to legacy:', ragErr instanceof Error ? ragErr.message : ragErr);
        }
      }

      // 2. Fallback: legacy hybrid chunk search (gateway embeddings, 70% vector + 30% BM25)
      let chunks = await hybridSearchChunks(q, RAG_CHUNK_LIMIT, tenantId);
      if (chunks.length === 0) {
        chunks = await semanticSearchChunks(q, RAG_CHUNK_LIMIT, tenantId);
      }

      if (chunks.length > 0) {
        const seenIds = new Set<string>();
        const documents = chunks
          .filter((c) => {
            if (seenIds.has(c.document_id)) return false;
            seenIds.add(c.document_id);
            return true;
          })
          .map((c) => ({
            id: c.document_id,
            title: c.title,
            slug: c.slug,
            document_type: c.document_type ?? 'document',
          }));

        const avgScore = chunks.reduce((s, c) => s + c.score, 0) / chunks.length;
        const confidence = Math.min(1, avgScore * 1.2);
        const data = buildKnowledgeSearchPayload(documents, q, confidence);

        return {
          success: true,
          data,
          summary: shortKnowledgeSearchSummary(documents.length, q, confidence),
          metadata: {
            source: 'legacy_chunk_search',
            count: documents.length,
            confidence,
          },
        };
      }

      // 3. Last resort: document-level search (hybrid or ILIKE)
      const documents = await searchDocuments(q, tenantId);

      if (documents.length === 0) {
        const emptyPayload = buildKnowledgeSearchPayload([], q, 0);
        return {
          success: true,
          data: emptyPayload,
          summary: shortKnowledgeSearchSummary(0, q, 0),
          metadata: { source: 'knowledge_documents', count: 0, confidence: 0 },
        };
      }

      const docCards = documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        document_type: doc.document_type ?? 'document',
      }));
      const data = buildKnowledgeSearchPayload(docCards, q, 0.6);

      return {
        success: true,
        data,
        summary: shortKnowledgeSearchSummary(docCards.length, q, 0.6),
        metadata: {
          source: 'knowledge_documents',
          count: documents.length,
          confidence: 0.6,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        data: null,
        summary: `Knowledge base search failed: ${message}`,
      };
    }
  },
};

registerTool(searchKnowledgeBaseTool);

export default searchKnowledgeBaseTool;
export { searchDocuments };
