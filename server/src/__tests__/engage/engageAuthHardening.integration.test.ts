/**
 * Sign-in and session hardening (WP-31) on real Postgres and the real auth router.
 * Acceptance:
 *  - the shared seed password signs in to nobody in production, and never to an engage tenant's account anywhere
 *    (before: in production it signed in to any account and overwrote its password);
 *  - refresh tokens rotate; a replaced token replayed later ends the session (theft), while the same token presented
 *    within seconds of the rotation (two tabs) is refused without ending it;
 *  - a locked account gets no new token from a refresh, and its session ends;
 *  - a session id in the logout body ends only the caller's own session;
 *  - sign-ins, failures, lockouts and a reused token show in the tenant's audit log.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5499/scratch npx vitest run src/__tests__/engage/engageAuthHardening.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { adminUrl, setupTenancyFixture, type TenancyFixture, type Tenant } from './helpers/tenancyFixture.js';

// The JWT middleware asks Redis whether a session was revoked; an in-memory stand-in keeps that check real without Redis.
vi.mock('../../queue/connection.js', () => {
  const store = new Map<string, string>();
  const redisConnection = {
    get: async (k: string) => store.get(k) ?? null,
    setex: async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; },
    set: async (k: string, v: string) => { store.set(k, v); return 'OK'; },
  };
  return { redisConnection, default: redisConnection };
});

describe.skipIf(!adminUrl)('sign-in and session hardening (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let server: Server;
  let base: string;
  const SEED = 'shared-seed-password-1';
  const WORKSPACE_PASSWORD = 'workspace-own-password-1';
  let workspaceEmail: string;
  const spies: Array<{ mockRestore: () => void }> = [];

  interface Res { status: number; json: Record<string, any>; cookie: string | null }
  async function call(path: string, opts: { body?: unknown; token?: string; cookie?: string } = {}): Promise<Res> {
    const r = await fetch(base + path, {
      method: opts.body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json', 'user-agent': 'auth-hardening-test',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.cookie ? { cookie: `refreshToken=${opts.cookie}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await r.text();
    let json: Record<string, any> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    const set = r.headers.get('set-cookie');
    const m = set ? /refreshToken=([^;]*)/.exec(set) : null;
    return { status: r.status, json, cookie: m && m[1] ? decodeURIComponent(m[1]) : null };
  }
  const login = (email: string, password: string) => call('/api/auth/login', { body: { email, password } });
  const refresh = (cookie: string) => call('/api/auth/refresh', { body: {}, cookie });
  const engageActions = async (org: string) =>
    (await f.admin.query<{ action: string }>(`SELECT action FROM engage.audit_log WHERE organization_id = $1 AND action LIKE 'auth.%' ORDER BY seq`, [org])).rows.map((r) => r.action);
  async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
    const before: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) { before[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try { return await fn(); } finally { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  }
  /** A fresh tenant that has signed in once with its temporary password: its refresh cookie and access token. */
  async function signedIn(): Promise<{ t: Tenant; cookie: string; token: string }> {
    const t = await f.provisionTenant(`Auth ${Math.random().toString(36).slice(2, 8)}`);
    const r = await login(t.admin.email, t.temporaryPassword);
    expect(r.status).toBe(200);
    return { t, cookie: r.cookie!, token: r.json.data.accessToken as string };
  }

  beforeAll(async () => {
    process.env.PRODUCT_SURFACE = 'engage'; // tenant sign-in is open only when engage is on this server
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    workspaceEmail = `root@platform-${f.suffix}.example.com`;
    await f.admin.query(
      `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, account_status) VALUES ($1, $2, $3, false, 'active')`,
      [f.platformUser, workspaceEmail, await bcrypt.hash(WORKSPACE_PASSWORD, 4)]);
    const { optionalJwt } = await import('../../middleware/authMiddleware.js');
    const { authRouter } = await import('../../routes/auth.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', optionalJwt);
    app.use('/api/auth', authRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 90_000);
  afterAll(async () => {
    delete process.env.PRODUCT_SURFACE;
    spies.forEach((s) => s.mockRestore());
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await f?.admin.query('DELETE FROM employee_auth WHERE auth_user_id = $1', [f.platformUser]).catch(() => undefined);
    await f?.teardown();
  });

  describe('the shared seed password', () => {
    it('signs in to nobody in production, and leaves the account\'s password alone', async () => {
      const t = await f.provisionTenant(`Seed ${Math.random().toString(36).slice(2, 8)}`);
      const before = (await f.admin.query(`SELECT password_hash FROM employee_auth WHERE auth_user_id = $1`, [t.admin.authUserId])).rows[0].password_hash;
      await withEnv({ NODE_ENV: 'production', SEED_DEFAULT_PASSWORD: SEED }, async () => {
        expect((await login(t.admin.email, SEED)).status).toBe(401);
        expect((await login(workspaceEmail, SEED)).status).toBe(401);
      });
      const after = (await f.admin.query(`SELECT password_hash FROM employee_auth WHERE auth_user_id = $1`, [t.admin.authUserId])).rows[0].password_hash;
      expect(after).toBe(before);
      expect((await login(t.admin.email, t.temporaryPassword)).status).toBe(200); // the real password still works
    });

    it('never signs in to an engage tenant\'s account, even in development', async () => {
      const t = await f.provisionTenant(`Dev ${Math.random().toString(36).slice(2, 8)}`);
      await withEnv({ NODE_ENV: 'development', SEED_DEFAULT_PASSWORD: SEED }, async () => {
        expect((await login(t.admin.email, SEED)).status).toBe(401);
        expect((await login(t.admin.email, 'test123')).status).toBe(401); // the documented demo password either
      });
    });
  });

  describe('refresh tokens', () => {
    it('rotate: the new one works, and the old one replayed later ends the session for everyone', async () => {
      const { t, cookie } = await signedIn();
      const first = await refresh(cookie);
      expect(first.status).toBe(200);
      const second = first.cookie!;
      expect(second).not.toBe(cookie);
      // Make the rotation old, then replay the replaced token: that is a copy being used.
      await f.admin.query(`UPDATE auth_sessions SET refresh_rotated_at = now() - interval '5 minutes' WHERE auth_user_id = $1`, [t.admin.authUserId]);
      expect((await refresh(cookie)).status).toBe(401);
      expect((await refresh(second)).status).toBe(401); // the legitimate holder is signed out too
      const reuse = await f.admin.query(`SELECT 1 FROM auth_audit_log WHERE auth_user_id = $1 AND action = 'refresh_token_reuse'`, [t.admin.authUserId]).catch(() => null);
      if (reuse) expect(reuse.rowCount).toBeGreaterThan(0);
      expect(await engageActions(t.organization.id)).toContain('auth.session_ended_token_reuse');
    });

    it('a replaced token presented within seconds (two tabs) is refused without ending the session', async () => {
      const { cookie } = await signedIn();
      const first = await refresh(cookie);
      expect(first.status).toBe(200);
      expect((await refresh(cookie)).status).toBe(401); // the other tab lost the race
      expect((await refresh(first.cookie!)).status).toBe(200); // and the session goes on
    });

    it('two refreshes with the same token at the same moment rotate once', async () => {
      const { cookie } = await signedIn();
      const both = await Promise.all([refresh(cookie), refresh(cookie)]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
      const winner = both.find((r) => r.status === 200)!;
      expect((await refresh(winner.cookie!)).status).toBe(200);
    });

    it('a locked account gets no new token, and its session ends', async () => {
      const { t, cookie } = await signedIn();
      await f.admin.query(`UPDATE employee_auth SET account_status = 'locked' WHERE auth_user_id = $1`, [t.admin.authUserId]);
      expect((await refresh(cookie)).status).toBe(401);
      await f.admin.query(`UPDATE employee_auth SET account_status = 'active' WHERE auth_user_id = $1`, [t.admin.authUserId]);
      expect((await refresh(cookie)).status).toBe(401); // the session stayed ended
    });
  });

  describe('logout', () => {
    it('a session id in the body ends only the caller\'s own session', async () => {
      const victim = await signedIn();
      const victimSession = JSON.parse(Buffer.from(victim.token.split('.')[1]!, 'base64url').toString('utf8')).sessionId as string;
      // Anonymous, and another signed-in user: neither can end it.
      await call('/api/auth/logout', { body: { sessionId: victimSession } });
      const other = await signedIn();
      await call('/api/auth/logout', { body: { sessionId: victimSession }, token: other.token });
      expect((await refresh(victim.cookie)).status).toBe(200);
    });
    it('the owner can end it', async () => {
      const me = await signedIn();
      const sid = JSON.parse(Buffer.from(me.token.split('.')[1]!, 'base64url').toString('utf8')).sessionId as string;
      await call('/api/auth/logout', { body: { sessionId: sid }, token: me.token });
      expect((await refresh(me.cookie)).status).toBe(401);
    });
  });

  it('a password change ends the account\'s other sessions and keeps the current one', async () => {
    const t = await f.provisionTenant(`Pw ${Math.random().toString(36).slice(2, 8)}`);
    const a = await login(t.admin.email, t.temporaryPassword);
    const b = await login(t.admin.email, t.temporaryPassword);
    expect([a.status, b.status]).toEqual([200, 200]);
    const r = await fetch(`${base}/api/auth/password/change`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'user-agent': 'auth-hardening-test', authorization: `Bearer ${a.json.data.accessToken}` },
      body: JSON.stringify({ currentPassword: t.temporaryPassword, newPassword: 'Str0ng-New-Passw0rd!x' }),
    });
    expect(r.status).toBe(200);
    expect((await refresh(b.cookie!)).status).toBe(401); // the other session ended
    expect((await refresh(a.cookie!)).status).toBe(200); // this one goes on
    expect(await engageActions(t.organization.id)).toContain('auth.password_changed');
  });

  it('sign-ins, failures and a lockout show in the tenant\'s audit log, by user id only', async () => {
    const t = await f.provisionTenant(`Log ${Math.random().toString(36).slice(2, 8)}`);
    expect((await login(t.admin.email, t.temporaryPassword)).status).toBe(200);
    for (let i = 0; i < 5; i++) await login(t.admin.email, `wrong-password-${i}`);
    const actions = await engageActions(t.organization.id);
    expect(actions[0]).toBe('auth.signed_in');
    expect(actions.filter((a) => a === 'auth.sign_in_failed').length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain('auth.account_locked');
    const all = JSON.stringify((await f.admin.query(`SELECT * FROM engage.audit_log WHERE organization_id = $1`, [t.organization.id])).rows);
    expect(all).not.toContain(t.admin.email);
    expect(all).not.toContain('wrong-password');
    const chain = (await f.admin.query(`SELECT ok FROM engage.verify_audit_chain($1)`, [t.organization.id])).rows[0];
    expect(chain.ok).toBe(true);
  });
});
