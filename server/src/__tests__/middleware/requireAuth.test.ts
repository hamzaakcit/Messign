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

afterEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth', () => {
  it('returns 401 when no userId is set on the request', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('never accepts an X-User-Id header — only req.userId set upstream by JWT auth', async () => {
    const req = mockReq({ headers: { 'x-user-id': 'attacker-supplied-id' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockedQuery).not.toHaveBeenCalled();
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
