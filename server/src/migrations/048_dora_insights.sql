-- ════════════════════════════════════════
-- Dora Proactive Insights — Storage
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dora_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  action_url VARCHAR(500),
  action_label VARCHAR(100),
  source_event VARCHAR(100),
  source_entity_type VARCHAR(50),
  source_entity_id VARCHAR(100),
  target_user_id UUID REFERENCES reimbursement_users(id) ON DELETE CASCADE,
  target_role VARCHAR(50),
  target_department VARCHAR(100),
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dora_insights_module ON dora_insights(module);
CREATE INDEX IF NOT EXISTS idx_dora_insights_target_user ON dora_insights(target_user_id);
CREATE INDEX IF NOT EXISTS idx_dora_insights_severity ON dora_insights(severity);
CREATE INDEX IF NOT EXISTS idx_dora_insights_created ON dora_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dora_insights_read ON dora_insights(is_read, is_dismissed);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_health AS
SELECT
  ch.crm_company_id,
  c.name AS company_name,
  ch.health_score,
  ch.open_ticket_count,
  ch.avg_resolution_hours,
  ch.avg_csat,
  ch.trend,
  ch.calculated_at
FROM support_customer_health ch
JOIN crm_companies c ON c.id = ch.crm_company_id
ORDER BY ch.health_score ASC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_customer_health_id
  ON mv_customer_health(crm_company_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pipeline_summary AS
SELECT
  d.pipeline_id,
  s.name AS stage_name,
  s.position AS stage_position,
  s.color AS stage_color,
  s.is_won,
  s.is_lost,
  COUNT(d.id) AS deal_count,
  COALESCE(SUM(d.amount_eur), 0) AS total_value,
  COALESCE(SUM(d.amount_eur * d.probability / 100.0), 0) AS weighted_value,
  COALESCE(AVG(d.amount_eur), 0) AS avg_deal_size
FROM crm_deals d
JOIN crm_deal_stages s ON s.id = d.stage_id
WHERE d.actual_close_date IS NULL
   OR d.actual_close_date >= DATE_TRUNC('quarter', CURRENT_DATE)
GROUP BY d.pipeline_id, s.name, s.position, s.color, s.is_won, s.is_lost
ORDER BY s.position;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pipeline_summary
  ON mv_pipeline_summary(pipeline_id, stage_name);
