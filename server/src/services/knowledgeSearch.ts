import { query } from '../db/index.js';
import { embedViaGateway } from './ai/gateway.js';

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  plain_text: string | null;
  score: number;
  search_type: 'keyword' | 'semantic' | 'hybrid';
}

export async function hybridSearch(searchQuery: string, limit = 10, tenantId: string = 'system'): Promise<SearchResult[]> {
  const keywordResults = await keywordSearch(searchQuery, limit);

  const hasVector = await query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
  if (!hasVector.rows.length) return keywordResults;

  const hasEmbeddings = await query(`SELECT 1 FROM knowledge_embeddings LIMIT 1`);
  if (!hasEmbeddings.rows.length) return keywordResults;

  const semanticResults = await semanticSearch(searchQuery, limit, tenantId);

  const merged = mergeResults(keywordResults, semanticResults, limit);
  return merged;
}

const DOC_STATUS_FILTER = `(status = 'published' OR status = 'in_review')`;

async function keywordSearch(searchQuery: string, limit: number): Promise<SearchResult[]> {
  const words = searchQuery.split(/\s+/).filter((w) => w.length >= 2);
  const tsquery = words.length > 0 ? words.map((w) => `${w}:*`).join(' & ') : searchQuery.replace(/\s+/g, ' & ') + ':*';

  try {
    const result = await query<SearchResult>(
      `SELECT id, title, slug, excerpt, plain_text,
         ts_rank(to_tsvector('english', COALESCE(plain_text, '')), to_tsquery('english', $1)) AS score,
         'keyword' AS search_type
       FROM knowledge_documents
       WHERE ${DOC_STATUS_FILTER}
         AND (
           to_tsvector('english', COALESCE(plain_text, '')) @@ to_tsquery('english', $1)
           OR title ILIKE $2
           OR plain_text ILIKE $2
         )
       ORDER BY score DESC NULLS LAST
       LIMIT $3`,
      [tsquery, `%${searchQuery}%`, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

export interface ChunkSearchResult {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  title: string;
  slug: string;
  document_type?: string;
  score: number;
}

const CHUNK_STATUS_FILTER = `(d.status = 'published' OR d.status = 'in_review')`;

/**
 * BM25 full-text search on chunk_text. Returns ChunkSearchResult[] with ts_rank score.
 * Falls back to empty array if FTS fails (e.g., no suitable index).
 */
export async function bm25SearchChunks(
  searchQuery: string,
  limit: number = 7
): Promise<ChunkSearchResult[]> {
  const trimmed = searchQuery.trim();
  if (!trimmed) return [];

  try {
    const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
    const tsquery =
      words.length > 0
        ? words.map((w) => `${w.replace(/[^\w-]/g, '')}:*`).filter((w) => w.length > 1).join(' & ')
        : `${trimmed.replace(/[^\w\s]/g, '').trim()}:*`;
    if (!tsquery || tsquery === ':*') return [];

    const result = await query<ChunkSearchResult>(
      `SELECT e.id, e.document_id, e.chunk_index, e.chunk_text, d.title, d.slug, d.document_type,
         ts_rank(to_tsvector('english', COALESCE(e.chunk_text, '')), to_tsquery('english', $1)) AS score
       FROM knowledge_embeddings e
       JOIN knowledge_documents d ON d.id = e.document_id
       WHERE ${CHUNK_STATUS_FILTER}
         AND to_tsvector('english', COALESCE(e.chunk_text, '')) @@ to_tsquery('english', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [tsquery, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Hybrid chunk search: 70% vector (semantic) + 30% BM25.
 * Normalizes scores to [0,1], merges, deduplicates by chunk id, returns top K.
 */
export async function hybridSearchChunks(
  searchQuery: string,
  limit: number = 7,
  tenantId: string = 'system',
): Promise<ChunkSearchResult[]> {
  const [vectorResults, bm25Results] = await Promise.all([
    semanticSearchChunks(searchQuery, limit * 2, tenantId),
    bm25SearchChunks(searchQuery, limit * 2),
  ]);

  if (vectorResults.length === 0 && bm25Results.length === 0) return [];
  if (vectorResults.length === 0) return bm25Results.slice(0, limit);
  if (bm25Results.length === 0) return vectorResults.slice(0, limit);

  const maxVector = Math.max(...vectorResults.map((r) => r.score), 0.001);
  const maxBm25 = Math.max(...bm25Results.map((r) => r.score), 0.001);

  const byId = new Map<string, ChunkSearchResult>();
  for (const r of vectorResults) {
    const norm = r.score / maxVector;
    byId.set(r.id, { ...r, score: norm * 0.7 });
  }
  for (const r of bm25Results) {
    const norm = r.score / maxBm25;
    const existing = byId.get(r.id);
    const add = norm * 0.3;
    if (existing) {
      existing.score += add;
    } else {
      byId.set(r.id, { ...r, score: add });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Retrieve top K chunks by semantic similarity (no DISTINCT ON).
 * Allows multiple chunks from the same document for better RAG context.
 */
export async function semanticSearchChunks(
  searchQuery: string,
  limit: number = 7,
  tenantId: string = 'system',
): Promise<ChunkSearchResult[]> {
  try {
    const embeddings = await embedViaGateway([searchQuery], tenantId);
    const embedding = embeddings[0];
    if (!embedding) return [];

    const vectorStr = `[${embedding.join(',')}]`;
    const result = await query<ChunkSearchResult>(
      `SELECT e.id, e.document_id, e.chunk_index, e.chunk_text, d.title, d.slug, d.document_type,
         (1 - (e.embedding <=> $1::vector)) AS score
       FROM knowledge_embeddings e
       JOIN knowledge_documents d ON d.id = e.document_id
       WHERE (d.status = 'published' OR d.status = 'in_review') AND e.embedding IS NOT NULL
       ORDER BY (e.embedding <=> $1::vector) ASC
       LIMIT $2`,
      [vectorStr, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function semanticSearch(searchQuery: string, limit: number, tenantId: string = 'system'): Promise<SearchResult[]> {
  try {
    const embeddings = await embedViaGateway([searchQuery], tenantId);
    const embedding = embeddings[0];
    if (!embedding) return [];

    const vectorStr = `[${embedding.join(',')}]`;
    const result = await query<SearchResult>(
      `SELECT DISTINCT ON (d.id) d.id, d.title, d.slug, e.chunk_text AS excerpt, d.plain_text,
         (1 - (e.embedding <=> $1::vector)) AS score,
         'semantic' AS search_type
       FROM knowledge_embeddings e
       JOIN knowledge_documents d ON d.id = e.document_id
       WHERE (d.status = 'published' OR d.status = 'in_review') AND e.embedding IS NOT NULL
       ORDER BY d.id, (e.embedding <=> $1::vector) ASC
       LIMIT $2`,
      [vectorStr, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}

function mergeResults(keyword: SearchResult[], semantic: SearchResult[], limit: number): SearchResult[] {
  const map = new Map<string, SearchResult>();

  for (const r of keyword) {
    const existing = map.get(r.id);
    const score = (existing?.score ?? 0) + r.score * 0.6;
    map.set(r.id, { ...r, score, search_type: 'hybrid' });
  }

  for (const r of semantic) {
    const existing = map.get(r.id);
    const score = (existing?.score ?? 0) + r.score * 0.4;
    map.set(r.id, { ...(existing ?? r), score, search_type: 'hybrid' });
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
