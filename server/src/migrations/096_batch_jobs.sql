-- Automated Batching — hero asset atomization
-- Month 2, Session 1

-- ═══════════════════════════════════════════
-- 1. Extend marketing_content for batch linking
-- ═══════════════════════════════════════════
-- parent_content_id already exists from 091_marketing_content_parent_lineage.sql

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS batch_job_id UUID;

ALTER TABLE marketing_content
  ADD COLUMN IF NOT EXISTS is_hero_asset BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_marketing_content_batch_job_id
  ON marketing_content(batch_job_id)
  WHERE batch_job_id IS NOT NULL;

-- ═══════════════════════════════════════════
-- 2. batch_jobs table
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hero_content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial', 'cancelled')),

  channels TEXT[] NOT NULL DEFAULT '{}',

  total_channels INTEGER NOT NULL DEFAULT 0,
  completed_channels INTEGER NOT NULL DEFAULT 0,
  failed_channels INTEGER NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  pgboss_job_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_org_created
  ON batch_jobs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_org_status
  ON batch_jobs(organization_id, status)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_batch_jobs_hero_content
  ON batch_jobs(hero_content_id);

-- ═══════════════════════════════════════════
-- 3. Row-Level Security
-- ═══════════════════════════════════════════

ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_jobs_tenant ON batch_jobs;
CREATE POLICY batch_jobs_tenant ON batch_jobs
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);

-- ═══════════════════════════════════════════
-- 4. FK from marketing_content.batch_job_id
-- ═══════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'marketing_content_batch_job_id_fkey'
  ) THEN
    ALTER TABLE marketing_content
      ADD CONSTRAINT marketing_content_batch_job_id_fkey
      FOREIGN KEY (batch_job_id) REFERENCES batch_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;
