-- ═══════════════════════════════════════════════════════════════════════════════
-- Force ROW LEVEL SECURITY on tenant tables (if 002 was applied without FORCE)
-- Run this if relrowsecurity=true but relforcerowsecurity=false
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'crm_deals', 'crm_contacts', 'crm_companies', 'crm_activities', 'crm_pipelines', 'crm_deal_stages',
    'reimbursement_settings', 'reimbursement_requests', 'expense_categories', 'finance_budgets', 'invoices',
    'marketing_campaigns', 'marketing_leads', 'marketing_content', 'marketing_scoring_rules',
    'recruitment_jobs', 'recruitment_candidates', 'recruitment_applications', 'recruitment_interviews',
    'support_tickets', 'support_sla_policies', 'support_categories', 'support_tags',
    'time_timesheets', 'time_entries', 'time_categories', 'time_timers',
    'assets', 'asset_categories', 'contracts', 'licenses',
    'dora_insights', 'dora_automation_policies', 'dora_sessions', 'dora_messages',
    'heart_pulse_surveys', 'heart_pulse_responses', 'webhooks', 'okr_periods', 'okr_goals'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        RAISE NOTICE 'FORCE RLS applied to %', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;
