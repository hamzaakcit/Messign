-- =====================================================================
-- MESSIGN WORKSPACE — KNOWLEDGE HUB v1.2 DATABASE MIGRATION
-- Engine: PostgreSQL | Driver: pg (node-postgres) | Pattern: Raw SQL
-- All statements are idempotent (safe to run multiple times)
-- =====================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Try pgvector; skip gracefully if not available
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available — semantic search will be disabled';
END $$;

-- ===================== ENUMS =====================

DO $$ BEGIN CREATE TYPE knowledge_role AS ENUM ('admin','cpo','editor','reviewer','viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_status AS ENUM ('draft','in_review','published','archived','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('guide','faq','specification','roadmap','meeting_note','micro_learn','announcement','template','sop','policy'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE review_action_type AS ENUM ('approved','rejected','requested_changes'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE kh_notification_type AS ENUM ('review_requested','document_approved','document_rejected','comment_added','mention','content_stale','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================== KNOWLEDGE USER ROLES =====================

CREATE TABLE IF NOT EXISTS knowledge_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  role knowledge_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ===================== KNOWLEDGE TEAMS =====================

CREATE TABLE IF NOT EXISTS knowledge_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES knowledge_teams(id) ON DELETE CASCADE,
  user_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- ===================== CATEGORIES (nested tree) =====================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  parent_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_categories_parent ON knowledge_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_kh_categories_slug ON knowledge_categories(slug);

-- ===================== TAGS =====================

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(7),
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================== DOCUMENTS =====================

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}',
  plain_text TEXT,
  excerpt VARCHAR(500),
  cover_image VARCHAR(500),

  status document_status NOT NULL DEFAULT 'draft',
  document_type document_type NOT NULL DEFAULT 'guide',
  metadata JSONB DEFAULT '{}',

  author_id VARCHAR(100) NOT NULL,
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,

  is_public BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,

  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_docs_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_kh_docs_type ON knowledge_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_kh_docs_author ON knowledge_documents(author_id);
CREATE INDEX IF NOT EXISTS idx_kh_docs_category ON knowledge_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_kh_docs_slug ON knowledge_documents(slug);
CREATE INDEX IF NOT EXISTS idx_kh_docs_updated ON knowledge_documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_kh_docs_published ON knowledge_documents(published_at);
CREATE INDEX IF NOT EXISTS idx_kh_docs_search ON knowledge_documents USING gin(to_tsvector('english', COALESCE(plain_text, '')));
CREATE INDEX IF NOT EXISTS idx_kh_docs_title_trgm ON knowledge_documents USING gin(title gin_trgm_ops);

-- ===================== DOCUMENT-TAG JUNCTION =====================

CREATE TABLE IF NOT EXISTS knowledge_document_tags (
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES knowledge_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- ===================== TEAM ACCESS =====================

CREATE TABLE IF NOT EXISTS knowledge_team_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES knowledge_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_kh_team_access_doc ON knowledge_team_access(document_id);
CREATE INDEX IF NOT EXISTS idx_kh_team_access_team ON knowledge_team_access(team_id);

-- ===================== VERSIONS =====================

CREATE TABLE IF NOT EXISTS knowledge_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content JSONB NOT NULL,
  plain_text TEXT,
  change_note VARCHAR(500),
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_kh_versions_doc ON knowledge_document_versions(document_id);

-- ===================== INLINE COMMENTS =====================

CREATE TABLE IF NOT EXISTS knowledge_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  author_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  selection_from INTEGER,
  selection_to INTEGER,
  selected_text VARCHAR(500),
  parent_id UUID REFERENCES knowledge_comments(id) ON DELETE CASCADE,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_comments_doc ON knowledge_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_kh_comments_parent ON knowledge_comments(parent_id);

-- ===================== REVIEW ACTIONS =====================

CREATE TABLE IF NOT EXISTS knowledge_review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  reviewer_id VARCHAR(100) NOT NULL,
  action review_action_type NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_reviews_doc ON knowledge_review_actions(document_id);

-- ===================== DOCUMENT LINKS (Backlinks) =====================

CREATE TABLE IF NOT EXISTS knowledge_document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, target_id),
  CHECK (source_id != target_id)
);

CREATE INDEX IF NOT EXISTS idx_kh_links_source ON knowledge_document_links(source_id);
CREATE INDEX IF NOT EXISTS idx_kh_links_target ON knowledge_document_links(target_id);

-- ===================== FILE ATTACHMENTS =====================

CREATE TABLE IF NOT EXISTS knowledge_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  ocr_text TEXT,
  uploaded_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_attachments_doc ON knowledge_attachments(document_id);

-- ===================== BOOKMARKS =====================

CREATE TABLE IF NOT EXISTS knowledge_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

-- ===================== COLLECTIONS =====================

CREATE TABLE IF NOT EXISTS knowledge_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  owner_id VARCHAR(100) NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_collection_documents (
  collection_id UUID NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, document_id)
);

-- ===================== ANALYTICS: VIEWS =====================

CREATE TABLE IF NOT EXISTS knowledge_document_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  user_id VARCHAR(100) NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kh_views_doc ON knowledge_document_views(document_id);
CREATE INDEX IF NOT EXISTS idx_kh_views_user ON knowledge_document_views(user_id);
CREATE INDEX IF NOT EXISTS idx_kh_views_date ON knowledge_document_views(viewed_at);

-- ===================== ANALYTICS: SEARCH LOGS =====================

CREATE TABLE IF NOT EXISTS knowledge_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  clicked_document_id UUID REFERENCES knowledge_documents(id),
  search_type VARCHAR(20) DEFAULT 'keyword',
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_search_date ON knowledge_search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_kh_search_query ON knowledge_search_logs USING gin(query gin_trgm_ops);

-- ===================== AI FEEDBACK =====================

CREATE TABLE IF NOT EXISTS knowledge_ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_document_ids UUID[] DEFAULT '{}',
  is_helpful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================== NOTIFICATIONS =====================

CREATE TABLE IF NOT EXISTS knowledge_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  type kh_notification_type NOT NULL,
  title VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_document_id UUID REFERENCES knowledge_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_notifications_user ON knowledge_notifications(user_id, is_read);

-- ===================== AUDIT LOG =====================

CREATE TABLE IF NOT EXISTS knowledge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_audit_entity ON knowledge_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_kh_audit_user ON knowledge_audit_log(user_id, created_at);

-- ===================== EMBEDDINGS (pgvector) =====================
-- Only created if pgvector is available

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_kh_embeddings_doc ON knowledge_embeddings(document_id);
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Skipping knowledge_embeddings — pgvector not available';
END $$;

-- ===================== CONTENT FLAGS =====================

CREATE TABLE IF NOT EXISTS knowledge_content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  flagged_by VARCHAR(100) NOT NULL,
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by VARCHAR(100),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kh_flags_doc ON knowledge_content_flags(document_id);
CREATE INDEX IF NOT EXISTS idx_kh_flags_unresolved ON knowledge_content_flags(is_resolved) WHERE is_resolved = false;

-- ===================== DATA MIGRATION from kb_* =====================

-- Migrate categories
INSERT INTO knowledge_categories (name, slug, icon, color, sort_order, created_at)
SELECT name, slug, icon, color, sort_order, COALESCE(created_at, NOW())
FROM kb_categories
ON CONFLICT (slug) DO NOTHING;

-- Migrate tags
INSERT INTO knowledge_tags (name, slug, created_at)
SELECT name, slug, COALESCE(created_at, NOW())
FROM kb_tags
ON CONFLICT (name) DO NOTHING;

-- Migrate documents
INSERT INTO knowledge_documents (
  id, title, slug, content, plain_text, status, document_type,
  author_id, category_id, is_pinned, view_count, published_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  d.title,
  d.slug,
  CASE
    WHEN d.content IS NOT NULL AND d.content != '' THEN jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', d.content)))))
    ELSE '{}'::jsonb
  END,
  d.content,
  COALESCE(d.status, 'published')::document_status,
  'guide'::document_type,
  d.author_id,
  (SELECT kc.id FROM knowledge_categories kc JOIN kb_categories oc ON kc.slug = oc.slug WHERE oc.id::text = d.category_id::text LIMIT 1),
  COALESCE(d.is_pinned, false),
  COALESCE(d.views, 0),
  COALESCE(d.published_at, d.created_at, NOW()),
  COALESCE(d.created_at, NOW()),
  COALESCE(d.updated_at, NOW())
FROM kb_documents d
WHERE d.slug IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

-- Seed admin roles for existing admin users
INSERT INTO knowledge_user_roles (user_id, role)
SELECT id, 'admin'::knowledge_role
FROM reimbursement_users
WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;
