-- Dora Phase 2 — RAG Pipeline Database Migration
-- Creates document_chunks and document_summaries tables for the new RAG system.
-- Skips if pgvector extension is not installed (e.g. local dev without pgvector).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE NOTICE 'pgvector not installed, skipping rag_phase2';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    heading TEXT,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    metadata JSONB NOT NULL DEFAULT '{}',
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS document_summaries (
    document_id UUID PRIMARY KEY REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    key_topics JSONB NOT NULL DEFAULT '[]',
    audience TEXT NOT NULL DEFAULT 'All employees',
    complexity TEXT NOT NULL DEFAULT 'basic',
    content_hash TEXT NOT NULL,
    last_summarized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_dc_document_id ON document_chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_dc_content_tsv ON document_chunks USING GIN(content_tsv);
  CREATE INDEX IF NOT EXISTS idx_dc_metadata ON document_chunks USING GIN(metadata);
  CREATE INDEX IF NOT EXISTS idx_dc_embedding_hnsw ON document_chunks USING hnsw(embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
END $$;
