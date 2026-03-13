-- ════════════════════════════════════════
-- Dora Autonomous Mode — Automation Policies
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dora_automation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  trigger_event VARCHAR(100) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_type VARCHAR(100) NOT NULL,
  action_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  scope VARCHAR(20) NOT NULL DEFAULT 'team' CHECK (scope IN ('personal', 'team', 'department', 'organization')),
  scope_department VARCHAR(100),
  scope_team_id UUID REFERENCES performance_teams(id) ON DELETE SET NULL,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  last_execution_result VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dora_policies_trigger ON dora_automation_policies(trigger_event);
CREATE INDEX IF NOT EXISTS idx_dora_policies_active ON dora_automation_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_dora_policies_creator ON dora_automation_policies(created_by);

CREATE TABLE IF NOT EXISTS dora_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES dora_automation_policies(id) ON DELETE CASCADE,
  trigger_event VARCHAR(100) NOT NULL,
  trigger_payload JSONB NOT NULL,
  conditions_evaluated JSONB NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  action_params JSONB NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  execution_status VARCHAR(20) NOT NULL CHECK (execution_status IN ('auto_executed', 'queued_for_approval', 'executed_with_notification', 'skipped', 'failed')),
  result JSONB,
  error_message TEXT,
  executed_by VARCHAR(50) DEFAULT 'dora',
  confirmed_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  can_undo BOOLEAN DEFAULT true,
  undo_deadline TIMESTAMPTZ,
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dora_auto_log_policy ON dora_automation_log(policy_id);
CREATE INDEX IF NOT EXISTS idx_dora_auto_log_status ON dora_automation_log(execution_status);
CREATE INDEX IF NOT EXISTS idx_dora_auto_log_created ON dora_automation_log(created_at);

INSERT INTO dora_automation_policies (
  organization_id, created_by, name, description, trigger_event, conditions,
  action_type, action_params, risk_level, scope, is_active
)
SELECT
  admin.organization_id,
  admin.id,
  'Auto-approve small expenses',
  'Automatically approve expenses under EUR 50 in Office Supplies.',
  'finance.expense.submitted',
  '[{"field": "amount", "operator": "lte", "value": 50}, {"field": "category", "operator": "eq", "value": "Office Supplies"}]'::jsonb,
  'finance:approve_expense',
  '{"reason": "Auto-approved by Dora: amount under EUR 50 policy"}'::jsonb,
  'low',
  'organization',
  false
FROM reimbursement_users admin
WHERE admin.role = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO dora_automation_policies (
  organization_id, created_by, name, description, trigger_event, conditions,
  action_type, action_params, risk_level, scope, is_active
)
SELECT
  admin.organization_id,
  admin.id,
  'Auto-assign support tickets by category',
  'Route new tickets to a designated assignee based on category defaults.',
  'support.ticket.created',
  '[]'::jsonb,
  'assign_ticket',
  '{"strategy": "category_default"}'::jsonb,
  'low',
  'organization',
  false
FROM reimbursement_users admin
WHERE admin.role = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO dora_automation_policies (
  organization_id, created_by, name, description, trigger_event, conditions,
  action_type, action_params, risk_level, scope, is_active
)
SELECT
  admin.organization_id,
  admin.id,
  'Auto-close resolved tickets after 48h',
  'Close resolved tickets if the customer has not responded in 48 hours.',
  'support.ticket.resolved',
  '[]'::jsonb,
  'close_ticket_after_delay',
  '{"delay_hours": 48, "message": "This ticket has been auto-closed after 48h with no response."}'::jsonb,
  'low',
  'organization',
  false
FROM reimbursement_users admin
WHERE admin.role = 'admin'
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'actual_hours'
  ) THEN
    ALTER TABLE tasks ADD COLUMN actual_hours DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;
