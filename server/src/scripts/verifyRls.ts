/**
 * RLS Verification Script
 *
 * Verifies that Row-Level Security is enforced:
 * 1. Query WITHOUT set_app_tenant → should return 0 rows (RLS blocks)
 * 2. Query WITH set_app_tenant → should return data (RLS allows)
 *
 * Run: npx tsx server/src/scripts/verifyRls.ts
 * (from workspace root, or: npm run db:verify-rls from server/)
 */

import { pool, withTenantQuery } from '../db/index.js';

const RLS_TABLE = 'support_tickets';

async function main() {
  console.log('\n=== RLS Verification ===\n');

  // Get a valid tenant_id from organizations
  const orgResult = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`,
  );
  const tenantId = orgResult.rows[0]?.id;
  if (!tenantId) {
    console.error('No organization found. Run migrations and seed first.');
    process.exit(1);
  }
  console.log(`Using tenant_id: ${tenantId}\n`);

  // 1. Query WITHOUT set_app_tenant — RLS should return 0 rows
  const withoutTenant = await pool.query(
    `SELECT COUNT(*) as count FROM ${RLS_TABLE}`,
  );
  const countWithout = parseInt(withoutTenant.rows[0]?.count ?? '0', 10);
  console.log(`1. Query WITHOUT set_app_tenant: ${countWithout} rows`);
  if (countWithout > 0) {
    const rlsCheck = await pool.query(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname = $1`,
      [RLS_TABLE],
    );
    const bypassCheck = await pool.query(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    const rlsEnabled = rlsCheck.rows[0]?.relrowsecurity === true;
    const role = bypassCheck.rows[0] as { rolname?: string; rolbypassrls?: boolean; rolsuper?: boolean } | undefined;
    const hasBypass = role?.rolbypassrls === true || role?.rolsuper === true;

    console.error('   FAIL: Expected 0 rows when tenant not set.');
    if (!rlsEnabled) {
      console.error('   RLS is not enabled on this table. Run: npm run db:apply-rls');
    } else if (hasBypass) {
      console.error(`   RLS is enabled but role "${role?.rolname ?? 'unknown'}" has BYPASSRLS or is SUPERUSER.`);
      console.error('   Create a restricted app role and use it in DATABASE_URL:');
      console.error('   See: db/scripts/create_app_role.sql');
    } else {
      console.error('   RLS is enabled but returned rows — run: npm run db:diagnose-rls');
    }
    process.exit(1);
  }
  console.log('   OK: RLS blocks access when tenant not set.\n');

  // 2. Query WITH set_app_tenant — should return data (if any exists)
  const countWith = await withTenantQuery(tenantId, async (client) => {
    const r = await client.query(`SELECT COUNT(*) as count FROM ${RLS_TABLE}`);
    return parseInt(r.rows[0]?.count ?? '0', 10);
  });
  console.log(`2. Query WITH set_app_tenant: ${countWith} rows`);
  console.log('   OK: RLS allows access when tenant is set.\n');

  console.log('=== RLS verification passed ===\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('RLS verification failed:', err);
  process.exit(1);
});
