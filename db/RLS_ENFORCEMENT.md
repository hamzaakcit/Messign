# RLS Enforcement Guide

## Summary

Row-Level Security (RLS) is **enabled and enforced** at the database level. The application connects as the restricted `messign_app` role, which has `rolbypassrls = false` and `rolsuper = false`. All tenant-scoped queries must set `app.current_tenant` via `withTenantQuery()` or the connection will return 0 rows for RLS-protected tables.

## Current Status

| Check | Status |
|-------|--------|
| RLS enabled on tables | ✅ `relrowsecurity = true` |
| FORCE ROW LEVEL SECURITY | ✅ `relforcerowsecurity = true` |
| set_app_tenant() exists | ✅ |
| current_tenant_id() exists | ✅ |
| **App role (messign_app)** | ✅ `rolbypassrls = false`, `rolsuper = false` |
| **RLS enforced** | ✅ Query without tenant context returns 0 rows |

## Setup (One-Time)

1. **Create the app role** (run as postgres/superuser):

   ```bash
   # Option A: Use the helper script (generates password, uses DATABASE_PUBLIC_URL or DATABASE_URL)
   set -a && . server/.env && set +a
   ./db/scripts/run_create_app_role.sh

   # Option B: Manual — edit create_app_role.sql to replace YOUR_STRONG_PASSWORD, then:
   psql $DATABASE_PUBLIC_URL -f db/scripts/create_app_role.sql
   ```

2. **Update DATABASE_URL** to use the `messign_app` role:

   ```
   postgresql://messign_app:<password>@<host>:<port>/<dbname>?sslmode=require
   ```

   - **Local:** `postgresql://messign_app:<password>@localhost:5432/messign`
   - **Railway:** Update `DATABASE_URL` in project variables.
   - **PgBouncer:** Update `PGBOUNCER_URL` to use `messign_app` (same credentials).

3. **Verify**:

   ```bash
   npm run db:verify-rls
   ```

   Must return: `Query WITHOUT set_app_tenant: 0 rows` and exit 0.

## Permission Fixes (If Queries Fail)

If you see permission errors after switching to `messign_app`, grant missing privileges:

```sql
-- Connect as postgres/superuser, then:
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO messign_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO messign_app;

-- For specific tables created after the initial GRANT:
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE <table_name> TO messign_app;
```

## Application Behavior

- **withTenantQuery(tenantId, fn):** Sets `app.current_tenant` for the transaction. All DAL code that touches RLS tables must use this.
- **setTenantContext middleware:** Extracts `tenantId` from auth and sets `req.tenantId`. Routes that need tenant-scoped data should use middleware that calls `withTenantQuery`.
- **Unset tenant:** Queries without `withTenantQuery` return 0 rows on RLS tables (fail-secure).

## Railway-Specific Notes

1. Connect to Railway Postgres (use `DATABASE_PUBLIC_URL` for external access).
2. Run `create_app_role.sql` or `run_create_app_role.sh`.
3. In Railway dashboard: Project → Variables → override `DATABASE_URL` with the `messign_app` connection string.
4. Redeploy the server.

## Scripts

| Script | Purpose |
|--------|---------|
| `db/scripts/run_create_app_role.sh` | Create role with generated or env password |
| `db/scripts/create_app_role.sql` | Raw SQL for role creation |
| `npm run db:diagnose-rls` | Run diagnostic queries |
| `npm run db:apply-rls` | Apply 001 + 002 + 004 migrations (requires postgres; set DATABASE_ADMIN_URL) |
| `npm run db:verify-rls` | Verify RLS blocks untenant queries |
| `npm run db:check-org-gaps` | Find tables with organization_id not in RLS list |

## RLS Gap Fix (004)

Migration `004_rls_gap_fix.sql` adds tenant_id + RLS to finance, heart, and time tables that had organization_id but were not in the original RLS list:

- budgets, finance_approval_policies, finance_audit_log, finance_dora_decisions, finance_dora_job_runs
- finance_expense_policies, finance_gl_accounts, finance_invoice_templates, finance_journal_entries
- finance_notification_preferences, finance_notifications, finance_payments, finance_period_closes
- finance_settings, finance_tax_rates, finance_vendors, heart_team_health, time_billing_rates
- reimbursement_users (with auth_lookup policy for auth middleware)

Run as postgres: `psql $DATABASE_ADMIN_URL -f db/migrations/004_rls_gap_fix.sql`
