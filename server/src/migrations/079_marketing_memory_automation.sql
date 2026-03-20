-- Golden examples (Learner / nightly jobs) + marketing automation triggers

CREATE TABLE IF NOT EXISTS marketing_golden_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  performance_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  success_markers TEXT[] DEFAULT '{}',
  segment TEXT,
  channel TEXT,
  embedding_stored BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_golden_org ON marketing_golden_examples(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_golden_created ON marketing_golden_examples(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_automation_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type VARCHAR(32) NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'threshold', 'webhook')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  hitl_mode VARCHAR(32) NOT NULL DEFAULT 'draft_and_wait' CHECK (hitl_mode IN ('autopilot', 'draft_and_wait', 'escalation')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_auto_trig_org ON marketing_automation_triggers(organization_id);
CREATE INDEX IF NOT EXISTS idx_mkt_auto_trig_enabled ON marketing_automation_triggers(organization_id, enabled);

COMMENT ON TABLE marketing_golden_examples IS 'High-performing content examples for marketing memory (typically written by Learner job)';
COMMENT ON TABLE marketing_automation_triggers IS 'Marketing automation trigger definitions (schedule, event, threshold, webhook)';
