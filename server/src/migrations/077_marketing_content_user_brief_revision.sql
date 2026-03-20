-- Original content request + revision snapshots for approval queue UX / AI rewrite loop

ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS user_brief TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS revision_history JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN marketing_content.user_brief IS 'Original user/marketing brief for regeneration after human rejection';
COMMENT ON COLUMN marketing_content.revision_history IS 'JSON array of prior draft snapshots {version,label,savedAt,body,feedback?,rejection_reason?}';
