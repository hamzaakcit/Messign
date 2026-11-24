/**
 * RLS verification (ADR-002 amendment).
 *
 * The app often connects as a superuser, which ignores row security.
 * This script prints that connecting role's bypass status, then runs the
 * row checks after SET LOCAL ROLE to a non-bypass role (default messign_app,
 * override with RLS_VERIFY_ROLE). A missing role or a failed SET ROLE exits 1.
 * The application pool is not switched.
 *
 * Run: npm run db:verify-rls
 */
import { pool } from '../db/index.js';
import { rlsVerifyRoleName } from './rlsVerifyRole.js';

const TENANT_SLUG = 'messign';

interface RoleStatus {
  currentUser: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

async function roleStatus(client: { query: typeof pool.query }): Promise<RoleStatus> {
  const result = await client.query(
    `SELECT current_user AS current_user,
            r.rolsuper,
            r.rolbypassrls
       FROM pg_roles r
      WHERE r.rolname = current_user`,
  );
  const row = result.rows[0] as {
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  };
  return {
    currentUser: row.current_user,
    rolsuper: row.rolsuper,
    rolbypassrls: row.rolbypassrls,
  };
}

async function main(): Promise<void> {
  const verifyRole = rlsVerifyRoleName(process.env.RLS_VERIFY_ROLE);
  const client = await pool.connect();
  try {
    const connecting = await roleStatus(client);
    console.log(
      `Connecting role: ${connecting.currentUser} superuser=${connecting.rolsuper} bypassrls=${connecting.rolbypassrls}`,
    );
    console.log(`Row checks run as: ${verifyRole}`);

    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [verifyRole]);
    if (exists.rows.length === 0) {
      console.error(`FAIL: role ${verifyRole} does not exist. Create it before treating RLS as verified.`);
      process.exit(1);
    }

    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${verifyRole}`);
    const acting = await roleStatus(client);
    if (acting.rolsuper || acting.rolbypassrls) {
      console.error(
        `FAIL: ${acting.currentUser} still bypasses RLS (superuser=${acting.rolsuper} bypassrls=${acting.rolbypassrls}).`,
      );
      process.exit(1);
    }

    const orgResult = await client.query(
      `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
      [TENANT_SLUG],
    );
    const tenantId = orgResult.rows[0]?.id as string | undefined;
    if (!tenantId) {
      console.error(`No organization with slug "${TENANT_SLUG}" found. Seed the DB first.`);
      process.exit(1);
    }

    const noTenant = await client.query('SELECT COUNT(*)::int AS n FROM support_tickets');
    const leaked = Number(noTenant.rows[0]?.n ?? 0);
    if (leaked > 0) {
      console.error(
        `FAIL: ${leaked} support_tickets rows visible to ${verifyRole} without app.current_tenant.`,
      );
      process.exit(1);
    }
    console.log(`OK: ${verifyRole} sees 0 support_tickets without a tenant.`);

    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    const withTenant = await client.query('SELECT COUNT(*)::int AS n FROM support_tickets');
    const visible = Number(withTenant.rows[0]?.n ?? 0);
    console.log(`OK: with tenant ${TENANT_SLUG} (${tenantId}), visible support_tickets = ${visible}.`);
    console.log('RLS verification passed.');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('RLS verification error:', message);
  process.exit(1);
});
