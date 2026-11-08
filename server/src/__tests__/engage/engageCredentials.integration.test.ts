/**
 * Credential store (WP-06) on real Postgres, through the real HTTP stack and the non-bypass engage role.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const hex = () => randomBytes(32).toString('hex');
const SECRET_A = 'fakekey_AAAA1111bbbb2222cccc3333';
const SECRET_B = 'fakekey_BBBB4444dddd5555eeee6666';
const ROTATED = 'fakekey_ROTATED7777ffff8888gggg9999';
const CONFIG_VALUE = 'cfg-region-eu-west-1';

describe.skipIf(!adminUrl)('credential store (real Postgres, HTTP, non-bypass role)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let cryptoMod: typeof import('../../engage/crypto.js');
  let tokA: string;
  let tokB: string;
  let tokEmployee: string;
  let masterHex: string;
  const logs: string[] = [];
  const bodies: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];

  const call = async (...a: Parameters<TestApp['http']>) => { const r = await app.http(...a); bodies.push(r.text); return r; };
  const body = (over: Record<string, unknown> = {}) => ({
    channel: 'email', provider: 'ses', mode: 'test', label: 'Primary', config: { region: CONFIG_VALUE }, secrets: { api_key: SECRET_A, account_sid: 'AC-short' }, ...over,
  });

  beforeAll(async () => {
    masterHex = hex();
    process.env.ENGAGE_MASTER_KEY = masterHex;
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    creds = await import('../../engage/credentials.js');
    cryptoMod = await import('../../engage/crypto.js');
    app = await startEngageApp();
    const emp = `employee-${f.suffix}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status)
       VALUES ($1, $1, $2, $3, 'Plain Employee', 'employee', 'active')`, [f.A.organization.id, emp, `emp@alpha-${f.suffix}.example.com`]);
    tokA = token(f.A.admin.authUserId, f.A.organization.id);
    tokB = token(f.B.admin.authUserId, f.B.organization.id);
    tokEmployee = token(emp, f.A.organization.id);
  }, 90_000);

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    if (f) {
      await f.admin.query('DELETE FROM reimbursement_users WHERE auth_user_id = $1', [`employee-${f.suffix}`]);
      await f.teardown();
    }
    process.env.ENGAGE_MASTER_KEY = '';
  });

  describe('write-only API', () => {
    let accountId: string;
    it('creates an account and returns metadata only', async () => {
      const r = await call('/channel-accounts', { token: tokA, body: body() });
      expect(r.status).toBe(201);
      expect(r.headers.get('cache-control')).toBe('no-store');
      accountId = r.json.id as string;
      expect(Object.keys(r.json).sort()).toEqual(['channel', 'config', 'createdAt', 'disabledAt', 'fingerprint', 'hint', 'id', 'label', 'mode', 'provider', 'rotatedAt', 'status', 'supersedesId']);
      expect(r.json.config).toEqual({ region: CONFIG_VALUE });
      expect(r.json.fingerprint).toMatch(/^[0-9a-f]{12}$/);
      expect(r.json.hint).toBe(SECRET_A.slice(-4));
      expect(r.text).not.toContain(SECRET_A);
      expect(r.text).not.toContain('AC-short');
    });

    it('no read endpoint ever returns secrets, ciphertext or wrapped keys', async () => {
      for (const r of [await call('/channel-accounts', { token: tokA }), await call(`/channel-accounts/${accountId}`, { token: tokA })]) {
        expect(r.status).toBe(200);
        expect(r.text).not.toMatch(/fakekey_|AC-short|ciphertext|wrapped|secret_|key_id/i);
      }
      const list = await call('/channel-accounts', { token: tokA });
      expect((list.json.accounts as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('the database holds ciphertext only, and the secret is not in config', async () => {
      const row = (await f.admin.query('SELECT config, secret_ciphertext, wrapped_data_key, key_id FROM engage.channel_accounts WHERE id = $1', [accountId])).rows[0];
      expect(JSON.stringify(row.config)).not.toMatch(/fakekey_|AC-short/);
      for (const col of ['secret_ciphertext', 'wrapped_data_key']) {
        expect((row[col] as Buffer).includes(Buffer.from(SECRET_A)), col).toBe(false);
        expect((row[col] as Buffer).includes(Buffer.from('AC-short')), col).toBe(false);
      }
      expect(row.key_id).toBe('k1');
      const dump = (await f.admin.query(`SELECT row_to_json(t)::text AS j FROM engage.channel_accounts t WHERE id = $1`, [accountId])).rows[0].j as string;
      expect(dump).not.toContain(SECRET_A);
    });

    it('another tenant gets 404 for the id and cannot see the account in its list', async () => {
      expect((await call(`/channel-accounts/${accountId}`, { token: tokB })).status).toBe(404);
      expect((await call(`/channel-accounts/${accountId}/rotate`, { token: tokB, body: { secrets: { api_key: ROTATED } } })).status).toBe(404);
      expect((await call(`/channel-accounts/${accountId}/disable`, { token: tokB, body: {} })).status).toBe(404);
      const list = await call('/channel-accounts', { token: tokB });
      expect((list.json.accounts as Array<{ id: string }>).map((a) => a.id)).not.toContain(accountId);
      expect((await call('/channel-accounts/not-a-uuid', { token: tokA })).status).toBe(404);
      const still = await f.admin.query('SELECT status FROM engage.channel_accounts WHERE id = $1', [accountId]);
      expect(still.rows[0].status).toBe('active');
    });

    it('needs an authenticated tenant admin', async () => {
      expect((await call('/channel-accounts')).status).toBe(401);
      expect((await call('/channel-accounts', { token: tokEmployee })).status).toBe(403);
      expect((await call('/channel-accounts', { token: tokEmployee, body: body({ label: 'Employee try' }) })).status).toBe(403);
      expect((await call('/channel-accounts', { token: token(f.platformUser, f.platformOrgId) })).status).toBe(403);
      // Every route, not just list and create: a plain employee of the right tenant is refused and nothing changes.
      expect((await call(`/channel-accounts/${accountId}`, { token: tokEmployee })).status).toBe(403);
      expect((await call(`/channel-accounts/${accountId}/rotate`, { token: tokEmployee, body: { secrets: { api_key: ROTATED } } })).status).toBe(403);
      expect((await call(`/channel-accounts/${accountId}/disable`, { token: tokEmployee, body: {} })).status).toBe(403);
      expect((await f.admin.query('SELECT status FROM engage.channel_accounts WHERE id = $1', [accountId])).rows[0].status).toBe('active');
    });

    it('rejects invalid input without echoing secret values', async () => {
      const bad = [
        body({ channel: 'fax' }), body({ mode: 'prod' }), body({ provider: 'Bad Provider' }), body({ label: '' }),
        body({ config: { apiKey: SECRET_B } }), body({ config: { password: SECRET_B } }), body({ secrets: { api_key: '' } }),
        body({ secrets: { 'Bad Name': SECRET_B } }), body({ secrets: SECRET_B }),
      ];
      for (const b of bad) {
        const r = await call('/channel-accounts', { token: tokA, body: b });
        expect(r.status, JSON.stringify(b).slice(0, 80)).toBe(400);
        expect(r.text).not.toContain(SECRET_B);
      }
    });

    it('allows one active account per channel and label; a disabled one frees the label', async () => {
      expect((await call('/channel-accounts', { token: tokA, body: body() })).status).toBe(409);
      const other = await call('/channel-accounts', { token: tokA, body: body({ label: 'Secondary', secrets: { api_key: SECRET_B } }) });
      expect(other.status).toBe(201);
      expect((await call(`/channel-accounts/${other.json.id}/disable`, { token: tokA, body: {} })).json.status).toBe('disabled');
      expect((await call('/channel-accounts', { token: tokA, body: body({ label: 'Secondary', secrets: { api_key: SECRET_B } }) })).status).toBe(201);
      expect((await call('/channel-accounts', { token: tokB, body: body() })).status, 'same label in another tenant is fine').toBe(201);
    });
  });

  describe('rotation keeps history and switches the active secret', () => {
    it('creates a superseding row, disables the old one, and only the new secret loads', async () => {
      const first = (await call('/channel-accounts', { token: tokA, body: body({ label: 'Rotating', secrets: { api_key: SECRET_A } }) })).json;
      const r = await call(`/channel-accounts/${first.id}/rotate`, { token: tokA, body: { secrets: { api_key: ROTATED } } });
      expect(r.status).toBe(201);
      expect(r.json.supersedesId).toBe(first.id);
      expect(r.json.fingerprint).not.toBe(first.fingerprint);
      expect(r.json.config).toEqual(first.config);
      expect(r.text).not.toContain(ROTATED);

      const oldRow = (await f.admin.query('SELECT status, rotated_at, disabled_at FROM engage.channel_accounts WHERE id = $1', [first.id])).rows[0];
      expect(oldRow.status).toBe('disabled');
      expect(oldRow.rotated_at).not.toBeNull();
      expect((await f.admin.query(`SELECT count(*)::int AS n FROM engage.channel_accounts WHERE label = 'Rotating' AND organization_id = $1`, [f.A.organization.id])).rows[0].n).toBe(2);

      const loaded = await creds.loadAccountSecrets(f.A.organization.id, r.json.id as string);
      expect(loaded.secrets).toEqual({ api_key: ROTATED });
      await expect(creds.loadAccountSecrets(f.A.organization.id, first.id as string)).rejects.toThrow(creds.CredentialNotFoundError);
      expect((await call(`/channel-accounts/${first.id}/rotate`, { token: tokA, body: { secrets: { api_key: SECRET_B } } })).status, 'cannot rotate a disabled account').toBe(409);
      expect((await call(`/channel-accounts/${r.json.id}/rotate`, { token: tokA, body: { secrets: {} } })).status, 'rotation needs a secret').toBe(400);
    });
  });

  describe('fail-closed decryption', () => {
    let id: string;
    let before: { secret_ciphertext: Buffer; wrapped_data_key: Buffer };
    beforeAll(async () => {
      id = (await call('/channel-accounts', { token: tokA, body: body({ label: 'FailClosed', secrets: { api_key: SECRET_A } }) })).json.id as string;
      before = (await f.admin.query('SELECT secret_ciphertext, wrapped_data_key FROM engage.channel_accounts WHERE id = $1', [id])).rows[0];
    });
    const restore = () => f.admin.query('UPDATE engage.channel_accounts SET secret_ciphertext = $2, wrapped_data_key = $3 WHERE id = $1', [id, before.secret_ciphertext, before.wrapped_data_key]);

    it('loads with the right key', async () => {
      expect((await creds.loadAccountSecrets(f.A.organization.id, id)).secrets).toEqual({ api_key: SECRET_A });
    });
    it('throws on a tampered secret or wrapped key, and never returns partial data', async () => {
      for (const col of ['secret_ciphertext', 'wrapped_data_key'] as const) {
        const bad = Buffer.from(before[col]); bad[bad.length - 1] = bad[bad.length - 1]! ^ 0x01;
        await f.admin.query(`UPDATE engage.channel_accounts SET ${col} = $2 WHERE id = $1`, [id, bad]);
        await expect(creds.loadAccountSecrets(f.A.organization.id, id), col).rejects.toThrow(cryptoMod.CredentialDecryptError);
        await restore();
      }
    });
    it('throws when another tenant row\'s ciphertext is copied in (bound to tenant and row)', async () => {
      const other = (await call('/channel-accounts', { token: tokB, body: body({ label: 'Other', secrets: { api_key: SECRET_B } }) })).json.id as string;
      const o = (await f.admin.query('SELECT secret_ciphertext, wrapped_data_key FROM engage.channel_accounts WHERE id = $1', [other])).rows[0];
      await f.admin.query('UPDATE engage.channel_accounts SET secret_ciphertext = $2, wrapped_data_key = $3 WHERE id = $1', [id, o.secret_ciphertext, o.wrapped_data_key]);
      await expect(creds.loadAccountSecrets(f.A.organization.id, id)).rejects.toThrow(cryptoMod.CredentialDecryptError);
      await restore();
      const sameTenant = (await call('/channel-accounts', { token: tokA, body: body({ label: 'SameTenantOther', secrets: { api_key: SECRET_B } }) })).json.id as string;
      const s = (await f.admin.query('SELECT secret_ciphertext, wrapped_data_key FROM engage.channel_accounts WHERE id = $1', [sameTenant])).rows[0];
      await f.admin.query('UPDATE engage.channel_accounts SET secret_ciphertext = $2, wrapped_data_key = $3 WHERE id = $1', [id, s.secret_ciphertext, s.wrapped_data_key]);
      await expect(creds.loadAccountSecrets(f.A.organization.id, id), 'swapped within one tenant').rejects.toThrow(cryptoMod.CredentialDecryptError);
      await restore();
    });
    it('throws with the wrong master key or no key', async () => {
      const saved = process.env.ENGAGE_MASTER_KEY;
      process.env.ENGAGE_MASTER_KEY = hex();
      await expect(creds.loadAccountSecrets(f.A.organization.id, id)).rejects.toThrow(cryptoMod.CredentialDecryptError);
      process.env.ENGAGE_MASTER_KEY = '';
      await expect(creds.loadAccountSecrets(f.A.organization.id, id)).rejects.toThrow(cryptoMod.CredentialKeyError);
      const r = await call('/channel-accounts', { token: tokA, body: body({ label: 'NoKey' }) });
      expect(r.status).toBe(503);
      expect(r.json.error).toBe('Credential storage is not configured');
      process.env.ENGAGE_MASTER_KEY = saved;
      expect((await creds.loadAccountSecrets(f.A.organization.id, id)).secrets.api_key).toBe(SECRET_A);
    });
    it('a disabled or unknown account is never loaded', async () => {
      await expect(creds.loadAccountSecrets(f.A.organization.id, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(creds.CredentialNotFoundError);
      await expect(creds.loadAccountSecrets(f.B.organization.id, id), 'other tenant').rejects.toThrow(creds.CredentialNotFoundError);
    });
  });

  describe('the engage role cannot alter or delete stored credentials', () => {
    it('secrets, ownership and rows are immutable to the app; status changes are allowed', async () => {
      const id = (await call('/channel-accounts', { token: tokA, body: body({ label: 'Immutable' }) })).json.id as string;
      const A = f.A.organization.id;
      for (const sql of [
        `UPDATE engage.channel_accounts SET secret_ciphertext = '\\x00' WHERE id = $1`,
        `UPDATE engage.channel_accounts SET organization_id = organization_id WHERE id = $1`,
        `UPDATE engage.channel_accounts SET config = '{}' WHERE id = $1`,
        `UPDATE engage.channel_accounts SET secret_fingerprint = 'x' WHERE id = $1`,
        `DELETE FROM engage.channel_accounts WHERE id = $1`,
      ]) {
        await expect(f.engage.withEngageTenant(A, (c) => c.query(sql, [id])), sql).rejects.toThrow(/permission denied/);
      }
      const ok = await f.engage.withEngageTenant(A, (c) => c.query(`UPDATE engage.channel_accounts SET status = 'disabled', disabled_at = now() WHERE id = $1`, [id]));
      expect(ok.rowCount).toBe(1);
    });
  });

  describe('master key rotation', () => {
    it('re-wraps under the new key, keeps secrets readable, and leaves other tenants alone', async () => {
      const a = (await call('/channel-accounts', { token: tokA, body: body({ label: 'Rewrap A', secrets: { api_key: SECRET_A } }) })).json.id as string;
      const b = (await call('/channel-accounts', { token: tokB, body: body({ label: 'Rewrap B', secrets: { api_key: SECRET_B } }) })).json.id as string;
      const cipherBefore = (await f.admin.query('SELECT secret_ciphertext FROM engage.channel_accounts WHERE id = $1', [a])).rows[0].secret_ciphertext as Buffer;

      const k2 = hex();
      const saved = { key: process.env.ENGAGE_MASTER_KEY, id: process.env.ENGAGE_MASTER_KEY_ID };
      try {
        process.env.ENGAGE_MASTER_KEY = k2; process.env.ENGAGE_MASTER_KEY_ID = 'k2'; process.env.ENGAGE_MASTER_KEYS_OLD = `k1:${masterHex}`;
        expect((await creds.loadAccountSecrets(f.A.organization.id, a)).secrets.api_key, 'old key still readable during rotation').toBe(SECRET_A);
        const n = await creds.rewrapTenant(f.A.organization.id);
        expect(n).toBeGreaterThanOrEqual(1);
        expect((await f.admin.query('SELECT key_id, rewrapped_at FROM engage.channel_accounts WHERE id = $1', [a])).rows[0]).toMatchObject({ key_id: 'k2' });
        expect((await f.admin.query('SELECT key_id FROM engage.channel_accounts WHERE id = $1', [b])).rows[0].key_id, 'tenant B untouched').toBe('k1');
        const cipherAfter = (await f.admin.query('SELECT secret_ciphertext FROM engage.channel_accounts WHERE id = $1', [a])).rows[0].secret_ciphertext as Buffer;
        expect(cipherAfter.equals(cipherBefore), 'secret ciphertext is not rewritten').toBe(true);
        expect(await creds.rewrapTenant(f.A.organization.id), 'idempotent').toBe(0);

        delete process.env.ENGAGE_MASTER_KEYS_OLD;
        expect((await creds.loadAccountSecrets(f.A.organization.id, a)).secrets.api_key, 'readable with only the new key').toBe(SECRET_A);
        await expect(creds.loadAccountSecrets(f.B.organization.id, b), 'B still needs the old key').rejects.toThrow(/not available/);
      } finally {
        process.env.ENGAGE_MASTER_KEY = saved.key!; process.env.ENGAGE_MASTER_KEY_ID = saved.id!; delete process.env.ENGAGE_MASTER_KEYS_OLD;
      }
    });
    it('a re-wrap that cannot decrypt changes nothing', async () => {
      const id = (await call('/channel-accounts', { token: tokA, body: body({ label: 'Rewrap fail' }) })).json.id as string;
      const saved = { key: process.env.ENGAGE_MASTER_KEY, id: process.env.ENGAGE_MASTER_KEY_ID };
      try {
        process.env.ENGAGE_MASTER_KEY = hex(); process.env.ENGAGE_MASTER_KEY_ID = 'k3';
        await expect(creds.rewrapTenant(f.A.organization.id)).rejects.toThrow(cryptoMod.CredentialDecryptError);
        expect((await f.admin.query('SELECT key_id FROM engage.channel_accounts WHERE id = $1', [id])).rows[0].key_id).toBe('k1');
      } finally {
        process.env.ENGAGE_MASTER_KEY = saved.key!; process.env.ENGAGE_MASTER_KEY_ID = saved.id!;
      }
    });
  });

  describe('test 7: nothing secret in logs or responses', () => {
    it('no secret value, key, ciphertext or hash appears anywhere that was logged or returned', async () => {
      const rows = (await f.admin.query('SELECT secret_ciphertext, wrapped_data_key FROM engage.channel_accounts WHERE organization_id = ANY($1)', [[f.A.organization.id, f.B.organization.id]])).rows;
      const needles = [SECRET_A, SECRET_B, ROTATED, 'AC-short', masterHex, ...rows.flatMap((r) => [
        (r.secret_ciphertext as Buffer).toString('hex'), (r.secret_ciphertext as Buffer).toString('base64'),
        (r.wrapped_data_key as Buffer).toString('hex'), (r.wrapped_data_key as Buffer).toString('base64'),
      ])];
      const everyLog = logs.join('\n');
      const everyBody = bodies.join('\n');
      for (const n of needles) {
        expect(everyLog.includes(n), `log contains ${n.slice(0, 12)}…`).toBe(false);
        expect(everyBody.includes(n), `response contains ${n.slice(0, 12)}…`).toBe(false);
      }
      expect(logs.some((l) => l.includes('channel account created')), 'creation was logged').toBe(true);
      expect(logs.some((l) => l.includes('credential storage is not configured')), 'failure path was logged').toBe(true);
    });
  });
});
