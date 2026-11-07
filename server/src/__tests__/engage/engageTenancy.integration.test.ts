/**
 * Real-Postgres checks for migration 111 and the engage auth path. Skipped unless ENGAGE_TEST_ADMIN_URL points at a
 * scratch database whose role may CREATE ROLE (it applies a minimal legacy fixture, then migration 111).
 *
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageTenancy.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import type { NextFunction, Request, Response } from 'express';

const adminUrl = process.env.ENGAGE_TEST_ADMIN_URL;
const here = dirname(fileURLToPath(import.meta.url));
const migrations = join(here, '..', '..', 'migrations');
const ENGAGE_PASSWORD = 'engage-test-only';

const EMPLOYEE_AUTH_FIXTURE = `
CREATE TABLE IF NOT EXISTS employee_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  temporary_password VARCHAR(255),
  account_status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by VARCHAR(100) NOT NULL DEFAULT 'system',
  updated_by VARCHAR(100) NOT NULL DEFAULT 'system'
);`;

function res(): Response {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r as Response;
}

describe.skipIf(!adminUrl)('engage tenancy (real Postgres)', () => {
  let admin: pg.Pool;
  let engage: typeof import('../../engage/db.js');
  let provision: typeof import('../../engage/bootstrap/provisionOrganization.js');
  let auth: typeof import('../../engage/middleware/auth.js');
  let keys: typeof import('../../engage/apiKeys.js');
  const suffix = randomUUID().slice(0, 8);
  let A: Awaited<ReturnType<typeof provisionOne>>;
  let B: Awaited<ReturnType<typeof provisionOne>>;
  let platformOrgId: string;
  let platformUser: string;
  const created: string[] = [];

  async function provisionOne(name: string) {
    const client = await admin.connect();
    try {
      const r = await provision.provisionOrganization(client, {
        name, slug: `${name.toLowerCase()}-${suffix}`, adminEmail: `admin@${name.toLowerCase()}-${suffix}.example.com`, adminFullName: `${name} Admin`,
      });
      created.push(r.organization.id);
      return r;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
    await admin.query(readFileSync(join(migrations, '001_base_schema.sql'), 'utf-8'));
    await admin.query(EMPLOYEE_AUTH_FIXTURE);
    await admin.query(readFileSync(join(migrations, '111_engage_tenancy.sql'), 'utf-8'));
    await admin.query(`ALTER ROLE messign_engage LOGIN PASSWORD '${ENGAGE_PASSWORD}'`);
    const u = new URL(adminUrl!);
    u.username = 'messign_engage';
    u.password = ENGAGE_PASSWORD;
    process.env.ENGAGE_DATABASE_URL = u.toString();

    engage = await import('../../engage/db.js');
    provision = await import('../../engage/bootstrap/provisionOrganization.js');
    auth = await import('../../engage/middleware/auth.js');
    keys = await import('../../engage/apiKeys.js');

    const platform = await admin.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, product) VALUES ('Platform', $1, 'workspace') RETURNING id`, [`platform-${suffix}`]);
    platformOrgId = platform.rows[0]!.id;
    created.push(platformOrgId);
    platformUser = `platform-admin-${suffix}`;
    await admin.query(
      `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, status)
       VALUES ($1, $2, $3, 'Platform Admin', 'admin', 'active')`, [platformOrgId, platformUser, `root@platform-${suffix}.example.com`]);
    process.env.PLATFORM_ORG_SLUG = `platform-${suffix}`;

    A = await provisionOne('Alpha');
    B = await provisionOne('Bravo');
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    await engage?.closeEngagePool();
    await admin.query('DELETE FROM employee_auth WHERE auth_user_id = ANY($1)', [[A?.admin.authUserId, B?.admin.authUserId].filter(Boolean)]);
    await admin.query('DELETE FROM organizations WHERE id = ANY($1)', [created]);
    await admin.end();
  });

  it('provisions two separate engage organizations with settings and an admin each', async () => {
    expect(A.organization.id).not.toBe(B.organization.id);
    for (const t of [A, B]) {
      const o = await admin.query('SELECT product FROM organizations WHERE id = $1', [t.organization.id]);
      expect(o.rows[0].product).toBe('engage');
      const s = await admin.query('SELECT send_enabled, timezone FROM engage.tenant_settings WHERE organization_id = $1', [t.organization.id]);
      expect(s.rows[0]).toEqual({ send_enabled: false, timezone: 'Europe/Istanbul' });
      const u = await admin.query('SELECT organization_id, role FROM reimbursement_users WHERE auth_user_id = $1', [t.admin.authUserId]);
      expect(u.rows[0]).toEqual({ organization_id: t.organization.id, role: 'admin' });
      const a = await admin.query('SELECT password_hash, must_change_password, temporary_password FROM employee_auth WHERE auth_user_id = $1', [t.admin.authUserId]);
      expect(await bcrypt.compare(t.temporaryPassword, a.rows[0].password_hash)).toBe(true);
      expect(a.rows[0].must_change_password).toBe(true);
      expect(a.rows[0].temporary_password).toBeNull();
    }
  });

  it('rolls back completely on a duplicate slug', async () => {
    const before = await admin.query('SELECT count(*)::int AS n FROM reimbursement_users');
    const client = await admin.connect();
    try {
      await expect(provision.provisionOrganization(client, {
        name: 'Dup', slug: A.organization.slug, adminEmail: `dup@dup-${suffix}.example.com`, adminFullName: 'Dup Admin',
      })).rejects.toThrow(provision.ProvisionConflictError);
    } finally { client.release(); }
    const after = await admin.query('SELECT count(*)::int AS n FROM reimbursement_users');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('boot check passes for the engage role and rejects the admin connection', async () => {
    await expect(engage.assertEngageRoleSafe()).resolves.toBe('messign_engage');
    const isSuper = await admin.query('SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user');
    if (isSuper.rows[0].bypass) await expect(engage.assertEngageRoleSafe(admin)).rejects.toThrow(/BYPASSRLS/);
  });

  it('schema guard: every engage table has ENABLE + FORCE RLS and organization_id NOT NULL', async () => {
    const t = await admin.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND a.attnotnull) AS has_org
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'engage' AND c.relkind IN ('r', 'p')`);
    expect(t.rows.length).toBeGreaterThanOrEqual(3);
    for (const r of t.rows) expect(r, r.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, has_org: true });
  });

  it('no tenant context returns nothing from any engage table', async () => {
    for (const table of ['tenant_settings', 'tenant_readiness', 'api_keys']) {
      const r = await engage.getEngagePool().query(`SELECT 1 FROM engage.${table}`);
      expect(r.rowCount, table).toBe(0);
    }
  });

  it('tenant A cannot read, insert, update or delete tenant B rows', async () => {
    await engage.withEngageTenant(B.organization.id, (c) =>
      c.query(`INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'email', 'domain', 'b.example.com')`, [B.organization.id]));
    await engage.withEngageTenant(A.organization.id, async (c) => {
      expect((await c.query('SELECT 1 FROM engage.tenant_settings WHERE organization_id = $1', [B.organization.id])).rowCount).toBe(0);
      expect((await c.query('SELECT 1 FROM engage.tenant_readiness')).rowCount).toBe(0);
      expect((await c.query(`UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [B.organization.id])).rowCount).toBe(0);
      expect((await c.query('DELETE FROM engage.tenant_readiness WHERE organization_id = $1', [B.organization.id])).rowCount).toBe(0);
    });
    await expect(engage.withEngageTenant(A.organization.id, (c) =>
      c.query(`INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'email', 'x', 'y')`, [B.organization.id]),
    )).rejects.toThrow(/row-level security/);
    const b = await admin.query('SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1', [B.organization.id]);
    expect(b.rows[0].send_enabled).toBe(false);
  });

  it('switching organizations on one connection does not leak', async () => {
    const client = await engage.getEngagePool().connect();
    try {
      for (const [org, other] of [[A, B], [B, A], [A, B]] as const) {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', $1, true)", [org.organization.id]);
        const r = await client.query('SELECT organization_id FROM engage.tenant_settings');
        expect(r.rows.map((x) => x.organization_id)).toEqual([org.organization.id]);
        expect(r.rows.map((x) => x.organization_id)).not.toContain(other.organization.id);
        await client.query('COMMIT');
        expect((await client.query('SELECT 1 FROM engage.tenant_settings')).rowCount).toBe(0);
      }
    } finally { client.release(); }
  });

  it('the engage role cannot read legacy tables directly', async () => {
    await expect(engage.getEngagePool().query('SELECT 1 FROM reimbursement_users')).rejects.toThrow(/permission denied/);
    await expect(engage.getEngagePool().query('SELECT 1 FROM employee_auth')).rejects.toThrow(/permission denied/);
  });

  describe('api keys', () => {
    async function createKey(org: string, scopes: string[]) {
      const k = keys.generateApiKey();
      const id = await engage.withEngageTenant(org, async (c) => (await c.query<{ id: string }>(
        `INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'test', $2, $3, $4) RETURNING id`,
        [org, k.prefix, k.hash, scopes])).rows[0]!.id);
      return { ...k, id };
    }
    const callKey = async (plaintext: string, body: unknown = {}) => {
      const req = { header: (h: string) => (h === 'x-api-key' ? plaintext : undefined), body } as unknown as Request;
      const r = res();
      let nextCalled = false;
      await auth.requireApiKey(req, r, (() => { nextCalled = true; }) as NextFunction);
      return { req, r, nextCalled };
    };

    it('resolves the organization from the key, ignoring a body organization', async () => {
      const k = await createKey(A.organization.id, ['ingest']);
      const out = await callKey(k.plaintext, { organizationId: B.organization.id });
      expect(out.nextCalled).toBe(true);
      expect(out.req.engageApiKey).toMatchObject({ organizationId: A.organization.id, keyId: k.id, scopes: ['ingest'] });
      const used = await admin.query('SELECT last_used_at FROM engage.api_keys WHERE id = $1', [k.id]);
      expect(used.rows[0].last_used_at).not.toBeNull();
    });

    it('lookup exposes only the presented key, and nothing without it', async () => {
      const a = await createKey(A.organization.id, ['ingest']);
      await createKey(B.organization.id, ['ingest']);
      const rows = await engage.withApiKeyLookup(a.hash, async (c) => (await c.query('SELECT id FROM engage.api_keys')).rows);
      expect(rows.map((r) => r.id)).toEqual([a.id]);
      await expect(engage.withApiKeyLookup(a.hash, (c) =>
        c.query(`UPDATE engage.api_keys SET revoked_at = now() WHERE id = $1`, [a.id]).then((r) => r.rowCount))).resolves.toBe(0);
    });

    it('rejects revoked and unknown keys', async () => {
      const k = await createKey(A.organization.id, ['ingest']);
      await admin.query('UPDATE engage.api_keys SET revoked_at = now() WHERE id = $1', [k.id]);
      expect((await callKey(k.plaintext)).r.status).toHaveBeenCalledWith(401);
      expect((await callKey(keys.generateApiKey().plaintext)).r.status).toHaveBeenCalledWith(401);
    });
  });

  describe('user auth', () => {
    const call = async (mw: typeof auth.requireEngageUser, userId?: string, org?: string) => {
      const req = { userId, jwtOrganizationId: org } as unknown as Request;
      const r = res();
      let nextCalled = false;
      await mw(req, r, (() => { nextCalled = true; }) as NextFunction);
      return { req, r, nextCalled };
    };

    it('engage user: ok with a matching claim; 401 without a claim; 403 on mismatch or workspace org', async () => {
      const ok = await call(auth.requireEngageUser, A.admin.authUserId, A.organization.id);
      expect(ok.nextCalled).toBe(true);
      expect(ok.req.engageUser).toMatchObject({ organizationId: A.organization.id, role: 'admin' });
      expect((await call(auth.requireEngageUser, A.admin.authUserId, undefined)).r.status).toHaveBeenCalledWith(401);
      expect((await call(auth.requireEngageUser, A.admin.authUserId, B.organization.id)).r.status).toHaveBeenCalledWith(403);
      expect((await call(auth.requireEngageUser, platformUser, platformOrgId)).r.status).toHaveBeenCalledWith(403);
      expect((await call(auth.requireEngageUser, 'nobody', A.organization.id)).r.status).toHaveBeenCalledWith(403);
    });

    it('platform admin: only the platform org admin passes', async () => {
      expect((await call(auth.requirePlatformAdmin, platformUser, platformOrgId)).nextCalled).toBe(true);
      expect((await call(auth.requirePlatformAdmin, A.admin.authUserId, A.organization.id)).r.status).toHaveBeenCalledWith(403);
    });
  });
});
