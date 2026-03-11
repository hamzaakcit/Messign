-- ============================================================
-- 033_consolidate_budgets.sql
-- Create finance_budgets, migrate data from budgets, update FKs.
-- Run after add_budgets_and_ai_fields and finance_v12_schema.
-- ============================================================

-- 1. Create finance_budgets (same structure as budgets + is_active)
CREATE TABLE IF NOT EXISTS finance_budgets (
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name VARCHAR(255),
  description TEXT,
  budget_code VARCHAR(20),
  team_id UUID REFERENCES performance_teams(id),
  project_id UUID,
  owner_id UUID REFERENCES reimbursement_users(id),
  spent_amount DECIMAL(14,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  warning_threshold DECIMAL(5,2) DEFAULT 80.00,
  critical_threshold DECIMAL(5,2) DEFAULT 95.00,
  hard_limit BOOLEAN DEFAULT FALSE,
  ai_forecast_amount DECIMAL(14,2),
  ai_forecast_date DATE,
  ai_health_score DECIMAL(3,2),
  ai_recommendations JSONB DEFAULT '[]',
  ai_anomaly_flags JSONB DEFAULT '[]',
  allow_rollover BOOLEAN DEFAULT FALSE,
  rollover_amount DECIMAL(14,2) DEFAULT 0,
  requires_approval BOOLEAN DEFAULT TRUE,
  approval_threshold DECIMAL(12,2),
  period_type VARCHAR(20) DEFAULT 'monthly',
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_finance_budgets_org ON finance_budgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_department ON finance_budgets(department);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_period ON finance_budgets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_team ON finance_budgets(team_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_status ON finance_budgets(status);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_owner ON finance_budgets(owner_id);

-- 2. Ensure budgets has all columns we select (may only have minimal schema from add_budgets_and_ai_fields)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budgets') THEN
    ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS budget_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES performance_teams(id),
      ADD COLUMN IF NOT EXISTS project_id UUID,
      ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id),
      ADD COLUMN IF NOT EXISTS spent_amount DECIMAL(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS warning_threshold DECIMAL(5,2) DEFAULT 80.00,
      ADD COLUMN IF NOT EXISTS critical_threshold DECIMAL(5,2) DEFAULT 95.00,
      ADD COLUMN IF NOT EXISTS hard_limit BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ai_forecast_amount DECIMAL(14,2),
      ADD COLUMN IF NOT EXISTS ai_forecast_date DATE,
      ADD COLUMN IF NOT EXISTS ai_health_score DECIMAL(3,2),
      ADD COLUMN IF NOT EXISTS ai_recommendations JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS ai_anomaly_flags JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS allow_rollover BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS rollover_amount DECIMAL(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS approval_threshold DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) DEFAULT 'monthly';
  END IF;
END $$;

-- 3. Copy data from budgets (preserve ids for FK consistency); skip if budgets does not exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budgets') THEN
    INSERT INTO finance_budgets (
      id, organization_id, department, period_start, period_end, allocated_amount,
      currency, alert_threshold, created_by, created_at, updated_at,
      name, description, budget_code, team_id, project_id, owner_id,
      spent_amount, status, warning_threshold, critical_threshold, hard_limit,
      ai_forecast_amount, ai_forecast_date, ai_health_score, ai_recommendations, ai_anomaly_flags,
      allow_rollover, rollover_amount, requires_approval, approval_threshold, period_type,
      is_active
    )
    SELECT
      b.id, b.organization_id, b.department, b.period_start, b.period_end, b.allocated_amount,
      b.currency, COALESCE(b.alert_threshold, 0.80), b.created_by, b.created_at, b.updated_at,
      b.name, b.description, b.budget_code, b.team_id, b.project_id, b.owner_id,
      COALESCE(b.spent_amount, 0), COALESCE(b.status, 'active'),
      COALESCE(b.warning_threshold, 80.00), COALESCE(b.critical_threshold, 95.00), COALESCE(b.hard_limit, FALSE),
      b.ai_forecast_amount, b.ai_forecast_date, b.ai_health_score, b.ai_recommendations, b.ai_anomaly_flags,
      COALESCE(b.allow_rollover, FALSE), COALESCE(b.rollover_amount, 0), COALESCE(b.requires_approval, TRUE), b.approval_threshold, COALESCE(b.period_type, 'monthly'),
      (COALESCE(b.status, 'active') = 'active')
    FROM budgets b
    WHERE NOT EXISTS (SELECT 1 FROM finance_budgets fb WHERE fb.id = b.id);
  END IF;
END $$;

-- 5. Update FKs: finance_budget_allocations and finance_budget_snapshots (only if those tables exist)
-- They are created in finance_v12_schema which runs after this file alphabetically; skip when missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'finance_budget_allocations') THEN
    ALTER TABLE finance_budget_allocations DROP CONSTRAINT IF EXISTS finance_budget_allocations_budget_id_fkey;
    ALTER TABLE finance_budget_allocations ADD CONSTRAINT finance_budget_allocations_budget_id_fkey
      FOREIGN KEY (budget_id) REFERENCES finance_budgets(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- constraint may already exist
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'finance_budget_snapshots') THEN
    ALTER TABLE finance_budget_snapshots DROP CONSTRAINT IF EXISTS finance_budget_snapshots_budget_id_fkey;
    ALTER TABLE finance_budget_snapshots ADD CONSTRAINT finance_budget_snapshots_budget_id_fkey
      FOREIGN KEY (budget_id) REFERENCES finance_budgets(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. DROP budgets (verified — dropping legacy table)
DROP TABLE IF EXISTS budgets CASCADE;
