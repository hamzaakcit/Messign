-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 1.2: Enable Row-Level Security (RLS) on tenant-scoped tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Requires 001_add_tenant_id.sql to be applied first.
-- The application MUST SET LOCAL app.current_tenant = '<tenant_uuid>' in each
-- transaction before querying these tables (via set_app_tenant or SET LOCAL).
-- Fail-secure: missing policy = data denied, not data leaked.
-- FORCE ROW LEVEL SECURITY: even the table owner (app's DB user) is subject to RLS.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Reads the tenant_id set by Express middleware on each request.
-- NULLIF handles empty string; returns NULL if not set (no rows match = fail-secure).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Helper: set tenant for the current transaction (used by middleware)
CREATE OR REPLACE FUNCTION set_app_tenant(tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT set_config('app.current_tenant', tenant_id::text, true);
$$;

DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'crm_deals',
    'crm_contacts',
    'crm_companies',
    'crm_activities',
    'crm_pipelines',
    'crm_deal_stages',
    'reimbursement_settings',
    'reimbursement_requests',
    'expense_categories',
    'finance_budgets',
    'invoices',
    'marketing_campaigns',
    'marketing_leads',
    'marketing_content',
    'marketing_scoring_rules',
    'recruitment_jobs',
    'recruitment_candidates',
    'recruitment_applications',
    'recruitment_interviews',
    'support_tickets',
    'support_sla_policies',
    'support_categories',
    'support_tags',
    'time_timesheets',
    'time_entries',
    'time_categories',
    'time_timers',
    'assets',
    'asset_categories',
    'contracts',
    'licenses',
    'dora_insights',
    'dora_automation_policies',
    'dora_sessions',
    'dora_messages',
    'heart_pulse_surveys',
    'heart_pulse_responses',
    'webhooks',
    'okr_periods',
    'okr_goals'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    -- Skip if table does not exist (e.g. optional modules)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping RLS for non-existent table: %', tbl;
      CONTINUE;
    END IF;

    -- Skip if tenant_id column does not exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      RAISE NOTICE 'Skipping RLS for % (no tenant_id column)', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    -- Drop existing policies (idempotent; includes legacy rls_* names)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_select ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_insert ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_update ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_delete ON %I', replace(tbl, '.', '_'), tbl);

    -- Policy: users can only see rows matching their tenant
    EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (tenant_id = current_tenant_id())', tbl);

    RAISE NOTICE 'RLS enabled on %', tbl;
  END LOOP;
END $$;
