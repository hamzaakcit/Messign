-- WP-09: CSV import records. One row per uploaded file: the job's input, progress and a value-free error report.
-- The uploaded CSV is personal data, so `content` is cleared as soon as the job finishes (the engage role may update
-- it); rows are never deleted so the history of what was imported stays.

CREATE TABLE IF NOT EXISTS engage.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('profiles', 'orders')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  dry_run boolean NOT NULL DEFAULT false,
  content text,
  rows_total integer,
  rows_processed integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS imports_org_idx ON engage.imports (organization_id, created_at DESC);

ALTER TABLE engage.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE engage.imports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON engage.imports;
CREATE POLICY tenant_isolation ON engage.imports FOR ALL
  USING (organization_id = engage.current_org_id())
  WITH CHECK (organization_id = engage.current_org_id());

REVOKE UPDATE, DELETE ON engage.imports FROM messign_engage;
GRANT UPDATE (status, content, rows_total, rows_processed, counts, errors, error_message, started_at, finished_at) ON engage.imports TO messign_engage;
