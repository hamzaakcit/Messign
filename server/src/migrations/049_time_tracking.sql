-- ════════════════════════════════════════
-- Time Tracking Module — Database Schema
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS time_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_billable_default BOOLEAN DEFAULT false,
  hourly_rate DECIMAL(10,2),
  color VARCHAR(7) DEFAULT '#6B7280',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_time_categories_org ON time_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_categories_active ON time_categories(organization_id, is_active);

CREATE TABLE IF NOT EXISTS time_timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_hours DECIMAL(5,2) DEFAULT 0,
  billable_hours DECIMAL(5,2) DEFAULT 0,
  non_billable_hours DECIMAL(5,2) DEFAULT 0,
  billable_amount DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_timesheets_user ON time_timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_time_timesheets_week ON time_timesheets(week_start_date);
CREATE INDEX IF NOT EXISTS idx_time_timesheets_status ON time_timesheets(status);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  project_id VARCHAR(100) REFERENCES projects(id) ON DELETE SET NULL,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  category_id UUID REFERENCES time_categories(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  minutes INTEGER GENERATED ALWAYS AS (CAST(hours * 60 AS INTEGER)) STORED,
  description TEXT,
  is_billable BOOLEAN DEFAULT false,
  billing_rate DECIMAL(10,2),
  billable_amount DECIMAL(12,2) GENERATED ALWAYS AS (
    CASE WHEN is_billable THEN hours * COALESCE(billing_rate, 0) ELSE 0 END
  ) STORED,
  client_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'import', 'suggestion')),
  timer_id UUID,
  timesheet_id UUID REFERENCES time_timesheets(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_org ON time_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(is_billable);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_timesheet ON time_entries(timesheet_id);

CREATE TABLE IF NOT EXISTS time_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  project_id VARCHAR(100) REFERENCES projects(id) ON DELETE SET NULL,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  category_id UUID REFERENCES time_categories(id) ON DELETE SET NULL,
  description TEXT,
  is_billable BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_timers_one_active_per_user
  ON time_timers(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_time_timers_user ON time_timers(user_id);
CREATE INDEX IF NOT EXISTS idx_time_timers_active ON time_timers(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS time_billing_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  rate DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_rates_user ON time_billing_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_time_rates_project ON time_billing_rates(project_id);
CREATE INDEX IF NOT EXISTS idx_time_rates_client ON time_billing_rates(client_id);
CREATE INDEX IF NOT EXISTS idx_time_rates_active ON time_billing_rates(organization_id, is_active);

INSERT INTO time_categories (organization_id, name, description, is_billable_default, color)
SELECT
  o.id,
  seed.name,
  seed.description,
  seed.is_billable_default,
  seed.color
FROM organizations o
CROSS JOIN (
  VALUES
    ('Development', 'Software development and coding', true, '#3B82F6'),
    ('Design', 'UI/UX design work', true, '#8B5CF6'),
    ('Meeting', 'Internal and external meetings', false, '#F59E0B'),
    ('Admin', 'Administrative tasks', false, '#6B7280'),
    ('Research', 'Research and learning', false, '#10B981'),
    ('Testing', 'QA and testing', true, '#EC4899'),
    ('Client Communication', 'Calls and emails with clients', true, '#14B8A6'),
    ('Planning', 'Sprint planning and project planning', false, '#F97316')
) AS seed(name, description, is_billable_default, color)
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_time_utilization AS
SELECT
  u.id AS user_id,
  u.full_name,
  NULL::text AS department,
  COALESCE(SUM(te.hours), 0) AS total_hours_30d,
  COALESCE(SUM(te.hours) FILTER (WHERE te.is_billable), 0) AS billable_hours_30d,
  COALESCE(SUM(te.hours) FILTER (WHERE NOT te.is_billable), 0) AS non_billable_hours_30d,
  CASE WHEN COALESCE(SUM(te.hours), 0) > 0
    THEN ROUND((SUM(te.hours) FILTER (WHERE te.is_billable) / SUM(te.hours) * 100)::numeric, 1)
    ELSE 0
  END AS utilization_percent,
  COALESCE(SUM(te.billable_amount), 0) AS billable_revenue_30d,
  COUNT(DISTINCT te.date) AS days_logged_30d
FROM reimbursement_users u
LEFT JOIN time_entries te ON te.user_id = u.id
  AND te.date >= CURRENT_DATE - INTERVAL '30 days'
  AND te.status != 'rejected'
GROUP BY u.id, u.full_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_time_util_user ON mv_time_utilization(user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'actual_hours'
  ) THEN
    ALTER TABLE tasks ADD COLUMN actual_hours DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;
