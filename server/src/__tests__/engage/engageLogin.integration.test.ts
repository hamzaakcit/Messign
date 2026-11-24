/**
 * Engage tenants sign in through POST /api/auth/login (real router, real Postgres). Before this, the login only knew
 * @messign.com addresses and looked users up in the default organization, so no tenant admin could sign in.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

// A real login token carries a session id, so the JWT middleware asks Redis whether that session was revoked. CI has
// no Redis, and the BullMQ connection queues commands forever without one; an in-memory stand-in keeps the check real.
vi.mock('../../queue/connection.js', () => {
  const store = new Map<string, string>();
  const redisConnection = {
    get: async (k: string) => store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; },
  };
  return { redisConnection, default: redisConnection };
});

describe.skipIf(!adminUrl)('engage tenant login (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let server: Server;
  let base: string;
  const WORKSPACE_PASSWORD = 'workspace-account-pw-1';
  let workspaceEmail: string;

  const call = async (path: string, opts: { body?: unknown; token?: string } = {}) => {
    const r = await fetch(base + path, {
      method: opts.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'engage-login-test', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await r.text();
    let json: Record<string, any> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const login = (email: string, password: string) => call('/api/auth/login', { body: { email, password } });
  const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;

  beforeAll(async () => {
    f = await setupTenancyFixture();
    // A Company-OS (workspace) account with an address outside @messign.com and a known password.
    workspaceEmail = `root@platform-${f.suffix}.example.com`;
    await f.admin.query(
      `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, account_status) VALUES ($1, $2, $3, false, 'active')`,
      [f.platformUser, workspaceEmail, await bcrypt.hash(WORKSPACE_PASSWORD, 4)]);
    const { optionalJwt } = await import('../../middleware/authMiddleware.js');
    const { authRouter } = await import('../../routes/auth.js');
    const { engageRouter } = await import('../../engage/routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', optionalJwt);
    app.use('/api/auth', authRouter);
    app.use('/api/engage', engageRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 90_000);
  afterEach(() => { delete process.env.PRODUCT_SURFACE; });
  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await f?.admin.query('DELETE FROM employee_auth WHERE auth_user_id = $1', [f.platformUser]).catch(() => undefined);
    await f?.teardown();
  });

  it('a tenant admin signs in with their own address, gets a token for their own tenant, and /me finds them', async () => {
    process.env.PRODUCT_SURFACE = 'engage';
    const res = await login(f.A.admin.email.toUpperCase(), f.A.temporaryPassword);
    expect(res.status).toBe(200);
    expect(res.json.data.user.email).toBe(f.A.admin.email);
    expect(res.json.data.mustChangePassword).toBe(true); // provisioning hands out a temporary password
    const jwt = res.json.data.accessToken as string;
    expect(claims(jwt)).toMatchObject({ sub: f.A.admin.authUserId, organizationId: f.A.organization.id });

    const me = await call('/api/auth/me', { token: jwt });
    expect(me.status).toBe(200);
    expect(me.json.data.user.email).toBe(f.A.admin.email);

    // The token is good for engage itself, and for tenant A only.
    const engageMe = await call('/api/engage/me', { token: jwt });
    expect(engageMe.status).toBe(200);
    expect(JSON.stringify(engageMe.json)).toContain(f.A.organization.id);
    expect(JSON.stringify(engageMe.json)).not.toContain(f.B.organization.id);
  });

  it('a wrong password, an unknown address and a non-engage account all get the same refusal', async () => {
    process.env.PRODUCT_SURFACE = 'engage';
    const wrong = await login(f.B.admin.email, 'not-the-password');
    const unknown = await login(`nobody-${f.suffix}@example.com`, 'whatever-1');
    // Right password, but a Company-OS account outside @messign.com: must not get in, and must not be told why.
    const workspace = await login(workspaceEmail, WORKSPACE_PASSWORD);
    for (const r of [wrong, unknown, workspace]) {
      expect(r.status).toBe(401);
      expect(r.json.data).toBeUndefined();
      expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.json.error.message).toMatch(/^Invalid email or password/);
    }
    // Same shape as a wrong password (both count an attempt), so the answer does not reveal a correct password.
    expect(Object.keys(workspace.json.error).sort()).toEqual(Object.keys(wrong.json.error).sort());
  });

  it('without engage mounted, only @messign.com addresses are accepted, as before', async () => {
    process.env.PRODUCT_SURFACE = 'workspace';
    const res = await login(f.A.admin.email, f.A.temporaryPassword);
    expect(res.status).toBe(403);
    expect(res.json.error.message).toMatch(/@messign\.com/);
  });

  it('works on the "all" surface too', async () => {
    process.env.PRODUCT_SURFACE = 'all';
    const t = await f.provisionTenant('Charlie');
    const res = await login(t.admin.email, t.temporaryPassword);
    expect(res.status).toBe(200);
    expect(claims(res.json.data.accessToken)).toMatchObject({ organizationId: t.organization.id });
  });
});
