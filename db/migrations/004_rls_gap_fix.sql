-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS Gap Fix: Add tenant_id + RLS to tables with organization_id not yet covered
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run after 001_add_tenant_id.sql and 002_enable_rls.sql.
-- Requires: current_tenant_id(), set_app_tenant() from 002.
--
-- IMPORTANT: Run as postgres/superuser (not messign_app). Use DATABASE_ADMIN_URL
-- or the original postgres connection string:
--   psql $DATABASE_ADMIN_URL -f db/migrations/004_rls_gap_fix.sql
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  default_org_id UUID;
  tbl text;
  tables_to_fix text[] := ARRAY[
    'budgets',
    'finance_approval_policies',
    'finance_audit_log',
    'finance_dora_decisions',
    'finance_dora_job_runs',
    'finance_expense_policies',
    'finance_gl_accounts',
    'finance_invoice_templates',
    'finance_journal_entries',
    'finance_notification_preferences',
    'finance_notifications',
    'finance_payments',
    'finance_period_closes',
    'finance_settings',
    'finance_tax_rates',
    'finance_vendors',
    'heart_team_health',
    'time_billing_rates'
  ];
BEGIN
  SELECT id INTO default_org_id FROM organizations WHERE slug = 'messign' LIMIT 1;
  IF default_org_id IS NULL THEN
    SELECT id INTO default_org_id FROM organizations LIMIT 1;
  END IF;
  IF default_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Create at least one organization before running this migration.';
  END IF;

  FOREACH tbl IN ARRAY tables_to_fix
  LOOP
    -- Skip if table does not exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Skipping % (table does not exist)', tbl;
      CONTINUE;
    END IF;

    -- Skip if organization_id does not exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id') THEN
      RAISE NOTICE 'Skipping % (no organization_id column)', tbl;
      CONTINUE;
    END IF;

    -- 1. Add tenant_id if not exists
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID', tbl);

    -- 2. Backfill from organization_id
    EXECUTE format('UPDATE %I SET tenant_id = organization_id WHERE tenant_id IS NULL', tbl);
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl) USING default_org_id;

    -- 3. Set NOT NULL only if no nulls remain
    EXECUTE format(
      'DO $inner$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM %I WHERE tenant_id IS NULL) THEN
          ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL;
        END IF;
      END $inner$',
      tbl, tbl
    );

    -- 4. Create index
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I (tenant_id)', replace(tbl, '.', '_'), tbl);

    -- 5. Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    -- 6. Drop existing policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_select ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_insert ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_update ON %I', replace(tbl, '.', '_'), tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_%s_delete ON %I', replace(tbl, '.', '_'), tbl);

    -- 7. Create policies
    EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (tenant_id = current_tenant_id())', tbl);

    RAISE NOTICE 'RLS enabled on %', tbl;
  END LOOP;

  RAISE NOTICE 'RLS gap fix complete.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- reimbursement_users: Auth table — allow lookups WITHOUT tenant context
-- ═══════════════════════════════════════════════════════════════════════════════
-- Auth middleware looks up users by auth_user_id BEFORE setting tenant context.
-- Policy: allow SELECT when tenant matches OR when no tenant is set (auth lookup).
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reimbursement_users') THEN
    RAISE NOTICE 'Skipping reimbursement_users (table does not exist)';
    RETURN;
  END IF;

  -- Add tenant_id if not exists
  ALTER TABLE reimbursement_users ADD COLUMN IF NOT EXISTS tenant_id UUID;
  UPDATE reimbursement_users SET tenant_id = organization_id WHERE tenant_id IS NULL;
  UPDATE reimbursement_users SET tenant_id = (SELECT id FROM organizations LIMIT 1) WHERE tenant_id IS NULL;

  IF NOT EXISTS (SELECT 1 FROM reimbursement_users WHERE tenant_id IS NULL) THEN
    ALTER TABLE reimbursement_users ALTER COLUMN tenant_id SET NOT NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_reimbursement_users_tenant ON reimbursement_users(tenant_id);

  ALTER TABLE reimbursement_users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reimbursement_users FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_select ON reimbursement_users;
  DROP POLICY IF EXISTS tenant_isolation_insert ON reimbursement_users;
  DROP POLICY IF EXISTS tenant_isolation_update ON reimbursement_users;
  DROP POLICY IF EXISTS tenant_isolation_delete ON reimbursement_users;
  DROP POLICY IF EXISTS auth_lookup ON reimbursement_users;
  DROP POLICY IF EXISTS rls_reimbursement_users_select ON reimbursement_users;
  DROP POLICY IF EXISTS rls_reimbursement_users_insert ON reimbursement_users;
  DROP POLICY IF EXISTS rls_reimbursement_users_update ON reimbursement_users;
  DROP POLICY IF EXISTS rls_reimbursement_users_delete ON reimbursement_users;

  -- Auth lookup: allow SELECT when tenant matches OR no tenant set (for auth middleware)
  CREATE POLICY auth_lookup ON reimbursement_users FOR SELECT
    USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

  CREATE POLICY tenant_isolation_insert ON reimbursement_users FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());
  CREATE POLICY tenant_isolation_update ON reimbursement_users FOR UPDATE
    USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
  CREATE POLICY tenant_isolation_delete ON reimbursement_users FOR DELETE
    USING (tenant_id = current_tenant_id());

  RAISE NOTICE 'RLS enabled on reimbursement_users (auth_lookup policy)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Grant messign_app access to new tables (if using restricted role)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messign_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO messign_app';
    RAISE NOTICE 'Granted table access to messign_app';
  END IF;
END $$;
