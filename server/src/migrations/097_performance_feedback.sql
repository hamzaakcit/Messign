-- ═══════════════════════════════════════════
-- Migration 097: Performance Feedback Loop
-- Stores per-content campaign metrics for
-- the calibration feedback loop.
-- ═══════════════════════════════════════════

-- 1. Table

CREATE TABLE IF NOT EXISTS performance_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Content reference
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,

  -- Email-specific metrics
  subject_line TEXT,
  open_rate NUMERIC(5,4),
  click_through_rate NUMERIC(5,4),
  conversion_rate NUMERIC(5,4),
  unsubscribe_rate NUMERIC(5,4),
  bounce_rate NUMERIC(5,4),

  -- Social metrics
  engagement_rate NUMERIC(5,4),
  reach INTEGER,
  impressions INTEGER,

  -- Content characteristics (for pattern extraction)
  tone_tags TEXT[] DEFAULT '{}',
  visual_style TEXT,
  theme_used TEXT,
  section_count INTEGER,
  hero_image_used BOOLEAN DEFAULT false,
  cta_variant TEXT,
  subject_length INTEGER,

  -- Volume
  send_count INTEGER DEFAULT 0,

  -- Brand profile association (for Month 4 brand isolation)
  brand_profile_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign_period_start DATE,
  campaign_period_end DATE,

  -- Prevent duplicate recordings per content
  UNIQUE(organization_id, content_id, channel, recorded_at)
);

-- ═══════════════════════════════════════════
-- 2. Indexes
-- ═══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_perf_feedback_org_open
  ON performance_feedback(organization_id, open_rate DESC)
  WHERE send_count >= 500;

CREATE INDEX IF NOT EXISTS idx_perf_feedback_org_channel
  ON performance_feedback(organization_id, channel, open_rate DESC);

CREATE INDEX IF NOT EXISTS idx_perf_feedback_brand
  ON performance_feedback(organization_id, brand_profile_id)
  WHERE brand_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_perf_feedback_org_recorded
  ON performance_feedback(organization_id, recorded_at DESC);

-- ═══════════════════════════════════════════
-- 3. Row-Level Security
-- ═══════════════════════════════════════════

ALTER TABLE performance_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perf_feedback_org_isolation ON performance_feedback;
CREATE POLICY perf_feedback_org_isolation ON performance_feedback
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);
