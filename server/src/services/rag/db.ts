/**
 * Dora Phase 2 — RAG Database Service
 *
 * CRUD and search operations for the new document_chunks + document_summaries
 * tables backed by pgvector. Wired to the existing pg pool via db/index.ts.
 *
 * Tables:
 *   document_chunks     — stores chunk text, heading path, embedding vector(1536), tsvector
 *   document_summaries  — stores LLM-generated summaries and metadata per document
 *
 * Search functions:
 *   vectorSearch()   — cosine similarity on embeddings
 *   keywordSearch()  — ts_rank on content_tsv
 *   hybridSearch()   — weighted merge of vector + keyword results
 */

import { query } from '../../db/index.js';
import { getEmbeddingDimensions } from './embeddings.js';
import type {
  EmbeddedChunk,
  DocumentSummary,
  SearchResult,
  ChunkRow,
  SummaryRow,
  VectorSearchRow,
  FTSSearchRow,
} from './types.js';

export async function setupRAGSchema(): Promise<void> {
  const dims = getEmbeddingDimensions();

  await query(`CREATE EXTENSION IF NOT EXISTS vector`);

  await query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      heading TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      embedding vector(${dims}),
      metadata JSONB NOT NULL DEFAULT '{}',
      content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS document_summaries (
      document_id UUID PRIMARY KEY REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      key_topics JSONB NOT NULL DEFAULT '[]',
      audience TEXT NOT NULL DEFAULT 'All employees',
      complexity TEXT NOT NULL DEFAULT 'basic',
      content_hash TEXT NOT NULL,
      last_summarized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes (safe to re-run)
  await query(`CREATE INDEX IF NOT EXISTS idx_dc_document_id ON document_chunks(document_id)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_dc_content_tsv ON document_chunks USING GIN(content_tsv)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_dc_metadata ON document_chunks USING GIN(metadata)`).catch(() => {});

  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_dc_embedding_hnsw ON document_chunks USING hnsw(embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
  } catch {
    console.warn('[RAG DB] HNSW index creation skipped (may already exist or pgvector version too old)');
  }

  console.log('[RAG DB] Schema setup complete');
}

export async function saveDocumentChunks(chunks: EmbeddedChunk[]): Promise<number> {
  if (chunks.length === 0) return 0;

  const documentId = chunks[0]!.documentId;
  await query(`DELETE FROM document_chunks WHERE document_id = $1`, [documentId]);

  let saved = 0;
  for (const chunk of chunks) {
    const vectorStr = chunk.embedding ? `[${chunk.embedding.join(',')}]` : null;
    await query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, heading, token_count, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
      [
        chunk.documentId,
        chunk.chunkIndex,
        chunk.content,
        chunk.headingPath,
        chunk.tokenCount,
        vectorStr,
        JSON.stringify(chunk.metadata),
      ],
    );
    saved++;
  }

  return saved;
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  await query(`DELETE FROM document_chunks WHERE document_id = $1`, [documentId]);
  await query(`DELETE FROM document_summaries WHERE document_id = $1`, [documentId]);
}

export async function saveDocumentSummary(summary: DocumentSummary): Promise<void> {
  await query(
    `INSERT INTO document_summaries (document_id, summary, key_topics, audience, complexity, content_hash, last_summarized_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (document_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       key_topics = EXCLUDED.key_topics,
       audience = EXCLUDED.audience,
       complexity = EXCLUDED.complexity,
       content_hash = EXCLUDED.content_hash,
       last_summarized_at = EXCLUDED.last_summarized_at`,
    [
      summary.documentId,
      summary.summary,
      JSON.stringify(summary.keyTopics),
      summary.audience,
      summary.complexity,
      summary.contentHash,
      summary.lastSummarizedAt,
    ],
  );
}

export async function getExistingSummary(documentId: string): Promise<SummaryRow | null> {
  const result = await query<SummaryRow>(
    `SELECT * FROM document_summaries WHERE document_id = $1`,
    [documentId],
  );
  return result.rows[0] ?? null;
}

export async function vectorSearch(
  queryEmbedding: number[],
  topK: number = 10,
  filters?: { categoryName?: string; documentType?: string },
): Promise<SearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  let filterClause = '';
  const params: unknown[] = [vectorStr, topK];
  let paramIdx = 3;

  if (filters?.categoryName) {
    filterClause += ` AND c.metadata->>'categoryName' = $${paramIdx}`;
    params.push(filters.categoryName);
    paramIdx++;
  }
  if (filters?.documentType) {
    filterClause += ` AND c.metadata->>'documentType' = $${paramIdx}`;
    params.push(filters.documentType);
    paramIdx++;
  }

  const result = await query<VectorSearchRow>(
    `SELECT c.*, (1 - (c.embedding <=> $1::vector)) AS cosine_distance
     FROM document_chunks c
     JOIN knowledge_documents d ON d.id = c.document_id
     WHERE (d.status = 'published' OR d.status = 'in_review')
       AND c.embedding IS NOT NULL
       ${filterClause}
     ORDER BY c.embedding <=> $1::vector ASC
     LIMIT $2`,
    params,
  );

  return result.rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    documentTitle: row.metadata?.documentTitle ?? '',
    documentSlug: row.metadata?.documentSlug ?? '',
    content: row.content,
    headingPath: row.heading || '',
    score: row.cosine_distance,
    vectorScore: row.cosine_distance,
    keywordScore: 0,
    metadata: row.metadata,
  }));
}

export async function keywordSearch(
  searchQuery: string,
  topK: number = 10,
): Promise<SearchResult[]> {
  const words = searchQuery.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];

  const tsquery = words.map((w) => `${w.replace(/[^\w-]/g, '')}:*`).filter((w) => w.length > 2).join(' & ');
  if (!tsquery) return [];

  const result = await query<FTSSearchRow>(
    `SELECT c.*, ts_rank(c.content_tsv, to_tsquery('english', $1)) AS rank
     FROM document_chunks c
     JOIN knowledge_documents d ON d.id = c.document_id
     WHERE (d.status = 'published' OR d.status = 'in_review')
       AND c.content_tsv @@ to_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [tsquery, topK],
  );

  return result.rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    documentTitle: row.metadata?.documentTitle ?? '',
    documentSlug: row.metadata?.documentSlug ?? '',
    content: row.content,
    headingPath: row.heading || '',
    score: row.rank,
    vectorScore: 0,
    keywordScore: row.rank,
    metadata: row.metadata,
  }));
}

export async function hybridSearch(
  queryEmbedding: number[],
  searchQuery: string,
  topK: number = 10,
  vectorWeight: number = 0.7,
  keywordWeight: number = 0.3,
  filters?: { categoryName?: string; documentType?: string },
): Promise<SearchResult[]> {
  const fetchK = topK * 2;

  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(queryEmbedding, fetchK, filters),
    keywordSearch(searchQuery, fetchK),
  ]);

  if (vectorResults.length === 0 && keywordResults.length === 0) return [];
  if (vectorResults.length === 0) return keywordResults.slice(0, topK);
  if (keywordResults.length === 0) return vectorResults.slice(0, topK);

  const maxVector = Math.max(...vectorResults.map((r) => r.vectorScore), 0.001);
  const maxKeyword = Math.max(...keywordResults.map((r) => r.keywordScore), 0.001);

  const byId = new Map<string, SearchResult>();

  for (const r of vectorResults) {
    const normVector = r.vectorScore / maxVector;
    byId.set(r.chunkId, {
      ...r,
      vectorScore: normVector,
      score: normVector * vectorWeight,
    });
  }

  for (const r of keywordResults) {
    const normKeyword = r.keywordScore / maxKeyword;
    const existing = byId.get(r.chunkId);
    if (existing) {
      existing.keywordScore = normKeyword;
      existing.score += normKeyword * keywordWeight;
    } else {
      byId.set(r.chunkId, {
        ...r,
        keywordScore: normKeyword,
        score: normKeyword * keywordWeight,
      });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function hasRAGData(): Promise<boolean> {
  try {
    const result = await query(`SELECT 1 FROM document_chunks LIMIT 1`);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
