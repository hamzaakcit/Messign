-- Ensures entity_type, entity_id, step_name exist on approval_steps (required for expense approval flow)
-- These are normally added by finance_v12_schema.sql; this migration is defensive for DBs that skipped it.
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS step_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approver_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS delegated_to_id UUID REFERENCES reimbursement_users(id),
  ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS ai_reason TEXT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_entity ON approval_steps(entity_type, entity_id);
