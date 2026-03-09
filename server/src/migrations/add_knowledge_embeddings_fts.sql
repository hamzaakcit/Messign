-- GIN index on knowledge_embeddings.chunk_text for BM25 full-text search
-- Required for hybridSearchChunks (vector 70% + BM25 30%)
-- Runs after knowledge_hub_v12 creates knowledge_embeddings; no-op if table missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_embeddings') THEN
    CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_chunk_fts
      ON knowledge_embeddings
      USING GIN (to_tsvector('english', COALESCE(chunk_text, '')));
  END IF;
END $$;
