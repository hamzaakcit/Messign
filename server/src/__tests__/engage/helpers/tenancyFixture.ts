/**
 * Shared real-Postgres fixture for the engage isolation tests. Needs ENGAGE_TEST_ADMIN_URL pointing at a scratch
 * database (Postgres 17 + pgvector, role allowed to CREATE ROLE and CREATE EXTENSION). It builds the schema with the
 * real migration runner (production baseline + engage migrations), gives messign_engage a test-only login, and
 * provisions two tenants (A and B) plus a platform admin.
 */
import { randomUUID } from 'crypto';
import pg from 'pg';
import { runMigrations } from '../../../migrations/runner.js';

const ENGAGE_PASSWORD = 'engage-test-only';

export const adminUrl = process.env.ENGAGE_TEST_ADMIN_URL;

export type Tenant = Awaited<ReturnType<typeof import('../../../engage/bootstrap/provisionOrganization.js').provisionOrganization>>;

export interface TenancyFixture {
  admin: pg.Pool;
  suffix: string;
  A: Tenant;
  B: Tenant;
  platformOrgId: string;
  platformUser: string;
  engage: typeof import('../../../engage/db.js');
  provision: typeof import('../../../engage/bootstrap/provisionOrganization.js');
  auth: typeof import('../../../engage/middleware/auth.js');
  keys: typeof import('../../../engage/apiKeys.js');
  provisionTenant: (name: string) => Promise<Tenant>;
  teardown: () => Promise<void>;
}

export async function setupTenancyFixture(): Promise<TenancyFixture> {
  const admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
  // Test files run in parallel against one database; the runner serializes itself with an advisory lock.
  const vector = await admin.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'vector'`);
  if (vector.rowCount === 0) {
    throw new Error('ENGAGE_TEST_ADMIN_URL must point at a Postgres with pgvector (the production baseline needs it), e.g. pgvector/pgvector:pg17.');
  }
  await runMigrations({ connectionString: adminUrl!, log: () => undefined });
  // ALTER ROLE updates a shared catalog row; two test files doing it at once fail with "tuple concurrently updated".
  const lock = await admin.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(7040501)');
    await lock.query(`ALTER ROLE messign_engage LOGIN PASSWORD '${ENGAGE_PASSWORD}'`);
  } finally {
    await lock.query('SELECT pg_advisory_unlock(7040501)').catch(() => undefined);
    lock.release();
  }

  const u = new URL(adminUrl!);
  u.username = 'messign_engage';
  u.password = ENGAGE_PASSWORD;
  process.env.ENGAGE_DATABASE_URL = u.toString();

  // The provisioning route uses the legacy pool. Point it at the scratch database before it can be imported, and
  // refuse to continue if it still resolves anywhere else (its default is the developer's local `messign` database).
  process.env.DATABASE_URL = adminUrl;
  delete process.env.PGBOUNCER_URL;
  delete process.env.DATABASE_PUBLIC_URL;
  const legacy = await import('../../../db/index.js');
  if ((legacy.pool as unknown as { options: { connectionString?: string } }).options.connectionString !== adminUrl) {
    throw new Error('Legacy pool does not point at ENGAGE_TEST_ADMIN_URL; refusing to run against another database.');
  }

  const engage = await import('../../../engage/db.js');
  const provision = await import('../../../engage/bootstrap/provisionOrganization.js');
  const auth = await import('../../../engage/middleware/auth.js');
  const keys = await import('../../../engage/apiKeys.js');

  const suffix = randomUUID().slice(0, 8);
  const created: string[] = [];
  const authUserIds: string[] = [];

  const platform = await admin.query<{ id: string }>(
    `INSERT INTO organizations (name, slug, product) VALUES ('Platform', $1, 'workspace') RETURNING id`, [`platform-${suffix}`]);
  const platformOrgId = platform.rows[0]!.id;
  created.push(platformOrgId);
  const platformUser = `platform-admin-${suffix}`;
  await admin.query(
    `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status)
     VALUES ($1, $1, $2, $3, 'Platform Admin', 'admin', 'active')`, [platformOrgId, platformUser, `root@platform-${suffix}.example.com`]);
  process.env.PLATFORM_ORG_SLUG = `platform-${suffix}`;

  async function provisionTenant(name: string): Promise<Tenant> {
    const client = await admin.connect();
    try {
      const t = await provision.provisionOrganization(client, {
        name, slug: `${name.toLowerCase()}-${suffix}`, adminEmail: `admin@${name.toLowerCase()}-${suffix}.example.com`, adminFullName: `${name} Admin`,
      });
      created.push(t.organization.id);
      authUserIds.push(t.admin.authUserId);
      return t;
    } finally {
      client.release();
    }
  }

  const A = await provisionTenant('Alpha');
  const B = await provisionTenant('Bravo');

  return {
    admin, suffix, A, B, platformOrgId, platformUser, engage, provision, auth, keys, provisionTenant,
    teardown: async () => {
      await engage.closeEngagePool();
      await legacy.pool.end();
      await admin.query('DELETE FROM employee_auth WHERE auth_user_id = ANY($1)', [authUserIds]);
      await admin.query('DELETE FROM organizations WHERE id = ANY($1)', [created]);
      await admin.end();
    },
  };
}
