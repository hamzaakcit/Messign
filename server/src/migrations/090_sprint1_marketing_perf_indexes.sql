-- Sprint 1: composite indexes for org-scoped marketing lists (cockpit, dashboard, approvals)
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_marketing_content_org_status_created
  ON marketing_content (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_org_status
  ON marketing_campaigns (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_created
  ON marketing_leads (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mkt_approval_queue_org_status_created
  ON marketing_approval_queue (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimbursement_users_organization
  ON reimbursement_users (organization_id);
