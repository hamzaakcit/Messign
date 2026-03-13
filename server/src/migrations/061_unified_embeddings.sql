-- Migration: 061_unified_embeddings.sql
-- Sprint 7–8: Cross-Module RAG — Unified embeddings for CRM, support, chat, HR, knowledge
-- Requires: pgvector extension
-- Skips if pgvector not installed (e.g. local dev without vector support)
-- RLS uses current_tenant_id() — create if missing (matches db/migrations/002_enable_rls)

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::UUID;
$$ LANGUAGE sql STABLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE NOTICE 'pgvector not installed, skipping 061_unified_embeddings';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS entity_embeddings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,

    -- Source identification
    source_module TEXT NOT NULL,        -- 'crm', 'support', 'knowledge', 'chat', 'hr'
    source_type   TEXT NOT NULL,        -- 'deal_note', 'ticket_message', 'document_chunk', 'chat_message'
    source_id     UUID NOT NULL,       -- ID of the source record

    -- Content
    content_text  TEXT NOT NULL,       -- original text that was embedded
    metadata      JSONB DEFAULT '{}',  -- flexible: { deal_id, contact_name, ticket_id, ... }

    -- Vector
    embedding     vector(1536) NOT NULL, -- text-embedding-3-small dimensions

    -- Access control for permission-aware RAG
    access_roles  TEXT[] DEFAULT '{}',  -- roles that can access this embedding
    sensitivity   TEXT DEFAULT 'normal', -- 'normal', 'confidential', 'restricted'

    -- Timestamps
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE entity_embeddings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE entity_embeddings FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation ON entity_embeddings;
  CREATE POLICY tenant_isolation ON entity_embeddings
    FOR ALL USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

  CREATE INDEX IF NOT EXISTS idx_entity_embeddings_hnsw
    ON entity_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

  CREATE INDEX IF NOT EXISTS idx_entity_embeddings_source
    ON entity_embeddings (tenant_id, source_module, source_type);

  CREATE INDEX IF NOT EXISTS idx_entity_embeddings_metadata
    ON entity_embeddings USING gin (metadata);

  RAISE NOTICE 'entity_embeddings table created';
END $$;
