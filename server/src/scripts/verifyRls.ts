/**
 * RLS Verification Script
 *
 * Verifies that Row-Level Security is actually enforced at the database layer,
 * not just declared. Must connect through a non-bypass, non-superuser role.
 *
 * D-07 confirmed the app's default connection (DATABASE_URL on Railway) is the
 * `postgres` SUPERUSER/BYPASSRLS role, which silently ignores every RLS policy
 * (see docs/roadmap/decisions-pending.md, ADR-002 amendment). Running this
 * script against that connection would report a false pass, so it refuses to
 * reuse the app's pool and requires a dedicated non-bypass connection string.
 *
 * Setup: create a restricted role (psql -f db/scripts/create_app_role.sql),
 * then set RLS_VERIFY_DATABASE_URL to that role's connection string.
 *
 * Run: npm run db:verify-rls (from server/)
 */
import pg from 'pg';

const RLS_TABLE = 'support_tickets';

class RlsVerificationError extends Error {}

async function main(): Promise<void> {
  const connectionString = process.env.RLS_VERIFY_DATABASE_URL;
  if (!connectionString) {
    throw new RlsVerificationError(
      'RLS_VERIFY_DATABASE_URL is required. It must point at a non-bypass, non-superuser role ' +
        '(see db/scripts/create_app_role.sql). Reusing DATABASE_URL would silently bypass RLS.',
    );
  }

  const pool = new pg.Pool({ connectionString, max: 1 });

  try {
    console.log('\n=== RLS Verification ===\n');

    const roleCheck = await pool.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    const role = roleCheck.rows[0];
    if (!role || role.rolbypassrls || role.rolsuper) {
      throw new RlsVerificationError(
        `Connected role "${role?.rolname ?? 'unknown'}" has BYPASSRLS or SUPERUSER — RLS is not enforced for it. ` +
          'Point RLS_VERIFY_DATABASE_URL at a role created via db/scripts/create_app_role.sql.',
      );
    }
    console.log(`Connected as non-bypass role: ${role.rolname}\n`);

    const orgResult = await pool.query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`,
    );
    const tenantId = orgResult.rows[0]?.id;
    if (!tenantId) {
      throw new RlsVerificationError('No organization found. Run migrations and seed first.');
    }
    console.log(`Using tenant_id: ${tenantId}\n`);

    // 1. Query WITHOUT set_app_tenant — RLS should return 0 rows
    const withoutTenant = await pool.query<{ count: string }>(`SELECT COUNT(*) as count FROM ${RLS_TABLE}`);
    const countWithout = parseInt(withoutTenant.rows[0]?.count ?? '0', 10);
    console.log(`1. Query WITHOUT set_app_tenant: ${countWithout} rows`);
    if (countWithout > 0) {
      throw new RlsVerificationError(
        'Expected 0 rows when tenant not set. RLS is enabled but returned rows — run: npm run db:diagnose-rls',
      );
    }
    console.log('   OK: RLS blocks access when tenant not set.\n');

    // 2. Query WITH set_app_tenant — should return data (if any exists)
    const client = await pool.connect();
    let countWith: number;
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const r = await client.query<{ count: string }>(`SELECT COUNT(*) as count FROM ${RLS_TABLE}`);
      countWith = parseInt(r.rows[0]?.count ?? '0', 10);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    console.log(`2. Query WITH set_app_tenant: ${countWith} rows`);
    console.log('   OK: RLS allows access when tenant is set.\n');

    console.log('=== RLS verification passed ===\n');
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('RLS verification failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
