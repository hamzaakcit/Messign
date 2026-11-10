/**
 * The platform organization may use engage (ADR-016, migration 126): the new product value, the operator's switch, and
 * what the switch does and does not open. Real Postgres.
 *
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageEnablePlatform.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

function res(): Response {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r as Response;
}

describe.skipIf(!adminUrl)('the platform organization and engage (real Postgres)', () => {
  let f: TenancyFixture;
  let enable: typeof import('../../engage/bootstrap/enablePlatformOrganization.js');

  beforeAll(async () => {
    f = await setupTenancyFixture();
    enable = await import('../../engage/bootstrap/enablePlatformOrganization.js');
  }, 60_000);
  afterAll(async () => { await f?.teardown(); });

  const run = async (on: boolean) => {
    const c = await f.admin.connect();
    try { return await enable.setPlatformEngage(c, on); } finally { c.release(); }
  };
  const callEngageUser = async (authUserId: string, org: string) => {
    const req = { userId: authUserId, jwtOrganizationId: org } as unknown as Request;
    const r = res();
    let nextCalled = false;
    await f.auth.requireEngageUser(req, r, (() => { nextCalled = true; }) as NextFunction);
    return { req, r, nextCalled };
  };

  it('the product column accepts workspace, engage and all, and nothing else', async () => {
    for (const product of ['workspace', 'engage', 'all']) {
      const o = await f.admin.query<{ id: string }>(`INSERT INTO organizations (name, slug, product) VALUES ($1, $2, $3) RETURNING id`, [`P ${product}`, `p-${product}-${f.suffix}`, product]);
      await f.admin.query('DELETE FROM organizations WHERE id = $1', [o.rows[0]!.id]);
    }
    await expect(f.admin.query(`INSERT INTO organizations (name, slug, product) VALUES ('Bad', $1, 'both')`, [`bad-${f.suffix}`])).rejects.toThrow(/organizations_product_check/);
  });

  it('switching on sets product all and creates the settings row with sending off; again changes nothing; off goes back', async () => {
    const before = await f.admin.query('SELECT product FROM organizations WHERE id = $1', [f.platformOrgId]);
    expect(before.rows[0].product).toBe('workspace');
    expect(await run(true)).toMatchObject({ organizationId: f.platformOrgId, product: 'all', changed: true });
    const s = await f.admin.query('SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1', [f.platformOrgId]);
    expect(s.rows).toEqual([{ send_enabled: false }]);
    expect(await run(true)).toMatchObject({ product: 'all', changed: false });
    expect(await run(false)).toMatchObject({ product: 'workspace', changed: true });
    expect((await f.admin.query('SELECT product FROM organizations WHERE id = $1', [f.platformOrgId])).rows[0].product).toBe('workspace');
    expect(await run(false)).toMatchObject({ product: 'workspace', changed: false });
  });

  it('refuses an engage tenant and a platform organization that does not exist, and changes nothing', async () => {
    const original = process.env.PLATFORM_ORG_SLUG;
    try {
      process.env.PLATFORM_ORG_SLUG = f.A.organization.slug;
      await expect(run(true)).rejects.toThrow(enable.EnablePlatformError);
      await expect(run(false)).rejects.toThrow(enable.EnablePlatformError);
      expect((await f.admin.query('SELECT product FROM organizations WHERE id = $1', [f.A.organization.id])).rows[0].product).toBe('engage');
      process.env.PLATFORM_ORG_SLUG = `missing-${f.suffix}`;
      await expect(run(true)).rejects.toThrow(/does not exist/);
    } finally {
      process.env.PLATFORM_ORG_SLUG = original;
    }
  });

  it('the platform user passes the engage auth only while the switch is on; a workspace user stays refused', async () => {
    expect((await callEngageUser(f.platformUser, f.platformOrgId)).r.status).toHaveBeenCalledWith(403);
    await run(true);
    try {
      const on = await callEngageUser(f.platformUser, f.platformOrgId);
      expect(on.nextCalled).toBe(true);
      expect(on.req.engageUser).toMatchObject({ organizationId: f.platformOrgId, role: 'admin', product: 'all' });
      // A tenant reports its own product, so the client can tell it apart from the platform organization.
      expect((await callEngageUser(f.A.admin.authUserId, f.A.organization.id)).req.engageUser).toMatchObject({ product: 'engage' });
      // The claim must still be the user's own organization.
      expect((await callEngageUser(f.platformUser, f.A.organization.id)).r.status).toHaveBeenCalledWith(403);
    } finally {
      await run(false);
    }
    expect((await callEngageUser(f.platformUser, f.platformOrgId)).r.status).toHaveBeenCalledWith(403);
  });

  it('the platform organization is a tenant of its own: its engage data is invisible to other tenants, and theirs to it', async () => {
    await run(true);
    try {
      await f.engage.withEngageTenant(f.platformOrgId, (c) => c.query(`INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, 'platform-only')`, [f.platformOrgId]));
      await f.engage.withEngageTenant(f.A.organization.id, (c) => c.query(`INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, 'alpha-only')`, [f.A.organization.id]));
      const seenByPlatform = await f.engage.withEngageTenant(f.platformOrgId, async (c) => (await c.query<{ external_id: string }>('SELECT external_id FROM engage.profiles ORDER BY 1')).rows.map((r) => r.external_id));
      const seenByAlpha = await f.engage.withEngageTenant(f.A.organization.id, async (c) => (await c.query<{ external_id: string }>('SELECT external_id FROM engage.profiles ORDER BY 1')).rows.map((r) => r.external_id));
      expect(seenByPlatform).toEqual(['platform-only']);
      expect(seenByAlpha).toEqual(['alpha-only']);
      // Another tenant's id as the platform's own claim is refused as before.
      expect((await callEngageUser(f.A.admin.authUserId, f.platformOrgId)).r.status).toHaveBeenCalledWith(403);
    } finally {
      await run(false);
    }
  });
});
