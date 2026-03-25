-- Per-organization sales forecast quota (EUR) for CRM forecast UI and gap-to-target.
CREATE TABLE IF NOT EXISTS crm_org_forecast_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  sales_quota_eur NUMERIC(14, 2) NOT NULL DEFAULT 500000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_org_forecast_settings_org ON crm_org_forecast_settings(organization_id);
