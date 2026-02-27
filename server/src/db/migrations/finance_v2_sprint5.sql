-- Finance v2 Sprint 5: SLA Monitoring, Notification Preferences, Approval Workflows
-- All statements are idempotent

-- ============================================================
-- 1. SLA columns on approval_steps
-- ============================================================
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS sla_deadline_hours INTEGER DEFAULT 48,
  ADD COLUMN IF NOT EXISTS sla_reminder_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_escalated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- ============================================================
-- 2. Notification preferences (stored per-user)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- ============================================================
-- 3. Approval workflow configuration (org-level)
-- ============================================================
ALTER TABLE finance_settings
  ADD COLUMN IF NOT EXISTS approval_workflow_config JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

-- ============================================================
-- 4. Dora scheduled job run tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_dora_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  job_name VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  result JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_dora_job_runs_org ON finance_dora_job_runs(organization_id, job_name);

-- ============================================================
-- 5. Add date_from/date_to filter support to audit log
-- ============================================================
ALTER TABLE finance_audit_log
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info';

-- Back-fill flagged events as warnings (only if is_flagged column exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finance_audit_log' AND column_name = 'is_flagged') THEN
    EXECUTE 'UPDATE finance_audit_log SET severity = ''warning'' WHERE is_flagged = TRUE AND severity = ''info''';
  END IF;
END $$;
