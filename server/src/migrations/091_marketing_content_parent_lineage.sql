-- Content lineage for repurposing (one source → many channel variants)
ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS parent_content_id UUID REFERENCES marketing_content(id);

CREATE INDEX IF NOT EXISTS idx_marketing_content_parent
  ON marketing_content (parent_content_id)
  WHERE parent_content_id IS NOT NULL;

COMMENT ON COLUMN marketing_content.parent_content_id IS
  'Links repurposed content back to its source. NULL = original content.';
