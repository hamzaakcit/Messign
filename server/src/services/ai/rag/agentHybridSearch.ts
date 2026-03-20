/**
 * Org-scoped hybrid RAG for agent hydration (wraps Phase 2 rag/db hybridSearch).
 * RBAC: filters restricted doc types for non-admin roles when metadata marks sensitivity.
 */
import { embedQuery } from '../../rag/embeddings.js';
import { hybridSearch as ragHybridSearch } from '../../rag/db.js';
import type { SearchResult } from '../../rag/types.js';

export interface AgentHybridCitation {
  index: number;
  chunkId: string;
  documentId: string;
  title: string;
  slug: string;
  headingPath: string;
  excerpt: string;
  score: number;
}

const SENSITIVE_TYPES = new Set(['confidential', 'restricted']);

function roleMaySeeRestricted(userRole: string): boolean {
  return ['admin', 'cpo', 'finance', 'hr', 'manager'].includes(userRole);
}

function filterByRbac(results: SearchResult[], userRole: string): SearchResult[] {
  if (roleMaySeeRestricted(userRole)) return results;
  return results.filter((r) => {
    const sens = (r.metadata as { sensitivity?: string } | undefined)?.sensitivity;
    if (!sens) return true;
    return !SENSITIVE_TYPES.has(sens);
  });
}

export async function hybridSearchForAgent(params: {
  query: string;
  organizationId: string | null;
  userRole: string;
  topK?: number;
}): Promise<AgentHybridCitation[]> {
  const topK = params.topK ?? 6;
  const tenantId = params.organizationId ?? 'system';
  let embedding: number[];
  try {
    embedding = await embedQuery(params.query.trim(), tenantId);
  } catch {
    return [];
  }
  let raw: SearchResult[] = [];
  try {
    raw = await ragHybridSearch(embedding, params.query, Math.max(topK * 2, 8));
  } catch {
    return [];
  }
  raw = filterByRbac(raw, params.userRole);
  return raw.slice(0, topK).map((r, i) => ({
    index: i + 1,
    chunkId: r.chunkId,
    documentId: r.documentId,
    title: r.documentTitle,
    slug: r.documentSlug,
    headingPath: r.headingPath,
    excerpt: r.content.length > 500 ? `${r.content.slice(0, 500)}…` : r.content,
    score: r.score,
  }));
}

export function formatHybridCitationsBlock(citations: AgentHybridCitation[]): string {
  if (!citations.length) return '';
  return citations
    .map(
      (c) =>
        `[${c.index}] **${c.title}**${c.headingPath ? ` — ${c.headingPath}` : ''} (slug: ${c.slug})\n${c.excerpt}`,
    )
    .join('\n\n');
}
