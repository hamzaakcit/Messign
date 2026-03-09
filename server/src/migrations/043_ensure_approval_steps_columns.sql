-- Ensure approval_steps has columns required by finance seed (for DBs where 038 was skipped)
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS step_name VARCHAR(100);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS approver_role VARCHAR(50);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS delegated_to_id UUID;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2);
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS ai_reason TEXT;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_approval_entity ON approval_steps(entity_type, entity_id);
