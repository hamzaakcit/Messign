-- ============================================================
-- 030_consolidate_knowledge.sql
-- Migrate remaining kb_* data to knowledge_* tables.
-- Run after knowledge_hub_v12. Idempotent (ON CONFLICT DO NOTHING).
-- ============================================================

-- Ensure kb_documents has columns added by add_knowledge_hub (may be missing in some setups)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='slug') THEN
    ALTER TABLE kb_documents ADD COLUMN slug VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='category_id') THEN
    ALTER TABLE kb_documents ADD COLUMN category_id UUID REFERENCES kb_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='status') THEN
    ALTER TABLE kb_documents ADD COLUMN status VARCHAR(20) DEFAULT 'published';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='file_url') THEN
    ALTER TABLE kb_documents ADD COLUMN file_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='file_type') THEN
    ALTER TABLE kb_documents ADD COLUMN file_type VARCHAR(30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_documents' AND column_name='published_at') THEN
    ALTER TABLE kb_documents ADD COLUMN published_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  UPDATE kb_documents SET slug = id WHERE slug IS NULL OR slug = '';
END $$;

-- 1. kb_categories → knowledge_categories (any not already migrated)
INSERT INTO knowledge_categories (name, slug, icon, color, sort_order, created_at)
SELECT c.name, c.slug, c.icon, c.color, c.sort_order, COALESCE(c.created_at, NOW())
FROM kb_categories c
WHERE NOT EXISTS (SELECT 1 FROM knowledge_categories k WHERE k.slug = c.slug)
ON CONFLICT (slug) DO NOTHING;

-- 2. kb_tags → knowledge_tags (any not already migrated)
INSERT INTO knowledge_tags (name, slug, created_at)
SELECT t.name, t.slug, COALESCE(t.created_at, NOW())
FROM kb_tags t
WHERE NOT EXISTS (SELECT 1 FROM knowledge_tags k WHERE k.name = t.name)
ON CONFLICT (name) DO NOTHING;

-- 3. kb_documents → knowledge_documents (any not already migrated by slug)
INSERT INTO knowledge_documents (
  title, slug, content, plain_text, excerpt, status, document_type,
  author_id, category_id, is_pinned, view_count, published_at, created_at, updated_at, metadata
)
SELECT
  d.title,
  COALESCE(d.slug, d.id),
  CASE
    WHEN d.content IS NOT NULL AND d.content != '' THEN jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', d.content)))))
    ELSE '{}'::jsonb
  END,
  d.content,
  d.description,
  COALESCE(d.status, 'published')::document_status,
  CASE
    WHEN d.type IN ('faq','tutorial','reference','meeting_note','changelog') THEN d.type::document_type
    ELSE 'guide'::document_type
  END,
  d.author_id,
  (SELECT kc.id FROM knowledge_categories kc JOIN kb_categories oc ON kc.slug = oc.slug WHERE oc.id = d.category_id LIMIT 1),
  COALESCE(d.is_pinned, false),
  COALESCE(d.views, 0),
  COALESCE(d.published_at, d.created_at, NOW()),
  COALESCE(d.created_at, NOW()),
  COALESCE(d.updated_at, NOW()),
  CASE
    WHEN d.file_url IS NOT NULL AND d.file_url != '' THEN jsonb_build_object('attachments', jsonb_build_array(jsonb_build_object('url', d.file_url, 'fileName', d.title || COALESCE('.' || d.file_type, ''), 'fileType', COALESCE(d.file_type, 'file'))))
    ELSE '{}'::jsonb
  END
FROM kb_documents d
WHERE d.slug IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM knowledge_documents k WHERE k.slug = d.slug)
ON CONFLICT (slug) DO NOTHING;

-- 4. kb_document_tags → knowledge_document_tags (map doc via slug, tag via name)
INSERT INTO knowledge_document_tags (document_id, tag_id)
SELECT kd.id, kt.id
FROM kb_document_tags dt
JOIN kb_documents d ON d.id = dt.document_id
JOIN kb_tags bt ON bt.id = dt.tag_id
JOIN knowledge_documents kd ON kd.slug = d.slug
JOIN knowledge_tags kt ON kt.name = bt.name
WHERE NOT EXISTS (SELECT 1 FROM knowledge_document_tags kdt WHERE kdt.document_id = kd.id AND kdt.tag_id = kt.id)
ON CONFLICT DO NOTHING;

-- 5. kb_collections → knowledge_collections (created_by→owner_id, is_public→is_shared; slug, cover_image, share_token have no v2 columns)
INSERT INTO knowledge_collections (name, description, owner_id, is_shared, created_at, updated_at)
SELECT col.name, col.description, col.created_by, col.is_public, col.created_at, col.updated_at
FROM kb_collections col
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_collections k
  WHERE k.name = col.name AND k.owner_id = col.created_by
);

-- 6. kb_collection_documents → knowledge_collection_documents (map collection and doc via slug)
INSERT INTO knowledge_collection_documents (collection_id, document_id, sort_order, added_at)
SELECT kc.id, kd.id, cd.sort_order, NOW()
FROM kb_collection_documents cd
JOIN kb_collections col ON col.id = cd.collection_id
JOIN kb_documents d ON d.id = cd.document_id
JOIN knowledge_collections kc ON kc.name = col.name AND kc.owner_id = col.created_by
JOIN knowledge_documents kd ON kd.slug = d.slug
WHERE NOT EXISTS (SELECT 1 FROM knowledge_collection_documents kcd WHERE kcd.collection_id = kc.id AND kcd.document_id = kd.id)
ON CONFLICT DO NOTHING;

-- 7. kb_flags → knowledge_content_flags (reason truncated to 50; is_resolved = status != 'pending')
INSERT INTO knowledge_content_flags (document_id, flagged_by, reason, description, is_resolved, resolved_by, resolved_at, created_at)
SELECT
  kd.id,
  f.flagged_by,
  LEFT(f.reason, 50),
  f.resolved_note,
  COALESCE(f.status != 'pending', false),
  f.resolved_by,
  f.resolved_at,
  f.created_at
FROM kb_flags f
JOIN kb_documents d ON d.id = f.document_id
JOIN knowledge_documents kd ON kd.slug = d.slug
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_content_flags kf
  WHERE kf.document_id = kd.id AND kf.flagged_by = f.flagged_by AND kf.created_at = f.created_at
);

-- 8. kb_user_pins → knowledge_bookmarks
INSERT INTO knowledge_bookmarks (user_id, document_id)
SELECT p.user_id, kd.id
FROM kb_user_pins p
JOIN kb_documents d ON d.id = p.document_id
JOIN knowledge_documents kd ON kd.slug = d.slug
WHERE NOT EXISTS (SELECT 1 FROM knowledge_bookmarks kb WHERE kb.user_id = p.user_id AND kb.document_id = kd.id)
ON CONFLICT (user_id, document_id) DO NOTHING;

-- 9. kb_acknowledgements: no knowledge_* equivalent; required-reading tracking not migrated.

-- 10. kb_activities: no direct equivalent; knowledge_audit_log has different schema. Skipped.

-- ============================================================
-- DROP statements (moved to 032_drop_kb_tables.sql — run after verifying migration)
-- ============================================================
