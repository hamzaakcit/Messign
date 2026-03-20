-- ============================================================================
-- Migration 082: target_channel enum + Instagram Meta tracking + GIN on metadata
-- ============================================================================
-- Notes:
-- - `target_channel` is optional: only runs if the enum exists (some DBs use VARCHAR).
-- - We do NOT add a narrow CHECK on marketing_content.channel — the app uses many
--   channels (blog, email, linkedin, social, x, instagram, …). Tight checks belong
--   in app validation or a constraint that lists every allowed value you actually use.
-- ============================================================================

-- 1) Add 'instagram' to target_channel when that enum exists (idempotent, PG11+).
--    Uses pg_enum probe so we avoid duplicate_label without requiring PG15 IF NOT EXISTS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'target_channel' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'target_channel'
        AND e.enumlabel = 'instagram'
    ) THEN
      ALTER TYPE target_channel ADD VALUE 'instagram';
    END IF;
  END IF;
END $$;

-- 2) Columns: 081 may already have image_* / visual_* / metadata — only add gaps.
ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS visual_description TEXT;

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS image_generation_metadata JSONB;

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT;

COMMENT ON COLUMN marketing_content.instagram_media_id IS
  'Meta / Instagram media id after publish (Graph API) for reconciliation and edits.';

-- 3) GIN index for JSONB metadata search (optional analytics / debugging queries)
CREATE INDEX IF NOT EXISTS idx_marketing_content_ig_metadata
  ON marketing_content USING GIN (image_generation_metadata);
