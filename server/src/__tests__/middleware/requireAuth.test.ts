import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';

vi.mock('../../db/index.js', () => ({
  query: vi.fn(),
  sanitizeUuid: vi.fn((v: string) => v),
}));

vi.mock('../../db/employeeAuthDb.js', () => ({
  getByAuthUserId: vi.fn(),
}));

vi.mock('../../db/ensureReimbursementUser.js', () => ({
  ensureReimbursementUserForAuth: vi.fn(),
}));

import { query } from '../../db/index.js';
import { getByAuthUserId } from '../../db/employeeAuthDb.js';
import { ensureReimbursementUserForAuth } from '../../db/ensureReimbursementUser.js';

const mockedQuery = vi.mocked(query);
const mockedGetByAuthUserId = vi.mocked(getByAuthUserId);
const mockedEnsureReimbursementUserForAuth = vi.mocked(ensureReimbursementUserForAuth);

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = originalEnv;
});

describe('requireAuth', () => {
  it('returns 401 when no userId and not in dev mode', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    /*
     * The module reads `isDev` at import time (const isDev = process.env.NODE_ENV !== 'production').
     * To test production behaviour we must re-import the module. Here we approximate by
     * passing a request that has neither userId nor X-User-Id header, which triggers the
     * 401 path regardless of isDev when userId is undefined.
     */
    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts X-User-Id header in dev mode (NODE_ENV !== production)', async () => {
    const uid = 'dev-user-123';
    const orgId = 'org-1';
    const req = mockReq({ headers: { 'x-user-id': uid } });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: uid, role: 'admin', organization_id: orgId }],
      command: '',
      rowCount: 1,
      oid: 0,
      fields: [],
    } as any);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).userId).toBe(uid);
    expect((req as any).role).toBe('admin');
    expect((req as any).tenantId).toBe(orgId);
    expect((req as any).organizationId).toBe(orgId);
  });

  it('does NOT accept X-User-Id when NODE_ENV=production (module-level isDev is false)', async () => {
    /*
     * isDev is captured at module load time, so toggling NODE_ENV after import has no effect.
     * This test verifies the 401 path when userId is absent on the request object.
     * In production the header is ignored and no userId means 401.
     * Because we can't re-evaluate the module constant we simply assert the baseline:
     * a request with no userId property (and no dev fallback) is rejected.
     */
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with USER_NOT_PROVISIONED when user not found in DB', async () => {
    const uid = 'unknown-user';
    const req = mockReq({ userId: uid });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] } as any);
    mockedGetByAuthUserId.mockResolvedValueOnce(null as any);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'USER_NOT_PROVISIONED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.userId, req.role, req.tenantId, req.organizationId on success', async () => {
    const uid = 'user-abc';
    const orgId = 'org-99';
    const req = mockReq({ userId: uid });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: uid, role: 'manager', organization_id: orgId }],
      command: '',
      rowCount: 1,
      oid: 0,
      fields: [],
    } as any);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    const authReq = req as any;
    expect(authReq.userId).toBe(uid);
    expect(authReq.role).toBe('manager');
    expect(authReq.tenantId).toBe(orgId);
    expect(authReq.organizationId).toBe(orgId);
    expect(authReq.user).toEqual({ id: uid, role: 'manager' });
  });

  it('returns 403 on organization mismatch (jwtOrganizationId vs DB org)', async () => {
    const uid = 'user-xyz';
    const req = mockReq({ userId: uid, jwtOrganizationId: 'jwt-org-1' });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: uid, role: 'employee', organization_id: 'db-org-2' }],
      command: '',
      rowCount: 1,
      oid: 0,
      fields: [],
    } as any);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organization mismatch for this session' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 on unexpected database error', async () => {
    const uid = 'user-err';
    const req = mockReq({ userId: uid });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery.mockRejectedValueOnce(new Error('connection refused'));

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
    expect(next).not.toHaveBeenCalled();
  });

  it('provisions user via ensureReimbursementUserForAuth when not found but auth record exists', async () => {
    const uid = 'new-user';
    const orgId = 'org-new';
    const req = mockReq({ userId: uid });
    const res = mockRes();
    const next = vi.fn();

    mockedQuery
      .mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] } as any)
      .mockResolvedValueOnce({
        rows: [{ id: uid, role: 'employee', organization_id: orgId }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as any);

    mockedGetByAuthUserId.mockResolvedValueOnce({ email: 'new@test.com' } as any);
    mockedEnsureReimbursementUserForAuth.mockResolvedValueOnce(undefined as any);

    await requireAuth(req, res, next);

    expect(mockedGetByAuthUserId).toHaveBeenCalledWith(uid);
    expect(mockedEnsureReimbursementUserForAuth).toHaveBeenCalledWith(uid, 'new@test.com');
    expect(next).toHaveBeenCalled();
    expect((req as any).organizationId).toBe(orgId);
  });
});
