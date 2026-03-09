-- Materialized Views for Dora AI fast reads
-- These are refreshed every 15 minutes by the BullMQ dora-scheduler worker
-- CONCURRENTLY requires a unique index on each view

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
