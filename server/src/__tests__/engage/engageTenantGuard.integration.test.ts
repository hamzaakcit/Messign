/**
 * ADR-017 against real Postgres: the guard's organization lookup (organizations.product) decides who is a tenant.
 *
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageTenantGuard.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('tenant guard (real Postgres)', () => {
  let f: TenancyFixture;
  let guard: typeof import('../../middleware/tenantGuard.js');

  beforeAll(async () => {
    f = await setupTenancyFixture(); // points the legacy pool at the scratch database
    guard = await import('../../middleware/tenantGuard.js');
  }, 60_000);
  afterAll(async () => { await f?.teardown(); });

  const call = async (url: string, org: string | undefined) => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    const next = vi.fn();
    await guard.createTenantGuard(async (o) => guard.isEngageTenantOrg(o, guard.createProductResolver()))(
      { originalUrl: url, jwtOrganizationId: org } as unknown as Request, res as Response, next as unknown as NextFunction);
    return { status: (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number | undefined, passed: next.mock.calls.length === 1 };
  };

  it('a tenant is refused on Company-OS routes and allowed on the engage API, sign-in and health', async () => {
    for (const org of [f.A.organization.id, f.B.organization.id]) {
      expect(await call('/api/users', org)).toEqual({ status: 403, passed: false });
      expect(await call('/api/dashboard/command-center', org)).toEqual({ status: 403, passed: false });
      expect((await call('/api/engage/me', org)).passed).toBe(true);
      expect((await call('/api/auth/me', org)).passed).toBe(true);
      expect((await call('/api/health', org)).passed).toBe(true);
    }
  });

  it('the platform organization is not a tenant, whether or not engage is enabled for it', async () => {
    expect((await call('/api/users', f.platformOrgId)).passed).toBe(true);
    const enable = await import('../../engage/bootstrap/enablePlatformOrganization.js');
    const client = await f.admin.connect();
    try { await enable.setPlatformEngage(client, true); } finally { client.release(); }
    try {
      expect((await call('/api/users', f.platformOrgId)).passed).toBe(true);
    } finally {
      const c = await f.admin.connect();
      try { await enable.setPlatformEngage(c, false); } finally { c.release(); }
    }
  });

  it('an organization that does not exist is not treated as a tenant', async () => {
    expect((await call('/api/users', '99999999-9999-4999-8999-999999999999')).passed).toBe(true);
  });
});
