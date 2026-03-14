-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 1.2: Add tenant_id for Row-Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds tenant_id UUID column to primary tenant-scoped tables.
-- Backfills from organization_id (tenant_id = organization_id in our model).
-- Rows with NULL organization_id get default org for backfill.
-- Run 002_enable_rls.sql after this migration.
-- Fail-secure: missing policy = data denied.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id FROM organizations WHERE slug = 'messign' LIMIT 1;
  IF default_org_id IS NULL THEN
    SELECT id INTO default_org_id FROM organizations LIMIT 1;
  END IF;
  IF default_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Create at least one organization before running this migration.';
  END IF;

  -- ─── CRM ─────────────────────────────────────────────────────────────────
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_deals SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE crm_deals ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON crm_deals(tenant_id);

  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_contacts SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE crm_contacts ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant ON crm_contacts(tenant_id);

  ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_companies SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE crm_companies ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON crm_companies(tenant_id);

  ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_activities SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE crm_activities ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_activities_tenant ON crm_activities(tenant_id);

  ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_pipelines SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE crm_pipelines ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_pipelines_tenant ON crm_pipelines(tenant_id);

  -- crm_deal_stages: backfill from pipeline
  ALTER TABLE crm_deal_stages ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE crm_deal_stages cs SET tenant_id = COALESCE(p.organization_id, default_org_id)
  FROM crm_pipelines p WHERE cs.pipeline_id = p.id AND cs.tenant_id IS NULL;
  UPDATE crm_deal_stages SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE crm_deal_stages ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_deal_stages_tenant ON crm_deal_stages(tenant_id);

  -- ─── Reimbursement / Finance ──────────────────────────────────────────────
  ALTER TABLE reimbursement_settings ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE reimbursement_settings SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE reimbursement_settings ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_reimbursement_settings_tenant ON reimbursement_settings(tenant_id);

  ALTER TABLE reimbursement_requests ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE reimbursement_requests SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE reimbursement_requests ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_tenant ON reimbursement_requests(tenant_id);

  ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE expense_categories SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE expense_categories ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);

  ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE finance_budgets SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE finance_budgets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_finance_budgets_tenant ON finance_budgets(tenant_id);

  -- invoices: backfill from employee (reimbursement_users)
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE invoices i SET tenant_id = COALESCE(ru.organization_id, default_org_id)
  FROM reimbursement_users ru WHERE i.employee_id = ru.id AND i.tenant_id IS NULL;
  UPDATE invoices SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE invoices ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);

  -- ─── Marketing ────────────────────────────────────────────────────────────
  ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE marketing_campaigns SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE marketing_campaigns ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id);

  ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE marketing_leads SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE marketing_leads ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_marketing_leads_tenant ON marketing_leads(tenant_id);

  ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE marketing_content SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE marketing_content ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_marketing_content_tenant ON marketing_content(tenant_id);

  -- ─── Recruitment ─────────────────────────────────────────────────────────
  ALTER TABLE recruitment_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE recruitment_jobs SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE recruitment_jobs ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_tenant ON recruitment_jobs(tenant_id);

  ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE recruitment_candidates SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE recruitment_candidates ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_tenant ON recruitment_candidates(tenant_id);

  -- recruitment_applications: backfill from job
  ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE recruitment_applications ra SET tenant_id = COALESCE(rj.organization_id, default_org_id)
  FROM recruitment_jobs rj WHERE ra.job_id = rj.id AND ra.tenant_id IS NULL;
  UPDATE recruitment_applications SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE recruitment_applications ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_recruitment_applications_tenant ON recruitment_applications(tenant_id);

  -- recruitment_interviews: backfill from application -> job
  ALTER TABLE recruitment_interviews ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE recruitment_interviews ri SET tenant_id = COALESCE(rj.organization_id, default_org_id)
  FROM recruitment_applications ra
  JOIN recruitment_jobs rj ON ra.job_id = rj.id
  WHERE ri.application_id = ra.id AND ri.tenant_id IS NULL;
  UPDATE recruitment_interviews SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE recruitment_interviews ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_tenant ON recruitment_interviews(tenant_id);

  -- ─── Support ─────────────────────────────────────────────────────────────
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE support_tickets SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE support_tickets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);

  ALTER TABLE support_sla_policies ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE support_sla_policies SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE support_sla_policies ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_support_sla_policies_tenant ON support_sla_policies(tenant_id);

  -- ─── Time Tracking ───────────────────────────────────────────────────────
  ALTER TABLE time_timesheets ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE time_timesheets SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE time_timesheets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_time_timesheets_tenant ON time_timesheets(tenant_id);

  ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE time_entries SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE time_entries ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_time_entries_tenant ON time_entries(tenant_id);

  -- ─── Assets & Contracts ───────────────────────────────────────────────────
  ALTER TABLE assets ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE assets SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE assets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id);

  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE contracts SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE contracts ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);

  -- ─── Dora / AI ────────────────────────────────────────────────────────────
  ALTER TABLE dora_insights ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE dora_insights SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE dora_insights ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_dora_insights_tenant ON dora_insights(tenant_id);

  ALTER TABLE dora_automation_policies ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE dora_automation_policies SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE dora_automation_policies ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_dora_automation_policies_tenant ON dora_automation_policies(tenant_id);

  -- dora_sessions: backfill from user (reimbursement_users)
  ALTER TABLE dora_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE dora_sessions ds SET tenant_id = COALESCE(ru.organization_id, default_org_id)
  FROM reimbursement_users ru WHERE ru.id::text = ds.user_id::text AND ds.tenant_id IS NULL;
  UPDATE dora_sessions SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE dora_sessions ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_dora_sessions_tenant ON dora_sessions(tenant_id);

  -- dora_messages: backfill from session
  ALTER TABLE dora_messages ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE dora_messages dm SET tenant_id = ds.tenant_id
  FROM dora_sessions ds WHERE dm.session_id = ds.id AND dm.tenant_id IS NULL;
  UPDATE dora_messages SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE dora_messages ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_dora_messages_tenant ON dora_messages(tenant_id);

  -- ─── Heart / Culture ─────────────────────────────────────────────────────
  ALTER TABLE heart_pulse_surveys ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE heart_pulse_surveys SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE heart_pulse_surveys ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_heart_pulse_surveys_tenant ON heart_pulse_surveys(tenant_id);

  -- heart_pulse_responses: backfill from survey
  ALTER TABLE heart_pulse_responses ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE heart_pulse_responses hpr SET tenant_id = hps.tenant_id
  FROM heart_pulse_surveys hps WHERE hpr.survey_id = hps.id AND hpr.tenant_id IS NULL;
  UPDATE heart_pulse_responses SET tenant_id = default_org_id WHERE tenant_id IS NULL;
  ALTER TABLE heart_pulse_responses ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_heart_pulse_responses_tenant ON heart_pulse_responses(tenant_id);

  -- ─── Additional org-scoped tables ─────────────────────────────────────────
  ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE asset_categories SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE asset_categories ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_asset_categories_tenant ON asset_categories(tenant_id);

  ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE licenses SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE licenses ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id);

  ALTER TABLE time_categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE time_categories SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE time_categories ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_time_categories_tenant ON time_categories(tenant_id);

  ALTER TABLE time_timers ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE time_timers SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE time_timers ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_time_timers_tenant ON time_timers(tenant_id);

  ALTER TABLE support_categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE support_categories SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE support_categories ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_support_categories_tenant ON support_categories(tenant_id);

  ALTER TABLE support_tags ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE support_tags SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE support_tags ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_support_tags_tenant ON support_tags(tenant_id);

  ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE webhooks SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE webhooks ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

  ALTER TABLE okr_periods ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE okr_periods SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE okr_periods ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_okr_periods_tenant ON okr_periods(tenant_id);

  ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE okr_goals SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE okr_goals ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_okr_goals_tenant ON okr_goals(tenant_id);

  ALTER TABLE marketing_scoring_rules ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE marketing_scoring_rules SET tenant_id = COALESCE(organization_id, default_org_id) WHERE tenant_id IS NULL;
  ALTER TABLE marketing_scoring_rules ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_marketing_scoring_rules_tenant ON marketing_scoring_rules(tenant_id);

  RAISE NOTICE 'tenant_id migration complete. Run 002_enable_rls.sql next.';
END $$;
