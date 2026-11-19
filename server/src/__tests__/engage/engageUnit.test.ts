import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { generateApiKey, hashApiKey, looksLikeApiKey, parseScopes } from '../../engage/apiKeys.js';
import { validateProvisionInput, ProvisionValidationError } from '../../engage/bootstrap/provisionOrganization.js';

const poolQuery = vi.fn();
const lookupResult = vi.fn();
const tenantTouch = vi.fn();

vi.mock('../../engage/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../engage/db.js')>()),
  getEngagePool: () => ({ query: poolQuery }),
  withApiKeyLookup: async (_hash: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rows: lookupResult() }) }),
  withEngageTenant: async (_org: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: async (...args: unknown[]) => tenantTouch(...args) }),
}));

const { assertEngageRoleSafe, withEngageTenant: realWithTenant } = await vi.importActual<typeof import('../../engage/db.js')>('../../engage/db.js');
const { requireEngageUser, requirePlatformAdmin, requireApiKey, requireScope } = await import('../../engage/middleware/auth.js');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function res(): Response {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r as Response;
}
function req(over: Record<string, unknown> = {}): Request {
  return { header: () => undefined, ...over } as unknown as Request;
}
const userRow = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1', role: 'admin', organization_id: ORG_A, org_slug: 'tenant-a', org_product: 'engage', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('api keys', () => {
  it('generates keys that match the format and hash deterministically', () => {
    const k = generateApiKey();
    expect(looksLikeApiKey(k.plaintext)).toBe(true);
    expect(k.hash).toBe(hashApiKey(k.plaintext));
    expect(k.plaintext.startsWith(k.prefix)).toBe(true);
    expect(generateApiKey().plaintext).not.toBe(k.plaintext);
  });
  it('rejects malformed keys and unknown scopes', () => {
    expect(looksLikeApiKey('nope')).toBe(false);
    expect(parseScopes(['ingest', 'ingest'])).toEqual(['ingest']);
    expect(parseScopes(['admin'])).toBeNull();
    expect(parseScopes([])).toBeNull();
    expect(parseScopes('ingest')).toBeNull();
  });
});

describe('provision input validation', () => {
  const ok = { name: 'Demo Books', slug: 'demo-books', adminEmail: 'Admin@Example.com', adminFullName: 'Ada Admin' };
  it('normalizes a valid body', () => {
    expect(validateProvisionInput(ok).adminEmail).toBe('admin@example.com');
  });
  it.each([
    { ...ok, slug: 'Bad Slug' },
    { ...ok, slug: 'x' },
    { ...ok, adminEmail: 'nope' },
    { ...ok, name: '' },
    null,
  ])('rejects %j', (body) => {
    expect(() => validateProvisionInput(body)).toThrow(ProvisionValidationError);
  });
});

describe('engage database guards', () => {
  it('refuses a superuser or bypass role', async () => {
    await expect(assertEngageRoleSafe({ query: async () => ({ rows: [{ rolname: 'postgres', rolsuper: true, rolbypassrls: true }] }) } as never)).rejects.toThrow(/BYPASSRLS/);
    await expect(assertEngageRoleSafe({ query: async () => ({ rows: [{ rolname: 'x', rolsuper: false, rolbypassrls: true }] }) } as never)).rejects.toThrow();
  });
  it('accepts a restricted role', async () => {
    await expect(assertEngageRoleSafe({ query: async () => ({ rows: [{ rolname: 'messign_engage', rolsuper: false, rolbypassrls: false }] }) } as never)).resolves.toBe('messign_engage');
  });
  it('requires a UUID tenant id before touching the pool', () => {
    expect(() => realWithTenant("x'; DROP TABLE y;--", async () => 1)).toThrow(/UUID/);
  });
});

describe('requireEngageUser (no fallback organization)', () => {
  it('401 without a user, and without an organization claim', async () => {
    const a = res(); const n = vi.fn() as NextFunction;
    await requireEngageUser(req(), a, n);
    expect(a.status).toHaveBeenCalledWith(401);
    const b = res();
    await requireEngageUser(req({ userId: 'au1' }), b, n);
    expect(b.status).toHaveBeenCalledWith(401);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(n).not.toHaveBeenCalled();
  });
  it('403 when the claim organization differs from the user row', async () => {
    poolQuery.mockResolvedValue({ rows: [userRow()] });
    const r = res(); const n = vi.fn() as NextFunction;
    await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_B }), r, n);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(n).not.toHaveBeenCalled();
  });
  it('403 for a non-engage organization and for an unprovisioned user', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [userRow({ org_product: 'workspace' })] });
    const r = res(); const n = vi.fn() as NextFunction;
    await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_A }), r, n);
    expect(r.status).toHaveBeenCalledWith(403);
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const r2 = res();
    await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_A }), r2, n);
    expect(r2.status).toHaveBeenCalledWith(403);
    expect(n).not.toHaveBeenCalled();
  });
  it('allows the platform organization once its product is all (ADR-016); any other product is refused', async () => {
    const n = vi.fn() as NextFunction;
    poolQuery.mockResolvedValueOnce({ rows: [userRow({ org_slug: 'messign', org_product: 'all' })] });
    await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_A }), res(), n);
    expect(n).toHaveBeenCalledTimes(1);
    for (const product of ['workspace', 'ALL', 'both', '']) {
      poolQuery.mockResolvedValueOnce({ rows: [userRow({ org_product: product })] });
      const r = res();
      await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_A }), r, n);
      expect(r.status).toHaveBeenCalledWith(403);
    }
    expect(n).toHaveBeenCalledTimes(1);
  });
  it('sets the context from the user row on success', async () => {
    poolQuery.mockResolvedValue({ rows: [userRow()] });
    const q = req({ userId: 'au1', jwtOrganizationId: ORG_A });
    const n = vi.fn() as NextFunction;
    await requireEngageUser(q, res(), n);
    expect(n).toHaveBeenCalled();
    expect(q.engageUser).toMatchObject({ organizationId: ORG_A, role: 'admin' });
  });
  it('500 (not pass-through) when the lookup throws', async () => {
    poolQuery.mockRejectedValue(new Error('db down'));
    const r = res(); const n = vi.fn() as NextFunction;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await requireEngageUser(req({ userId: 'au1', jwtOrganizationId: ORG_A }), r, n);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(n).not.toHaveBeenCalled();
  });
});

describe('requirePlatformAdmin', () => {
  it('allows only an admin of the platform organization', async () => {
    const n = vi.fn() as NextFunction;
    poolQuery.mockResolvedValueOnce({ rows: [userRow({ org_slug: 'messign', org_product: 'workspace' })] });
    await requirePlatformAdmin(req({ userId: 'au1', jwtOrganizationId: ORG_A }), res(), n);
    expect(n).toHaveBeenCalledTimes(1);
    for (const row of [userRow(), userRow({ org_slug: 'messign', role: 'employee' })]) {
      poolQuery.mockResolvedValueOnce({ rows: [row] });
      const r = res();
      await requirePlatformAdmin(req({ userId: 'au1', jwtOrganizationId: ORG_A }), r, n);
      expect(r.status).toHaveBeenCalledWith(403);
    }
    expect(n).toHaveBeenCalledTimes(1);
  });
  it('honours PLATFORM_ORG_SLUG', async () => {
    vi.stubEnv('PLATFORM_ORG_SLUG', 'ops');
    poolQuery.mockResolvedValueOnce({ rows: [userRow({ org_slug: 'ops' })] });
    const n = vi.fn() as NextFunction;
    await requirePlatformAdmin(req({ userId: 'au1', jwtOrganizationId: ORG_A }), res(), n);
    expect(n).toHaveBeenCalled();
  });
});

describe('requireApiKey', () => {
  const key = generateApiKey();
  const withKey = (value?: string) => req({ header: (h: string) => (h === 'x-api-key' ? value : undefined), body: { organizationId: ORG_B } });

  it('401 for missing, malformed or unknown keys', async () => {
    const n = vi.fn() as NextFunction;
    for (const value of [undefined, 'garbage']) {
      const r = res();
      await requireApiKey(withKey(value), r, n);
      expect(r.status).toHaveBeenCalledWith(401);
    }
    lookupResult.mockReturnValue([]);
    const r = res();
    await requireApiKey(withKey(key.plaintext), r, n);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(n).not.toHaveBeenCalled();
  });
  it('401 for a revoked key', async () => {
    lookupResult.mockReturnValue([{ id: 'k1', organization_id: ORG_A, scopes: ['ingest'], revoked_at: '2026-01-01', last_used_at: null }]);
    const r = res();
    await requireApiKey(withKey(key.plaintext), r, vi.fn() as NextFunction);
    expect(r.status).toHaveBeenCalledWith(401);
  });
  it('takes the organization from the key record, ignoring the request body', async () => {
    lookupResult.mockReturnValue([{ id: 'k1', organization_id: ORG_A, scopes: ['ingest'], revoked_at: null, last_used_at: new Date().toISOString() }]);
    const q = withKey(key.plaintext);
    const n = vi.fn() as NextFunction;
    await requireApiKey(q, res(), n);
    expect(n).toHaveBeenCalled();
    expect(q.engageApiKey?.organizationId).toBe(ORG_A);
    expect(tenantTouch).not.toHaveBeenCalled();
  });
  it('updates last_used_at only when stale', async () => {
    lookupResult.mockReturnValue([{ id: 'k1', organization_id: ORG_A, scopes: ['ingest'], revoked_at: null, last_used_at: null }]);
    await requireApiKey(withKey(key.plaintext), res(), vi.fn() as NextFunction);
    expect(tenantTouch).toHaveBeenCalledTimes(1);
  });
  it('requireScope denies a key without the scope', () => {
    const r = res(); const n = vi.fn() as NextFunction;
    requireScope('journeys:trigger')(req({ engageApiKey: { organizationId: ORG_A, keyId: 'k', scopes: ['ingest'] } }), r, n);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(n).not.toHaveBeenCalled();
  });
});
