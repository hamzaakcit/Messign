-- Migration: Add budgets, AI fields on reimbursement_requests, and ai_financial_action_log
-- Part of Autonomous Financial Management Panel

-- 1. Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  allocated_amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  alert_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  created_by UUID REFERENCES reimbursement_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_org ON budgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_budgets_department ON budgets(department);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_start, period_end);

-- 2. AI fields on reimbursement_requests
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS ai_confidence_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS ai_extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;

-- 3. AI financial action log (audit trail for Dora's financial decisions)
CREATE TABLE IF NOT EXISTS ai_financial_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  related_entity_type TEXT NOT NULL,
  related_entity_id TEXT NOT NULL,
  user_id UUID REFERENCES reimbursement_users(id),
  reasoning TEXT NOT NULL,
  confidence NUMERIC(3,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_financial_log_entity ON ai_financial_action_log(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_financial_log_type ON ai_financial_action_log(action_type);
CREATE INDEX IF NOT EXISTS idx_ai_financial_log_date ON ai_financial_action_log(created_at DESC);
