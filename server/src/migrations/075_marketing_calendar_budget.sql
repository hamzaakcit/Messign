-- Marketing operational tables: content calendar rows, per-channel budget allocations,
-- and campaign objective. workspace_id = organizations.id (same tenant as organization_id elsewhere).

-- Extend campaigns: objective (status values remain as in 051_marketing_hub; agents use `draft` as "drafting")
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS objective TEXT;

COMMENT ON COLUMN marketing_campaigns.objective IS 'High-level campaign objective (agent / planner)';
COMMENT ON COLUMN marketing_campaigns.budget IS 'Total campaign budget (maps agent field total_budget)';

-- Calendar: one row per scheduled slot (content must be approved before insert — enforced in app)
CREATE TABLE IF NOT EXISTS marketing_content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  channel VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'scheduled', 'published', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_content_cal_ws ON marketing_content_calendar(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mkt_content_cal_campaign ON marketing_content_calendar(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mkt_content_cal_sched ON marketing_content_calendar(scheduled_at);

COMMENT ON TABLE marketing_content_calendar IS 'Scheduled marketing content slots (workspace-scoped); mirrors approved content scheduling';

-- Per-channel budget vs spend (aggregates; spend may be updated from finance / spend tools)
CREATE TABLE IF NOT EXISTS marketing_budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  channel VARCHAR(64) NOT NULL,
  allocated_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  spent_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, campaign_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_mkt_budget_alloc_ws ON marketing_budget_allocations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mkt_budget_alloc_campaign ON marketing_budget_allocations(campaign_id);

COMMENT ON TABLE marketing_budget_allocations IS 'Per-channel budget envelope; must stay in sync with finance journal (see campaign_budget_allocate transaction)';
