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
import { truncateText, extractRelevantExcerpt } from '../dataSanitizer.js';
import { hybridSearchChunks, semanticSearchChunks, hybridSearch } from '../../knowledgeSearch.js';
import { hybridSearch as ragHybridSearch, hasRAGData } from '../../rag/db.js';
import { embedQuery } from '../../rag/embeddings.js';
import { searchEmbeddings, type SearchResult as EntitySearchResult } from '../rag/embeddingPipeline.js';
import type { SearchResult as RAGSearchResult } from '../../rag/types.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const statusFilter = `(d.status = 'published' OR d.status = 'in_review')`;
const limit = 5;
const maxDocsForSummary = 3;
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

function formatRAGContext(results: RAGSearchResult[]): string {
  return results
    .map((r) => {
      const path = r.headingPath ? ` > ${r.headingPath}` : '';
      return `### Source: ${r.documentTitle}${path}\n${r.content}`;
    })
    .join('\n\n');
}

function formatChunkContext(chunks: { title: string; chunk_text: string }[]): string {
  return chunks
    .map((c) => `Document: ${c.title} | Content: ${c.chunk_text}`)
    .join('\n\n');
}

function formatEntityContext(results: EntitySearchResult[]): string {
  return results
    .map((r) => `### Source: ${r.source}\n${r.content}`)
    .join('\n\n');
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
        description: "The search query. Use key terms from the user's question. For multi-word concepts, include the full phrase.",
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

          if (ragResults.length > 0 || entityResults.length > 0) {
            const ragSummary = formatRAGContext(ragResults);
            const entitySummary = formatEntityContext(entityResults);
            const summary = [ragSummary, entitySummary].filter(Boolean).join('\n\n');
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

            const avgScore = ragResults.length > 0
              ? ragResults.reduce((s, r) => s + r.score, 0) / ragResults.length
              : entityResults.reduce((s, r) => s + r.similarity, 0) / entityResults.length;
            const confidence = Math.min(1, avgScore * 1.2);

            return {
              success: true,
              data: documents,
              summary,
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

      if (chunks.length > 0 || entityResults.length > 0) {
        const chunkSummary = formatChunkContext(
          chunks.map((c) => ({ title: c.title, chunk_text: c.chunk_text }))
        );
        const entitySummary = formatEntityContext(entityResults);
        const summary = [chunkSummary, entitySummary].filter(Boolean).join('\n\n');

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

        const avgScore = chunks.length > 0
          ? chunks.reduce((s, c) => s + c.score, 0) / chunks.length
          : entityResults.length > 0
            ? entityResults.reduce((s, r) => s + r.similarity, 0) / entityResults.length
            : 0.7;
        const confidence = Math.min(1, avgScore * 1.2);

        return {
          success: true,
          data: documents,
          summary,
          metadata: {
            source: chunks.length > 0 ? 'legacy_chunk_search' : 'entity_embeddings',
            count: documents.length,
            confidence,
          },
        };
      }

      // 3. Last resort: document-level search (hybrid or ILIKE)
      const documents = await searchDocuments(q, tenantId);

      if (documents.length === 0) {
        return {
          success: true,
          data: [],
          summary: `No documents found matching "${q}". This might be a knowledge gap — consider suggesting the team creates documentation on this topic.`,
          metadata: { source: 'knowledge_documents', count: 0, confidence: 0 },
        };
      }

      const searchTerms = q.split(/\s+/).filter((w) => w.length >= 2);
      const terms = searchTerms.length > 0 ? searchTerms : [q];
      const excerptContainsMatch = (ex: string) =>
        terms.some((t) => t.length >= 2 && ex.toLowerCase().includes(t.toLowerCase()));
      const docsForSummary = documents.slice(0, maxDocsForSummary);
      const summary = docsForSummary
        .map((doc) => {
          const text = doc.plain_text || '';
          const useStoredExcerpt =
            doc.excerpt &&
            doc.excerpt.trim().length > 0 &&
            excerptContainsMatch(doc.excerpt);
          const content = useStoredExcerpt
            ? truncateText(doc.excerpt!, 2500)
            : extractRelevantExcerpt(text, terms, 450);
          const displayContent = content || truncateText(text, 2000);
          return `Document: ${doc.title} | Content: ${displayContent}`;
        })
        .join('\n\n');

      return {
        success: true,
        data: documents,
        summary,
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
