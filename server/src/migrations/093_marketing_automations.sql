BEGIN;

-- Automation definitions
CREATE TABLE IF NOT EXISTS marketing_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Trigger
  trigger_type VARCHAR(30) NOT NULL CHECK (trigger_type IN (
    'schedule', 'event', 'threshold', 'manual'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  condition JSONB DEFAULT NULL,

  -- Actions
  actions JSONB NOT NULL DEFAULT '[]',

  -- HITL mode
  hitl_mode VARCHAR(20) DEFAULT 'draft_and_wait' CHECK (hitl_mode IN (
    'autopilot', 'draft_and_wait', 'escalation'
  )),

  -- State
  enabled BOOLEAN DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  fire_count INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  CONSTRAINT marketing_automations_org_fk
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_automations_org_enabled
  ON marketing_automations (organization_id, enabled, trigger_type)
  WHERE enabled = true;

-- Execution log
CREATE TABLE IF NOT EXISTS marketing_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  automation_id UUID NOT NULL REFERENCES marketing_automations(id) ON DELETE CASCADE,

  trigger_event JSONB,
  actions_executed JSONB,
  content_ids UUID[],

  status VARCHAR(20) NOT NULL CHECK (status IN (
    'success', 'partial', 'failed', 'skipped'
  )),
  error TEXT,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON marketing_automation_runs (automation_id, created_at DESC);

-- RLS
ALTER TABLE marketing_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mktg_automations_tenant ON marketing_automations;
CREATE POLICY mktg_automations_tenant ON marketing_automations
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);

DROP POLICY IF EXISTS mktg_automation_runs_tenant ON marketing_automation_runs;
CREATE POLICY mktg_automation_runs_tenant ON marketing_automation_runs
  USING (organization_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant', true)::uuid);

COMMIT;
