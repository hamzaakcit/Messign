-- ============================================================
-- Knowledge Hub: new tables + alter kb_documents
-- All statements are idempotent (safe to run multiple times)
-- ============================================================

-- 1. Categories
CREATE TABLE IF NOT EXISTS kb_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    icon VARCHAR(100),
    color VARCHAR(20),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tags
CREATE TABLE IF NOT EXISTS kb_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Document-Tag join table
CREATE TABLE IF NOT EXISTS kb_document_tags (
    document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES kb_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

-- 4. Collections
CREATE TABLE IF NOT EXISTS kb_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL UNIQUE,
    description TEXT,
    cover_image TEXT,
    share_token VARCHAR(100) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Collection-Document join table
CREATE TABLE IF NOT EXISTS kb_collection_documents (
    collection_id UUID NOT NULL REFERENCES kb_collections(id) ON DELETE CASCADE,
    document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, document_id)
);

-- 6. Acknowledgements (required reading tracking)
CREATE TABLE IF NOT EXISTS kb_acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (document_id, user_id)
);

-- 7. Flags (report as outdated)
CREATE TABLE IF NOT EXISTS kb_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    flagged_by VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolved_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_flags_status ON kb_flags(status);
CREATE INDEX IF NOT EXISTS idx_kb_flags_document ON kb_flags(document_id);

-- 8. User Pins (personal shortcuts)
CREATE TABLE IF NOT EXISTS kb_user_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    document_id VARCHAR(100) NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, document_id)
);

-- 9. Activity log
CREATE TABLE IF NOT EXISTS kb_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL,
    document_id VARCHAR(100),
    collection_id UUID,
    user_id VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_activities_created ON kb_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_activities_document ON kb_activities(document_id);

-- ============================================================
-- 10. Alter existing kb_documents to add new columns
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='slug') THEN
    ALTER TABLE kb_documents ADD COLUMN slug VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='file_url') THEN
    ALTER TABLE kb_documents ADD COLUMN file_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='file_type') THEN
    ALTER TABLE kb_documents ADD COLUMN file_type VARCHAR(30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='file_size_bytes') THEN
    ALTER TABLE kb_documents ADD COLUMN file_size_bytes INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='thumbnail_url') THEN
    ALTER TABLE kb_documents ADD COLUMN thumbnail_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='version') THEN
    ALTER TABLE kb_documents ADD COLUMN version INT DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='version_label') THEN
    ALTER TABLE kb_documents ADD COLUMN version_label VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='previous_version_id') THEN
    ALTER TABLE kb_documents ADD COLUMN previous_version_id VARCHAR(100) REFERENCES kb_documents(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='category_id') THEN
    ALTER TABLE kb_documents ADD COLUMN category_id UUID REFERENCES kb_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='status') THEN
    ALTER TABLE kb_documents ADD COLUMN status VARCHAR(20) DEFAULT 'published';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='is_required_reading') THEN
    ALTER TABLE kb_documents ADD COLUMN is_required_reading BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='required_for_roles') THEN
    ALTER TABLE kb_documents ADD COLUMN required_for_roles JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='pin_order') THEN
    ALTER TABLE kb_documents ADD COLUMN pin_order INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='download_count') THEN
    ALTER TABLE kb_documents ADD COLUMN download_count INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='published_at') THEN
    ALTER TABLE kb_documents ADD COLUMN published_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='new_badge_until') THEN
    ALTER TABLE kb_documents ADD COLUMN new_badge_until TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kb_documents' AND column_name='last_updated_by') THEN
    ALTER TABLE kb_documents ADD COLUMN last_updated_by VARCHAR(100);
  END IF;
END $$;

-- Backfill slugs for existing rows
UPDATE kb_documents SET slug = id WHERE slug IS NULL;

-- Add unique index on slug (skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='kb_documents' AND indexname='kb_documents_slug_unique') THEN
    CREATE UNIQUE INDEX kb_documents_slug_unique ON kb_documents(slug);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kb_documents_category ON kb_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status);
CREATE INDEX IF NOT EXISTS idx_kb_documents_published ON kb_documents(published_at DESC);

-- ============================================================
-- 11. Seed default categories
-- ============================================================
INSERT INTO kb_categories (name, slug, icon, color, sort_order) VALUES
  ('Brand Portal', 'brand-portal', 'Palette', '#6366f1', 1),
  ('Sales Enablement', 'sales-enablement', 'TrendingUp', '#22c55e', 2),
  ('Operations & HR', 'operations-hr', 'FileText', '#f59e0b', 3),
  ('IT & Tools', 'it-tools', 'Monitor', '#3b82f6', 4)
ON CONFLICT (name) DO NOTHING;
