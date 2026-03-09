-- OKR periods (Q1 2026, Q2 2026, etc.)
CREATE TABLE IF NOT EXISTS okr_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals (company → department → team → individual)
CREATE TABLE IF NOT EXISTS okr_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  period_id UUID NOT NULL REFERENCES okr_periods(id),
  parent_goal_id UUID REFERENCES okr_goals(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES reimbursement_users(id),
  level VARCHAR(20) NOT NULL CHECK (level IN ('company', 'department', 'team', 'individual')),
  department_id VARCHAR(100),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  progress DECIMAL(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status VARCHAR(20) DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'behind', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okr_goals_period ON okr_goals(period_id);
CREATE INDEX IF NOT EXISTS idx_okr_goals_parent ON okr_goals(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_okr_goals_owner ON okr_goals(owner_id);

-- Key Results (measurable outcomes linked to goals)
CREATE TABLE IF NOT EXISTS okr_key_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES okr_goals(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  metric_type VARCHAR(20) DEFAULT 'number' CHECK (metric_type IN ('number', 'percentage', 'currency', 'boolean')),
  target_value DECIMAL(15,2) NOT NULL,
  current_value DECIMAL(15,2) DEFAULT 0,
  start_value DECIMAL(15,2) DEFAULT 0,
  unit VARCHAR(50),
  auto_source VARCHAR(100),
  progress DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okr_kr_goal ON okr_key_results(goal_id);

-- Check-ins (weekly progress updates)
CREATE TABLE IF NOT EXISTS okr_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id UUID NOT NULL REFERENCES okr_key_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  value DECIMAL(15,2) NOT NULL,
  note TEXT,
  confidence VARCHAR(20) CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okr_checkins_kr ON okr_check_ins(key_result_id);

-- Seed active period
INSERT INTO okr_periods (organization_id, name, start_date, end_date, is_active)
SELECT o.id, 'Q2 2026', '2026-04-01', '2026-06-30', true
FROM organizations o WHERE o.slug = 'messign' LIMIT 1
ON CONFLICT DO NOTHING;
