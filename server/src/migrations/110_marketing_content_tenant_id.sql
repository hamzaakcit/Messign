-- marketing_content.tenant_id matches organization_id. Live rows already require it.
ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE marketing_content
SET tenant_id = organization_id
WHERE tenant_id IS NULL
  AND organization_id IS NOT NULL;

ALTER TABLE marketing_content DROP CONSTRAINT IF EXISTS marketing_content_content_type_check;
ALTER TABLE marketing_content ADD CONSTRAINT marketing_content_content_type_check
  CHECK (content_type IN (
    'blog', 'social', 'email', 'video', 'webinar', 'case_study',
    'whitepaper', 'infographic', 'podcast', 'other', 'offer'
  ));
