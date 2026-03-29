-- ═══════════════════════════════════════════
-- Migration 109: Performance calibration snapshots
-- Periodic aggregates for Content Strategist prompt (Phase 7).
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calibration_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  emails_sent INTEGER NOT NULL DEFAULT 0,
  avg_open_rate DOUBLE PRECISION,
  avg_click_rate DOUBLE PRECISION,
  avg_bounce_rate DOUBLE PRECISION,
  avg_complaint_rate DOUBLE PRECISION,

  top_subjects JSONB,
  top_ctas JSONB,
  top_sections JSONB,
  top_hooks JSONB,

  bottom_subjects JSONB,
  bottom_ctas JSONB,

  detected_patterns JSONB,

  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_snapshots_org_date
  ON calibration_snapshots(organization_id, snapshot_date DESC);

ALTER TABLE calibration_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calibration_snapshots_tenant_isolation ON calibration_snapshots;
CREATE POLICY calibration_snapshots_tenant_isolation ON calibration_snapshots
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);
