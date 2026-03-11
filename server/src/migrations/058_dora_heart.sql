-- ════════════════════════════════════════
-- Dora Heart — Sentiment & Team Health
-- ════════════════════════════════════════

-- Individual sentiment scores (PRIVATE — only the user and the system can access)
-- Managers NEVER see individual rows. They only see aggregated views.
CREATE TABLE IF NOT EXISTS heart_sentiment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  source VARCHAR(30) NOT NULL CHECK (source IN ('chat', 'checkin', 'ticket_response', 'review', 'pulse', 'composite')),
  score DECIMAL(4,2) NOT NULL CHECK (score >= -1 AND score <= 1), -- -1 (very negative) to +1 (very positive)
  normalized_score INTEGER GENERATED ALWAYS AS (CAST((score + 1) * 50 AS INTEGER)) STORED, -- 0-100 scale
  factors JSONB DEFAULT '{}', -- { tone: 0.8, engagement: 0.6, keywords: ['frustrated', 'deadline'] }
  message_sample_hash VARCHAR(64), -- SHA-256 hash of the analyzed text (NOT the text itself — privacy)
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  period_start DATE, -- the day or week this score covers
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRITICAL: This index + RLS ensures privacy
CREATE INDEX IF NOT EXISTS idx_heart_sentiment_user ON heart_sentiment_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_heart_sentiment_date ON heart_sentiment_scores(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_heart_sentiment_source ON heart_sentiment_scores(source);

-- Burnout risk assessments (PRIVATE — same privacy rules as sentiment)
CREATE TABLE IF NOT EXISTS heart_burnout_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
  overall_score DECIMAL(5,2) DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100), -- 0 = no risk, 100 = extreme risk
  signals JSONB NOT NULL DEFAULT '{}',
  -- Individual signal scores (all 0-100, higher = more concerning)
  hours_creep_score DECIMAL(5,2) DEFAULT 0,
  after_hours_score DECIMAL(5,2) DEFAULT 0,
  response_time_score DECIMAL(5,2) DEFAULT 0,
  velocity_decline_score DECIMAL(5,2) DEFAULT 0,
  sentiment_shift_score DECIMAL(5,2) DEFAULT 0,
  pto_avoidance_score DECIMAL(5,2) DEFAULT 0,
  -- Context
  weekly_hours_avg DECIMAL(5,2),
  after_hours_percent DECIMAL(5,2),
  response_time_change_percent DECIMAL(5,2),
  velocity_change_percent DECIMAL(5,2),
  days_since_pto INTEGER,
  sentiment_trend VARCHAR(20), -- 'improving', 'stable', 'declining'
  -- Actions taken
  private_nudge_sent BOOLEAN DEFAULT false,
  manager_alert_sent BOOLEAN DEFAULT false,
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  previous_risk_level VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heart_burnout_user ON heart_burnout_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_heart_burnout_risk ON heart_burnout_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_heart_burnout_date ON heart_burnout_assessments(assessed_at);

-- Team health aggregates (AGGREGATED — safe for manager/dept_head/admin viewing)
-- No individual user data here — only team/department level
CREATE TABLE IF NOT EXISTS heart_team_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('team', 'department', 'organization')),
  scope_id VARCHAR(100), -- team_id or department_name or null for org
  scope_name VARCHAR(255),
  -- Aggregate scores (all 0-100)
  health_score INTEGER DEFAULT 75,
  engagement_score INTEGER DEFAULT 75,
  sentiment_score INTEGER DEFAULT 75,
  velocity_score INTEGER DEFAULT 75,
  hours_balance_score INTEGER DEFAULT 75,
  collaboration_score INTEGER DEFAULT 75,
  -- Counts (anonymized)
  member_count INTEGER DEFAULT 0,
  at_risk_count INTEGER DEFAULT 0, -- burnout risk medium+, but NO names
  high_engagement_count INTEGER DEFAULT 0,
  -- Trends
  health_trend VARCHAR(20) DEFAULT 'stable' CHECK (health_trend IN ('improving', 'stable', 'declining', 'critical')),
  previous_health_score INTEGER,
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope_type, scope_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_heart_team_scope ON heart_team_health(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_heart_team_period ON heart_team_health(period_start);

-- Pulse surveys: anonymous micro-surveys sent by Dora
CREATE TABLE IF NOT EXISTS heart_pulse_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  title VARCHAR(255),
  questions JSONB NOT NULL, -- [{ id: "q1", text: "How supported do you feel?", scale: "1-5" }]
  target_scope VARCHAR(20) DEFAULT 'organization', -- 'team', 'department', 'organization'
  target_scope_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  sent_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  response_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES reimbursement_users(id), -- null if auto-generated by Dora
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pulse survey responses (ANONYMOUS — no user_id stored by design)
CREATE TABLE IF NOT EXISTS heart_pulse_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES heart_pulse_surveys(id) ON DELETE CASCADE,
  -- NO user_id column — this is intentionally anonymous
  department VARCHAR(100), -- only department-level grouping (optional, can be null for full anonymity)
  answers JSONB NOT NULL, -- { q1: 4, q2: 3 }
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heart_pulse_resp_survey ON heart_pulse_responses(survey_id);

-- Onboarding journey tracking
CREATE TABLE IF NOT EXISTS heart_onboarding_journey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES reimbursement_users(id),
  milestone VARCHAR(30) NOT NULL CHECK (milestone IN ('day_1', 'week_1', 'day_30', 'day_60', 'day_90')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'completed', 'skipped')),
  triggered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dora_message TEXT, -- what Dora said/suggested at this milestone
  user_response TEXT, -- what the user responded (optional, for reflections)
  manager_summary TEXT, -- anonymized summary sent to manager
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_heart_onboarding_user ON heart_onboarding_journey(user_id);

-- ════════════════════════════════════════
-- Materialized view: Organization sentiment overview
-- Only aggregated data — no individual identifiers
-- Department derived from performance_team_members + performance_teams
-- ════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_sentiment AS
SELECT
  COALESCE(
    (SELECT pt.team_name FROM performance_team_members ptm
     JOIN performance_teams pt ON pt.id = ptm.team_id
     WHERE ptm.employee_id = u.auth_user_id AND ptm.is_active = TRUE
     LIMIT 1),
    'Unassigned'
  ) AS department_name,
  COUNT(DISTINCT s.user_id) AS respondent_count,
  ROUND(AVG(s.normalized_score)::numeric, 1) AS avg_sentiment,
  ROUND(STDDEV(s.normalized_score)::numeric, 1) AS sentiment_stddev,
  COUNT(*) FILTER (WHERE s.normalized_score >= 70) AS positive_count,
  COUNT(*) FILTER (WHERE s.normalized_score BETWEEN 40 AND 69) AS neutral_count,
  COUNT(*) FILTER (WHERE s.normalized_score < 40) AS negative_count,
  MIN(s.analyzed_at) AS period_start,
  MAX(s.analyzed_at) AS period_end
FROM heart_sentiment_scores s
JOIN reimbursement_users u ON u.id = s.user_id
WHERE s.analyzed_at >= NOW() - INTERVAL '30 days'
  AND s.source = 'composite'
GROUP BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_sentiment_dept ON mv_org_sentiment(department_name);
