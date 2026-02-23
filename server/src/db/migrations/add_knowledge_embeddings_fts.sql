-- GIN index on knowledge_embeddings.chunk_text for BM25 full-text search
-- Required for hybridSearchChunks (vector 70% + BM25 30%)

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_chunk_fts
  ON knowledge_embeddings
  USING GIN (to_tsvector('english', COALESCE(chunk_text, '')));
