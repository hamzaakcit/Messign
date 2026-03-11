-- Materialized Views for Dora AI fast reads
-- These are refreshed every 15 minutes by the BullMQ dora-scheduler worker
-- CONCURRENTLY requires a unique index on each view

-- Ensure dependencies exist so this migration can run in alphabetical order (before 033/037/042/045)
-- Mirrors performance_teams (045), team_id/budget_id/is_deleted (037/042), finance_budgets (033)
CREATE TABLE IF NOT EXISTS performance_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_code VARCHAR(50) UNIQUE NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    description TEXT,
    team_type VARCHAR(50) NOT NULL DEFAULT 'sales',
    team_lead_id VARCHAR(100),
    metrics_config JSONB NOT NULL DEFAULT '{"revenue": true, "sms": true}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES performance_teams(id);
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS budget_id UUID;
ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

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

-- =============================================================================
-- View 1: mv_department_spend — Total spending by department (current month)
-- Uses reimbursement_requests + team from performance_teams for department name
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_department_spend AS
SELECT
  COALESCE(pt.team_name, r.team_id::text, 'Unassigned') AS department_name,
  COUNT(r.id) AS expense_count,
  COALESCE(SUM(COALESCE(r.converted_amount, r.original_amount)), 0) AS total_spend_eur,
  COALESCE(AVG(COALESCE(r.converted_amount, r.original_amount)), 0) AS avg_expense_eur,
  MAX(r.created_at) AS last_expense_at,
  DATE_TRUNC('month', CURRENT_DATE)::date AS period_start
FROM reimbursement_requests r
JOIN reimbursement_users u ON r.submitted_by = u.id
LEFT JOIN performance_teams pt ON pt.id = r.team_id AND pt.is_active = TRUE
WHERE r.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)
  AND r.status NOT IN ('voided', 'draft')
GROUP BY COALESCE(pt.team_name, r.team_id::text, 'Unassigned');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dept_spend_dept ON mv_department_spend (department_name);

-- =============================================================================
-- View 2: mv_budget_health — Budget consumption status (finance_budgets)
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_budget_health AS
SELECT
  b.id AS budget_id,
  b.name AS budget_name,
  b.department AS department_id,
  b.allocated_amount AS budget_amount,
  COALESCE(SUM(COALESCE(r.converted_amount, r.original_amount)), 0) AS spent_amount,
  CASE WHEN b.allocated_amount > 0
    THEN ROUND((COALESCE(SUM(COALESCE(r.converted_amount, r.original_amount)), 0) / b.allocated_amount * 100)::numeric, 1)
    ELSE 0
  END AS percent_consumed,
  b.period_start AS start_date,
  b.period_end AS end_date,
  CASE
    WHEN b.allocated_amount > 0 AND (COALESCE(SUM(COALESCE(r.converted_amount, r.original_amount)), 0) / b.allocated_amount) > 0.9 THEN 'critical'
    WHEN b.allocated_amount > 0 AND (COALESCE(SUM(COALESCE(r.converted_amount, r.original_amount)), 0) / b.allocated_amount) > 0.75 THEN 'warning'
    ELSE 'healthy'
  END AS health_status
FROM finance_budgets b
LEFT JOIN reimbursement_requests r ON r.budget_id = b.id
  AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)
  AND r.status NOT IN ('voided', 'draft', 'rejected')
GROUP BY b.id, b.name, b.department, b.allocated_amount, b.period_start, b.period_end;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_budget_health_id ON mv_budget_health (budget_id);

-- =============================================================================
-- View 3: mv_approval_pipeline — Pending approvals with SLA status
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_approval_pipeline AS
SELECT
  r.id AS expense_id,
  r.title,
  COALESCE(r.converted_amount, r.original_amount) AS amount_eur,
  r.status,
  r.submitted_by AS submitter_id,
  u.full_name AS submitter_name,
  r.team_id::text AS department,
  r.created_at AS submitted_at,
  EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 AS hours_pending,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 > 48 THEN 'breached'
    WHEN EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 > 36 THEN 'at_risk'
    ELSE 'on_track'
  END AS sla_status
FROM reimbursement_requests r
JOIN reimbursement_users u ON r.submitted_by = u.id
WHERE (r.is_deleted IS NULL OR r.is_deleted = FALSE)
  AND r.status IN ('submitted', 'under_review', 'pending');

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_approval_pipeline_id ON mv_approval_pipeline (expense_id);

-- =============================================================================
-- View 4: mv_team_performance — Team metrics (tasks, messages, badges by user)
-- tasks.assignees is JSONB array; user_badges.user_id and messages.user_id may be auth_user_id
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_team_performance AS
SELECT
  u.id AS user_id,
  u.full_name,
  NULL::text AS department,
  u.job_title,
  COALESCE(task_stats.completed_tasks, 0) AS completed_tasks,
  COALESCE(task_stats.total_tasks, 0) AS total_tasks,
  COALESCE(msg_stats.message_count, 0) AS message_count,
  COALESCE(badge_stats.badge_count, 0) AS badge_count,
  COALESCE(u.xp, 0) AS total_xp
FROM reimbursement_users u
LEFT JOIN (
  SELECT (jsonb_array_elements_text(t.assignees))::text AS assignee_id,
         COUNT(*) FILTER (WHERE t.status IN ('completed', 'done')) AS completed_tasks,
         COUNT(*) AS total_tasks
  FROM tasks t
  GROUP BY 1
) task_stats ON task_stats.assignee_id = u.auth_user_id OR task_stats.assignee_id = u.id::text
LEFT JOIN (
  SELECT user_id, COUNT(*)::int AS message_count
  FROM messages
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY user_id
) msg_stats ON msg_stats.user_id = u.auth_user_id OR msg_stats.user_id = u.id::text
LEFT JOIN (
  SELECT user_id, COUNT(*)::int AS badge_count
  FROM user_badges
  GROUP BY user_id
) badge_stats ON badge_stats.user_id = u.auth_user_id OR badge_stats.user_id = u.id::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_team_perf_user ON mv_team_performance (user_id);

-- =============================================================================
-- View 5: mv_project_velocity — Sprint velocity (projects + tasks)
-- =============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_velocity AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  COUNT(t.id) AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.status IN ('completed', 'done')) AS completed_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS in_progress_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'blocked') AS blocked_tasks,
  CASE WHEN COUNT(t.id) > 0
    THEN ROUND((COUNT(t.id) FILTER (WHERE t.status IN ('completed', 'done'))::numeric / COUNT(t.id) * 100), 1)
    ELSE 0
  END AS completion_rate
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_proj_velocity_id ON mv_project_velocity (project_id);
