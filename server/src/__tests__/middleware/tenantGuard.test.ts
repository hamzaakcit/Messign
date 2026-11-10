import type { NextFunction, Request, Response } from 'express';
import { createProductResolver, createTenantGuard, isEngageTenantOrg } from '../../middleware/tenantGuard.js';

/**
 * ADR-017: an engage tenant's token reaches sign-in and the engage API only. Everything else is closed to it, so a
 * Company-OS route written later is closed too without anyone remembering to close it.
 */

const ORG = '11111111-2222-4333-8444-555555555555';

const mockReq = (originalUrl: string, jwtOrganizationId?: string): Request => ({ originalUrl, jwtOrganizationId } as unknown as Request);
function mockRes(): Response {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r as Response;
}
/** A guard over a fake organization lookup; `lookup` is what the database would answer. */
function guardWith(lookup: (id: string) => Promise<string | null>) {
  const resolve = createProductResolver(lookup);
  const guard = createTenantGuard((org) => isEngageTenantOrg(org, resolve));
  /** `org`: the token's organization claim; `null` means the token has none. */
  return async (url: string, org: string | null = ORG) => {
    const res = mockRes(); const next = vi.fn() as unknown as NextFunction;
    await guard(mockReq(url, org ?? undefined), res, next);
    return { res, next: next as unknown as ReturnType<typeof vi.fn> };
  };
}

describe('tenantGuard', () => {
  it('closes every Company-OS route to a tenant, including routes that do not exist yet', async () => {
    const call = guardWith(async () => 'engage');
    for (const url of [
      '/api/users', '/api/users/me', '/api/projects', '/api/tasks', '/api/dashboard/command-center?days=7', '/api/marketing/leads/funnel',
      '/api/admin/users', '/api/notifications', '/api/leaderboard?limit=10', '/api/some-route-added-next-year',
    ]) {
      const { res, next } = await call(url);
      expect(res.status, url).toHaveBeenCalledWith(403);
      expect(next, url).not.toHaveBeenCalled();
    }
  });

  it('lets a tenant reach sign-in, the session, the engage API and health, without asking the database', async () => {
    const lookup = vi.fn(async () => 'engage');
    const call = guardWith(lookup);
    for (const url of ['/api/auth/login', '/api/auth/refresh', '/api/auth/me', '/api/engage/me', '/api/engage/profiles?limit=50', '/api/engage/journeys/abc/analytics?windowHours=72', '/api/health', '/api/health?probe=1', '/api/auth?next=1']) {
      const { next } = await call(url);
      expect(next, url).toHaveBeenCalledTimes(1);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('does not let case, a longer name, dot segments or encoded slashes turn a Company-OS path into an allowed one', async () => {
    const call = guardWith(async () => 'engage');
    for (const url of [
      '/API/USERS', '/api/authx', '/api/engagement', '/api/healthz', '/api/auth/../users', '/api/engage/../projects',
      '/api/auth/%2e%2e/users', '/api/auth%2f..%2fusers', '//api/auth/users', '/api/auth\\..\\users',
    ]) {
      const { res, next } = await call(url);
      expect(res.status, url).toHaveBeenCalledWith(403);
      expect(next, url).not.toHaveBeenCalled();
    }
  });

  it('treats the allowed prefixes case-insensitively, as Express routes them', async () => {
    const call = guardWith(async () => 'engage');
    expect((await call('/API/ENGAGE/me')).next).toHaveBeenCalledTimes(1);
  });

  it('leaves everyone who is not a tenant alone: workspace, the platform organization (all), an unknown organization', async () => {
    for (const product of ['workspace', 'all', null]) {
      const call = guardWith(async () => product);
      const { next, res } = await call('/api/users');
      expect(next, String(product)).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('leaves a request with no organization claim, or a claim that is not an id, alone and never asks the database', async () => {
    const lookup = vi.fn(async () => 'engage');
    const call = guardWith(lookup);
    expect((await call('/api/users', null)).next).toHaveBeenCalledTimes(1);
    expect((await call('/api/users', 'not-a-uuid')).next).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses (503) when the organization cannot be read, but still lets sign-in through', async () => {
    const call = guardWith(async () => { throw new Error('db down'); });
    const refused = await call('/api/users');
    expect(refused.res.status).toHaveBeenCalledWith(503);
    expect(refused.next).not.toHaveBeenCalled();
    expect((await call('/api/auth/login')).next).toHaveBeenCalledTimes(1);
  });

  it('asks the database once per organization within the cache time, and again after it', async () => {
    let now = 1_000_000;
    const lookup = vi.fn(async () => 'engage');
    const resolve = createProductResolver(lookup, () => now);
    await resolve(ORG); await resolve(ORG); await resolve(ORG);
    expect(lookup).toHaveBeenCalledTimes(1);
    now += 29_000; await resolve(ORG);
    expect(lookup).toHaveBeenCalledTimes(1);
    now += 2_000; await resolve(ORG);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('isEngageTenantOrg is true for engage only', async () => {
    for (const [product, expected] of [['engage', true], ['all', false], ['workspace', false], [null, false]] as const) {
      expect(await isEngageTenantOrg(ORG, async () => product)).toBe(expected);
    }
    expect(await isEngageTenantOrg(undefined, async () => 'engage')).toBe(false);
  });
});
