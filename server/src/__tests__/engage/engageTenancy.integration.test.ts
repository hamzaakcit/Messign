/**
 * Provisioning, boot check and auth paths on real Postgres. Generic cross-tenant checks live in
 * engageIsolation.integration.test.ts.
 *
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import type { NextFunction, Request, Response } from 'express';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

function res(): Response {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r as Response;
}

describe.skipIf(!adminUrl)('engage provisioning and auth (real Postgres)', () => {
  let f: TenancyFixture;

  beforeAll(async () => { f = await setupTenancyFixture(); }, 60_000);
  afterAll(async () => { await f?.teardown(); });

  it('provisions two separate engage organizations with settings and an admin each', async () => {
    expect(f.A.organization.id).not.toBe(f.B.organization.id);
    for (const t of [f.A, f.B]) {
      const o = await f.admin.query('SELECT product FROM organizations WHERE id = $1', [t.organization.id]);
      expect(o.rows[0].product).toBe('engage');
      const s = await f.admin.query('SELECT send_enabled, timezone FROM engage.tenant_settings WHERE organization_id = $1', [t.organization.id]);
      expect(s.rows[0]).toEqual({ send_enabled: false, timezone: 'Europe/Istanbul' });
      const u = await f.admin.query('SELECT organization_id, role FROM reimbursement_users WHERE auth_user_id = $1', [t.admin.authUserId]);
      expect(u.rows[0]).toEqual({ organization_id: t.organization.id, role: 'admin' });
      const a = await f.admin.query('SELECT password_hash, must_change_password, temporary_password FROM employee_auth WHERE auth_user_id = $1', [t.admin.authUserId]);
      expect(await bcrypt.compare(t.temporaryPassword, a.rows[0].password_hash)).toBe(true);
      expect(a.rows[0].must_change_password).toBe(true);
      expect(a.rows[0].temporary_password).toBeNull();
    }
  });

  it('rolls back completely on a duplicate slug', async () => {
    const email = `dup@dup-${f.suffix}.example.com`;
    const client = await f.admin.connect();
    try {
      await expect(f.provision.provisionOrganization(client, {
        name: 'Dup', slug: f.A.organization.slug, adminEmail: email, adminFullName: 'Dup Admin',
      })).rejects.toThrow(f.provision.ProvisionConflictError);
    } finally { client.release(); }
    expect((await f.admin.query('SELECT 1 FROM reimbursement_users WHERE email = $1', [email])).rowCount).toBe(0);
    expect((await f.admin.query('SELECT 1 FROM employee_auth WHERE email = $1', [email])).rowCount).toBe(0);
    expect((await f.admin.query('SELECT 1 FROM organizations WHERE slug = $1', [f.A.organization.slug])).rowCount).toBe(1);
  });

  it('boot check passes for the engage role and rejects a bypass connection', async () => {
    await expect(f.engage.assertEngageRoleSafe()).resolves.toBe('messign_engage');
    const isSuper = await f.admin.query('SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user');
    if (isSuper.rows[0].bypass) await expect(f.engage.assertEngageRoleSafe(f.admin)).rejects.toThrow(/BYPASSRLS/);
  });

  it('the engage role cannot read legacy tables directly', async () => {
    await expect(f.engage.getEngagePool().query('SELECT 1 FROM reimbursement_users')).rejects.toThrow(/permission denied/);
    await expect(f.engage.getEngagePool().query('SELECT 1 FROM employee_auth')).rejects.toThrow(/permission denied/);
  });

  describe('api keys', () => {
    async function createKey(org: string, scopes: string[]) {
      const k = f.keys.generateApiKey();
      const id = await f.engage.withEngageTenant(org, async (c) => (await c.query<{ id: string }>(
        `INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'test', $2, $3, $4) RETURNING id`,
        [org, k.prefix, k.hash, scopes])).rows[0]!.id);
      return { ...k, id };
    }
    const callKey = async (plaintext: string, body: unknown = {}) => {
      const req = { header: (h: string) => (h === 'x-api-key' ? plaintext : undefined), body } as unknown as Request;
      const r = res();
      let nextCalled = false;
      await f.auth.requireApiKey(req, r, (() => { nextCalled = true; }) as NextFunction);
      return { req, r, nextCalled };
    };

    it('resolves the organization from the key, ignoring a body organization', async () => {
      const k = await createKey(f.A.organization.id, ['ingest']);
      const out = await callKey(k.plaintext, { organizationId: f.B.organization.id });
      expect(out.nextCalled).toBe(true);
      expect(out.req.engageApiKey).toMatchObject({ organizationId: f.A.organization.id, keyId: k.id, scopes: ['ingest'] });
      const used = await f.admin.query('SELECT last_used_at FROM engage.api_keys WHERE id = $1', [k.id]);
      expect(used.rows[0].last_used_at).not.toBeNull();
    });

    it('lookup exposes only the presented key, and cannot modify it', async () => {
      const a = await createKey(f.A.organization.id, ['ingest']);
      await createKey(f.B.organization.id, ['ingest']);
      const rows = await f.engage.withApiKeyLookup(a.hash, async (c) => (await c.query('SELECT id FROM engage.api_keys')).rows);
      expect(rows.map((r) => r.id)).toEqual([a.id]);
      await expect(f.engage.withApiKeyLookup(a.hash, (c) =>
        c.query(`UPDATE engage.api_keys SET revoked_at = now() WHERE id = $1`, [a.id]).then((r) => r.rowCount))).resolves.toBe(0);
    });

    it('rejects revoked and unknown keys', async () => {
      const k = await createKey(f.A.organization.id, ['ingest']);
      await f.admin.query('UPDATE engage.api_keys SET revoked_at = now() WHERE id = $1', [k.id]);
      expect((await callKey(k.plaintext)).r.status).toHaveBeenCalledWith(401);
      expect((await callKey(f.keys.generateApiKey().plaintext)).r.status).toHaveBeenCalledWith(401);
    });
  });

  describe('user auth', () => {
    const call = async (mw: (q: Request, s: Response, n: NextFunction) => Promise<void>, userId?: string, org?: string) => {
      const req = { userId, jwtOrganizationId: org } as unknown as Request;
      const r = res();
      let nextCalled = false;
      await mw(req, r, (() => { nextCalled = true; }) as NextFunction);
      return { req, r, nextCalled };
    };

    it('engage user: ok with a matching claim; 401 without a claim; 403 on mismatch or workspace org', async () => {
      const ok = await call(f.auth.requireEngageUser, f.A.admin.authUserId, f.A.organization.id);
      expect(ok.nextCalled).toBe(true);
      expect(ok.req.engageUser).toMatchObject({ organizationId: f.A.organization.id, role: 'admin' });
      expect((await call(f.auth.requireEngageUser, f.A.admin.authUserId, undefined)).r.status).toHaveBeenCalledWith(401);
      expect((await call(f.auth.requireEngageUser, f.A.admin.authUserId, f.B.organization.id)).r.status).toHaveBeenCalledWith(403);
      expect((await call(f.auth.requireEngageUser, f.platformUser, f.platformOrgId)).r.status).toHaveBeenCalledWith(403);
      expect((await call(f.auth.requireEngageUser, 'nobody', f.A.organization.id)).r.status).toHaveBeenCalledWith(403);
    });

    it('platform admin: only the platform org admin passes', async () => {
      expect((await call(f.auth.requirePlatformAdmin, f.platformUser, f.platformOrgId)).nextCalled).toBe(true);
      expect((await call(f.auth.requirePlatformAdmin, f.A.admin.authUserId, f.A.organization.id)).r.status).toHaveBeenCalledWith(403);
    });
  });
});
