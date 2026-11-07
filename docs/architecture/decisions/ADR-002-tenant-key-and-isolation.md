# ADR-002: `organization_id` + FORCE RLS + `withTenantQuery`-only for all engagement data

- **Status:** Accepted (2026-11-07, with D-01). Amended 2026-11-07 after D-07.
- **Context:** Three tenant keys coexist (`organization_id` 1,128 refs, `tenant_id` 126, `workspace_id` 51). RLS policies key on `tenant_id`, but 77/120 inserts omit it. Auth hard-codes org `messign`. Isolation is not enforced (current-state §3).
- **Decision:**
  1. Every `engage.*` table has `organization_id UUID NOT NULL REFERENCES organizations(id)`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, and policy `USING (organization_id = current_tenant_id()) WITH CHECK (same)`. The table, its RLS and its policy ship in the same migration (new tables have no legacy writers, so this does not violate the migration-discipline rule).
  2. Engage code accesses the DB only through `withTenantQuery`. A CI test fails on direct `pool`/`query` imports under `server/src/engage/**`, except an allow-listed bootstrap file.
  3. `requireEngageUser`: org from the JWT claim, must match the user row, **no fallback**. `requireApiKey`: org from the key record only.
  4. Production boot refuses to enable engage if the DB role has `BYPASSRLS` or `SUPERUSER`.
  5. Adversarial tenant-isolation suite (target-state §A) is a merge gate for any engage PR.
  6. Legacy tables are not retrofitted in 90 days. Company-OS stays frozen and single-tenant.
- **Consequences:** + isolation enforced at the schema level for everything the pilot touches. − legacy and engage use different conventions (`tenant_id` vs `organization_id`) until a later cleanup.
- **Rejected:** `tenant_id` for new tables (adds a second name to the dominant convention); schema-per-tenant; application-only WHERE clauses.

## Amendment (2026-11-07, after D-07)
- **Finding:** the production app connects as `postgres` (SUPERUSER + BYPASSRLS), so RLS is ignored for every legacy query.
- **Decision:**
  - Engage uses a **separate `pg.Pool`** (`ENGAGE_DATABASE_URL`) on a dedicated role `messign_engage` (LOGIN, NOSUPERUSER, NOBYPASSRLS). It gets privileges only on schema `engage` plus read access to `organizations`/`reimbursement_users` for auth.
  - `withTenantQuery` gains a pool parameter; engage code imports only `withEngageTenant` from `server/src/engage/db.ts`.
  - Boot check: if `ENGAGE_DATABASE_URL` resolves to a role with `rolsuper` or `rolbypassrls`, engage refuses to mount, in every environment except unit tests.
  - Legacy keeps the `postgres` connection until Company-OS retirement. It is **not** switched to `messign_app` in 90 days, because ~77 legacy inserts omit `tenant_id` and would break.
  - `db:verify-rls` is rewritten to run its checks via `SET ROLE` to a non-bypass role (or a separate URL) and to report the connecting role's bypass status as a separate result.
- **Why:** isolation for engage is enforced by the database regardless of what legacy does, and nothing legacy breaks.

## Implementation notes (WP-04, 2026-11-07)
- **Own tenant function:** migration 111 defines `engage.current_org_id()` (reads `app.current_tenant`, empty means none) instead of using `current_tenant_id()`. The legacy function lives in scripts outside the migration runner, so a fresh database lacks it.
- **Role creation:** migration 111 creates `messign_engage` as `NOLOGIN`, with all grants. The operator adds the login and password out of band (`db/scripts/create_engage_role.sql`), so no secret is in the repo.
- **Legacy user lookup:** the engage role has no access to legacy tables. Auth uses `engage.lookup_user(auth_user_id)`, a `SECURITY DEFINER` function that returns only id, role, organization, slug and product.
- **API key lookup before a tenant exists:** `engage.api_keys` has a second `SELECT` policy that exposes only the row whose hash equals the transaction-local setting `engage.lookup_key_hash`. Writes still need the tenant policy. `last_used_at` is updated under the key's own tenant.
- **Provisioning writes legacy tables** (`organizations`, `reimbursement_users`, `employee_auth`), so it runs on the legacy admin pool in one transaction, in the allow-listed `server/src/engage/bootstrap/`. The first admin gets a random one-time password (bcrypt hashed, `must_change_password`), returned once with `Cache-Control: no-store`.
- **Platform admin** means role `admin` in the organization whose slug is `PLATFORM_ORG_SLUG` (default `messign`). Engage routes mount only when `PRODUCT_SURFACE` is `engage` or `all`, and only after the role check passes.
- **Not yet enforced:** the import-lint rule (point 2) and the HTTP-level adversarial tests land in WP-05. Per-key rate limiting is a column only until ingestion (WP-08).
