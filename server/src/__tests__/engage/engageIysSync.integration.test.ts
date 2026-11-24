/**
 * İYS sync (migration 134, WP-26, ADR-022) on real Postgres and the real HTTP stack, against the mock İYS server (built
 * from the official documentation, apidocs.iys.org.tr 3.2.4). Acceptance:
 *   - an opt-out recorded locally is queued in the same transaction, reported to İYS, and tracked to its end;
 *   - a revocation a recipient makes in İYS is pulled and applied before the next send: the real send gate then blocks.
 * Also: every documented İYS answer ends a report in the right state, the pull marker moves with the page it belongs to,
 * a failed pull changes nothing, the SLA monitor says what is late, the scheduler sees ids only, and no address reaches a log.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageIysSync.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import type { MockIys } from '../../engage/iys/mock/mockIysServer.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe.skipIf(!adminUrl)('İYS sync (real Postgres, HTTP, mock İYS)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let M: typeof import('../../engage/messaging/index.js');
  let Mock: typeof import('../../engage/iys/mock/mockIysServer.js');
  let C: typeof import('../../engage/iys/client.js');
  let Conn: typeof import('../../engage/iys/connection.js');
  let S: typeof import('../../engage/iys/sync.js');
  let R: typeof import('../../engage/iys/report.js');
  let mock: MockIys;
  let clock: number;
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(o: { iys?: boolean; password?: string } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Iys ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    const tn = { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
    if (o.iys !== false) await iysAccount(tn, o.password);
    return tn;
  }
  const iysAccount = async (t: Tn, password = mock.o.password) =>
    creds.createAccount(t.org, t.userId, { channel: 'iys', provider: 'mock', mode: 'test', label: 'iys', config: { iys_code: mock.o.iysCode, brand_code: mock.o.brandCode }, secrets: { username: mock.o.username, password } });
  /** A customer with an address and, optionally, a grant on a channel (granted at `grantedAt`, default three days ago). */
  async function customer(t: Tn, o: { email?: string | null; phone?: string | null; grant?: Array<'email' | 'sms'>; grantedAt?: number } = {}) {
    const email = o.email === undefined ? `${u()}@example.com` : o.email;
    const phone = o.phone === undefined ? phoneN() : o.phone;
    const p = await P.upsertProfile(t.org, { externalId: `i-${u()}`, email, phone });
    for (const channel of o.grant ?? []) await P.recordConsent(t.org, p.id, { channel, status: 'granted', source: 'api', evidence: { test: 'wp26' }, recordedAt: new Date(o.grantedAt ?? clock - 3 * DAY) });
    return { id: p.id, email, phone };
  }
  const optOut = (t: Tn, profileId: string, channel: 'email' | 'sms' = 'email', source: 'unsubscribe_link' | 'stop_keyword' | 'api' | 'web' | 'import' = 'unsubscribe_link', at?: number) =>
    P.recordConsent(t.org, profileId, { channel, status: 'revoked', source, ...(at !== undefined ? { recordedAt: new Date(at) } : {}) });
  const outbox = async (t: Tn) => (await sql(t.org, `SELECT o.*, p.external_id FROM engage.iys_outbox o JOIN engage.profiles p ON p.id = o.profile_id WHERE o.organization_id = $1 ORDER BY o.created_at, o.id`, [t.org])).rows;
  /** İYS holds an ONAY for this address, from before our opt-out, so a RET can be registered. */
  const iysHolds = (recipient: string, type: 'EPOSTA' | 'MESAJ' = 'EPOSTA', at = clock - 3 * DAY): void => { mock.addRecipientChange({ recipient, type, status: 'ONAY', source: 'IYS_WEB', consentDate: new Date(at), creationMs: at }); };
  const age = (t: Tn, id: string, consentAt: number, createdAt = consentAt) =>
    f.admin.query(`UPDATE engage.iys_outbox SET consent_at = $3, created_at = $4 WHERE organization_id = $1 AND id = $2`, [t.org, id, new Date(consentAt), new Date(createdAt)]);

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); }));
    }
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    M = await import('../../engage/messaging/index.js');
    Mock = await import('../../engage/iys/mock/mockIysServer.js');
    C = await import('../../engage/iys/client.js');
    Conn = await import('../../engage/iys/connection.js');
    S = await import('../../engage/iys/sync.js');
    R = await import('../../engage/iys/report.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    clock = Date.now();
    logs.length = 0;
    mock = await Mock.startMockIys({ now: () => clock, visibilityDelayMs: 0 });
    process.env.ENGAGE_IYS_MOCK_URL = mock.url;
    // Rows are stamped by the database's real clock, so the test clock never runs behind it; tests move it forward from there.
    Conn.iysDeps.now = () => { clock = Math.max(clock, Date.now()); return new Date(clock); };
    Conn.iysDeps.makeClient = (c) => new C.IysClient({ baseUrl: c.baseUrl, iysCode: c.iysCode, brandCode: c.brandCode, credentials: c.credentials, now: () => clock, sleep: async () => undefined, minIntervalMs: 0 });
  });
  afterEach(async () => { await mock.stop(); delete process.env.SEND_MODE; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the İYS account', () => {
    it('is a tenant credential with the İYS number, the brand number and the API user as its parts, validated when it is made', async () => {
      const t = await tenant({ iys: false });
      const ok = { channel: 'iys', provider: 'iys', mode: 'test', label: 'iys', config: { iys_code: 100001, brand_code: 100001 }, secrets: { username: 'u', password: 'p' } };
      expect(creds.parseCreateInput(ok)).toMatchObject({ channel: 'iys' });
      for (const [what, bad] of [
        ['a wrong provider', { ...ok, provider: 'ses' }], ['a text İYS number', { ...ok, config: { iys_code: 'abc', brand_code: 1 } }],
        ['a missing brand number', { ...ok, config: { iys_code: 1 } }], ['a missing password', { ...ok, secrets: { username: 'u' } }],
        ['a negative number', { ...ok, config: { iys_code: -1, brand_code: 1 } }], ['a secret in the config', { ...ok, config: { iys_code: 1, brand_code: 1, password: 'p' } }],
      ] as const) expect(() => creds.parseCreateInput(bad), what).toThrow(creds.CredentialInputError);
      const made = await creds.createAccount(t.org, t.userId, creds.parseCreateInput(ok));
      expect(JSON.stringify(made)).not.toMatch(/"password"|"username"|secret_ciphertext/);
      await expect(creds.createAccount(t.org, t.userId, creds.parseCreateInput({ ...ok, label: 'second' }))).rejects.toThrow(); // one active İYS account per tenant
    });
    it('can never carry a message: nothing is sent through it and no webhook is accepted for it', async () => {
      const t = await tenant();
      const accountId = (await creds.listAccounts(t.org)).find((a) => a.channel === 'iys')!.id;
      const p = await customer(t);
      await expect(f.engage.withEngageTenant(t.org, (c) => c.query(
        `INSERT INTO engage.messages (organization_id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, request_hash, content)
         VALUES ($1, $2, 'email', 'transactional', $3, 'mock', 'k1', $4, '{}'::jsonb)`, [t.org, p.id, accountId, 'a'.repeat(64)]))).rejects.toThrow(/foreign key|violates/);
      expect(() => creds.messagingChannel({ channel: 'iys' })).toThrow(creds.CredentialNotFoundError);
    });
    it('is read by the connection check: a token, the brand list, the brand number; wrong credentials and a wrong brand are named', async () => {
      const good = await tenant();
      expect(await Conn.checkConnection(good.org)).toEqual({ ok: true, code: null, message: null, brandFound: true });
      const wrong = await tenant({ password: 'not-the-password' });
      expect(await Conn.checkConnection(wrong.org)).toMatchObject({ ok: false, code: 'H251' });
      const none = await tenant({ iys: false });
      expect(await Conn.checkConnection(none.org)).toMatchObject({ ok: false, code: 'no_iys_account' });
      const otherBrand = await tenant({ iys: false });
      await creds.createAccount(otherBrand.org, otherBrand.userId, { channel: 'iys', provider: 'mock', mode: 'test', label: 'iys', config: { iys_code: mock.o.iysCode, brand_code: 999 }, secrets: { username: mock.o.username, password: mock.o.password } });
      expect(await Conn.checkConnection(otherBrand.org)).toMatchObject({ ok: false, code: 'brand_not_found' });
    });
    it('talks only to the address its provider and mode fix, never to one a tenant typed', () => {
      expect(Conn.baseUrlFor('iys', 'test', {})).toBe('https://api.sandbox.iys.org.tr');
      expect(Conn.baseUrlFor('iys', 'live', {})).toBe('https://api.iys.org.tr');
      expect(Conn.baseUrlFor('mock', 'test', { ENGAGE_IYS_MOCK_URL: 'http://127.0.0.1:4010' })).toBe('http://127.0.0.1:4010');
      for (const url of [undefined, '', 'https://evil.example', 'http://127.0.0.1.evil.example', 'http://localhost:80/x']) {
        expect(() => Conn.baseUrlFor('mock', 'test', { ENGAGE_IYS_MOCK_URL: url }), String(url)).toThrow(Conn.IysConfigError);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the opt-out queue', () => {
    it('queues an opt-out in the transaction that records it, with the address and the moment, and marks nothing else', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
      const rows = await outbox(t);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ profile_id: a.id, channel: 'email', consent_source: 'unsubscribe_link', recipient: a.email, status: 'pending', attempts: 0, outcome: null });
      expect(new Date(rows[0].consent_at).getTime()).toBe(clock - HOUR);
      expect(rows[0].claimed_at).toBeNull();
    });
    it('queues the SMS and call opt-outs with the phone number, and nothing for WhatsApp', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['sms'] });
      await P.recordConsent(t.org, a.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { x: 1 } });
      await optOut(t, a.id, 'sms', 'stop_keyword');
      await P.recordConsent(t.org, a.id, { channel: 'whatsapp', status: 'revoked', source: 'stop_keyword' });
      const rows = await outbox(t);
      expect(rows.map((r) => [r.channel, r.consent_source, r.recipient])).toEqual([['sms', 'stop_keyword', a.phone]]);
    });
    it('does not queue what has nothing to revoke, what came from İYS, or an opt-out of a tenant without İYS', async () => {
      const t = await tenant();
      const neverGranted = await customer(t);
      await optOut(t, neverGranted.id);
      const noAddress = await customer(t, { email: null, grant: ['email'] });
      await optOut(t, noAddress.id);
      const fromIys = await customer(t, { grant: ['email'] });
      await P.recordConsent(t.org, fromIys.id, { channel: 'email', status: 'revoked', source: 'iys' });
      expect(await outbox(t)).toEqual([]);
      const plain = await tenant({ iys: false });
      const b = await customer(plain, { grant: ['email'] });
      await optOut(plain, b.id);
      expect(await outbox(plain)).toEqual([]);
    });
    it('queues every route an opt-out can take (unsubscribe link, STOP, API, web, import)', async () => {
      const t = await tenant();
      for (const source of ['unsubscribe_link', 'api', 'web', 'import'] as const) {
        const c = await customer(t, { grant: ['email'] });
        await optOut(t, c.id, 'email', source);
      }
      expect((await outbox(t)).map((r) => r.consent_source).sort()).toEqual(['api', 'import', 'unsubscribe_link', 'web']);
    });
    it('is one row per opt-out and never leaves the tenant: another tenant sees none of it', async () => {
      const a = await tenant();
      const b = await tenant();
      const c = await customer(a, { grant: ['email'] });
      await optOut(a, c.id);
      expect(await outbox(a)).toHaveLength(1);
      expect(await outbox(b)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('reporting an opt-out to İYS (push)', () => {
    it('reports it as a RET with the documented fields, ends the row as sent with İYS\'s transaction, empties the address and stamps the ledger', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - 2 * HOUR);
      const out = await S.pushPending(t.org);
      expect(out).toMatchObject({ claimed: 1, sent: 1, failed: 0, skipped: 0, retrying: 0 });
      const call = mock.requests.find((r) => r.path.startsWith('/v2/sps/'))!;
      expect(call.body).toMatchObject({ recipient: a.email, type: 'EPOSTA', status: 'RET', source: 'HS_EPOSTA', recipientType: 'BIREYSEL' });
      expect(Object.keys(call.body as object).sort()).toEqual(['consentDate', 'recipient', 'recipientType', 'source', 'status', 'type']);
      expect(mock.current(a.email!, 'EPOSTA')).toMatchObject({ status: 'RET', source: 'HS_EPOSTA' });
      const [row] = await outbox(t);
      expect(row).toMatchObject({ status: 'sent', outcome: 'registered', attempts: 1, recipient: null, last_error_code: null });
      expect(row.transaction_id).toMatch(/^[0-9a-f]{64}$/);
      expect(row.sent_at).not.toBeNull();
      expect((await sql(t.org, `SELECT iys_synced_at FROM engage.consents WHERE id = $1`, [row.consent_id])).rows[0]!.iys_synced_at).not.toBeNull();
      // Nothing is reported twice.
      expect(await S.pushPending(t.org)).toMatchObject({ claimed: 0 });
      expect(mock.requests.filter((r) => r.path.startsWith('/v2/sps/'))).toHaveLength(1);
    });
    it('sends an SMS opt-out as MESAJ with the phone number and the STOP source', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['sms'] });
      iysHolds(a.phone!, 'MESAJ');
      await optOut(t, a.id, 'sms', 'stop_keyword', clock - HOUR);
      await S.pushPending(t.org);
      expect(mock.requests.find((r) => r.path.startsWith('/v2/sps/'))!.body).toMatchObject({ recipient: a.phone, type: 'MESAJ', source: 'HS_MESAJ', status: 'RET' });
    });
    it('is idempotent at İYS: a report repeated after a crash returns the same transaction and registers nothing twice', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
      // The worker reported to İYS and died before it finished the row: İYS has the RET, the row is still pending.
      const first = await Conn.iysDeps.makeClient(await Conn.loadConnection(t.org)).addConsent({ recipient: a.email!, type: 'EPOSTA', status: 'RET', source: 'HS_EPOSTA', consentDate: new Date(clock - HOUR) });
      expect((await outbox(t))[0]).toMatchObject({ status: 'pending' });
      await S.pushPending(t.org);
      expect((await outbox(t))[0]).toMatchObject({ status: 'sent', outcome: 'registered', transaction_id: first.transactionId });
      expect(mock.movements.filter((m) => m.source === 'HS_EPOSTA')).toHaveLength(1);
    });

    describe('every documented answer ends a report in the right state', () => {
      const run = async (setup: (a: { email: string; id: string }, t: Tn) => Promise<void> | void, over: { fault?: { status: number; code: string }; age?: (t: Tn, id: string) => Promise<unknown> } = {}) => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'] });
        await setup({ email: a.email!, id: a.id }, t);
        await optOut(t, a.id, 'email', 'unsubscribe_link', clock - 2 * HOUR);
        const [queued] = await outbox(t);
        if (over.age) await over.age(t, queued.id);
        if (over.fault) mock.failNext({ ...over.fault, when: (r) => r.path.startsWith('/v2/') });
        const out = await S.pushPending(t.org);
        return { t, out, row: (await outbox(t))[0]! };
      };
      it('H175, İYS has nothing to revoke: skipped, not in İYS', async () => {
        const { out, row } = await run(() => undefined);
        expect(out).toMatchObject({ skipped: 1, sent: 0 });
        expect(row).toMatchObject({ status: 'skipped', outcome: 'not_in_iys', last_error_code: 'H175', recipient: null });
      });
      it('H174, İYS already holds RET: sent, already current', async () => {
        const { row } = await run((a) => { iysHolds(a.email); mock.addRecipientChange({ recipient: a.email, type: 'EPOSTA', status: 'RET', consentDate: new Date(clock - 2.5 * DAY), creationMs: clock - 2.5 * DAY }); });
        expect(row).toMatchObject({ status: 'sent', outcome: 'already_current', last_error_code: 'H174' });
      });
      it('H178, İYS holds a newer decision (the recipient said yes again after our opt-out): skipped, superseded', async () => {
        const { row } = await run((a) => { iysHolds(a.email, 'EPOSTA', clock - 1 * HOUR); });
        expect(row).toMatchObject({ status: 'skipped', outcome: 'superseded', last_error_code: 'H178' });
      });
      it('H467, İYS no longer accepts it: failed, deadline missed', async () => {
        const { row } = await run((a) => iysHolds(a.email), { fault: { status: 422, code: 'H467' } });
        expect(row).toMatchObject({ status: 'failed', outcome: 'deadline_missed', last_error_code: 'H467' });
      });
      it('another request error (H121, a number İYS cannot take): failed, rejected, and not tried again', async () => {
        const { row, out } = await run((a) => iysHolds(a.email), { fault: { status: 422, code: 'H121' } });
        expect(out.failed).toBe(1);
        expect(row).toMatchObject({ status: 'failed', outcome: 'rejected', last_error_code: 'H121', recipient: null });
      });
      it('H453, two operations a day for the recipient: waits six hours, then goes through', async () => {
        const { t, row, out } = await run((a) => iysHolds(a.email), { fault: { status: 422, code: 'H453' } });
        expect(out).toMatchObject({ retrying: 1, sent: 0 });
        expect(row).toMatchObject({ status: 'pending', attempts: 1, last_error_code: 'H453', claimed_at: null });
        expect(new Date(row.next_attempt_at).getTime()).toBe(clock + 6 * HOUR);
        expect(await S.pushPending(t.org)).toMatchObject({ claimed: 0 }); // not before
        clock += 6 * HOUR + 1000;
        expect(await S.pushPending(t.org)).toMatchObject({ claimed: 1, sent: 1 });
      });
      it('a server error: stays queued, tried again after a minute, then two, and finally goes through', async () => {
        const { t, row } = await run((a) => iysHolds(a.email), { fault: { status: 503, code: 'ERR-SYS-0002' } });
        expect(row).toMatchObject({ status: 'pending', attempts: 1, last_error_code: 'ERR-SYS-0002', recipient: expect.any(String) });
        expect(new Date(row.next_attempt_at).getTime()).toBe(clock + 60_000);
        clock += 61_000;
        mock.failNext({ status: 503, code: 'ERR-SYS-0003', when: (r) => r.path.startsWith('/v2/') });
        await S.pushPending(t.org);
        expect(new Date((await outbox(t))[0]!.next_attempt_at).getTime()).toBe(clock + 120_000);
        clock += 121_000;
        expect(await S.pushPending(t.org)).toMatchObject({ sent: 1 });
        expect((await outbox(t))[0]).toMatchObject({ status: 'sent', attempts: 3 });
      });
      it('İYS unreachable: stays queued, nothing is lost', async () => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'] });
        await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
        await mock.stop();
        const out = await S.pushPending(t.org);
        expect(out).toMatchObject({ retrying: 1, error: 'unreachable' });
        expect((await outbox(t))[0]).toMatchObject({ status: 'pending', last_error_code: 'unreachable', recipient: a.email });
      });
      it('wrong credentials: the whole run waits (nothing else would work), the others are released, nothing fails', async () => {
        const t = await tenant({ password: 'not-the-password' });
        for (let i = 0; i < 3; i++) { const c = await customer(t, { grant: ['email'] }); await optOut(t, c.id, 'email', 'unsubscribe_link', clock - HOUR); }
        const out = await S.pushPending(t.org);
        expect(out).toMatchObject({ claimed: 3, retrying: 1, sent: 0, failed: 0, error: 'H251' });
        const rows = await outbox(t);
        expect(rows.map((r) => r.status)).toEqual(['pending', 'pending', 'pending']);
        expect(rows.every((r) => r.claimed_at === null)).toBe(true);
        expect(mock.requestsTo('/v2/')).toHaveLength(0);
        expect(new Date(rows[2]!.next_attempt_at).getTime()).toBe(clock + 15 * 60_000);
      });
      it('gives up after a hundred attempts, visibly', async () => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'] });
        await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
        await f.admin.query(`UPDATE engage.iys_outbox SET attempts = 100 WHERE organization_id = $1`, [t.org]);
        await S.pushPending(t.org);
        expect((await outbox(t))[0]).toMatchObject({ status: 'failed', outcome: 'gave_up' });
      });
    });

    describe('the three-business-day limit', () => {
      it('an opt-out that waited past the limit is a failure (a missed deadline), and İYS is not asked', async () => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'] });
        iysHolds(a.email!);
        await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
        const [row] = await outbox(t);
        await age(t, row.id, clock - 6 * DAY); // queued six days ago, never reported
        const out = await S.pushPending(t.org);
        expect(out).toMatchObject({ failed: 1 });
        expect((await outbox(t))[0]).toMatchObject({ status: 'failed', outcome: 'deadline_missed', recipient: null });
        expect(mock.requestsTo('/v2/')).toHaveLength(0);
      });
      it('an imported opt-out that was already older than the limit when it was queued is history, not a breach', async () => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'], grantedAt: clock - 400 * DAY });
        await optOut(t, a.id, 'email', 'import', clock - 90 * DAY);
        await S.pushPending(t.org);
        expect((await outbox(t))[0]).toMatchObject({ status: 'skipped', outcome: 'historical' });
        expect(mock.requestsTo('/v2/')).toHaveLength(0);
        expect((await R.iysSlaReport(t.org, new Date(clock))).health).not.toBe('critical');
      });
    });

    it('reports oldest first, and one tenant\'s run never touches another tenant\'s queue', async () => {
      const a = await tenant();
      const b = await tenant();
      const c1 = await customer(a, { grant: ['email'] });
      const c2 = await customer(a, { grant: ['email'] });
      const other = await customer(b, { grant: ['email'] });
      for (const e of [c1.email!, c2.email!, other.email!]) iysHolds(e);
      await optOut(a, c2.id, 'email', 'unsubscribe_link', clock - 2 * HOUR);
      await optOut(a, c1.id, 'email', 'unsubscribe_link', clock - 4 * HOUR);
      await optOut(b, other.id, 'email', 'unsubscribe_link', clock - HOUR);
      await S.pushPending(a.org);
      expect(mock.requestsTo('/v2/').map((r) => (r.body as { recipient: string }).recipient)).toEqual([c1.email, c2.email]);
      expect((await outbox(b))[0]).toMatchObject({ status: 'pending' });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('pulling recipients\' changes from İYS', () => {
    it('applies a revocation and a grant as source iys, with the date the recipient acted, and the consent state follows', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      const b = await customer(t, { grant: [] });
      const revokedAt = clock - 2 * HOUR; // fixed now: the test clock moves forward when the code reads it
      mock.addRecipientChange({ recipient: a.email!, type: 'EPOSTA', status: 'RET', source: 'IYS_MOBIL', consentDate: new Date(revokedAt), creationMs: revokedAt });
      mock.addRecipientChange({ recipient: b.phone!, type: 'MESAJ', status: 'ONAY', source: 'IYS_WEB', consentDate: new Date(clock - HOUR), creationMs: clock - HOUR });
      const out = await S.pullChanges(t.org);
      expect(out).toMatchObject({ pages: 1, changes: 2, applied: 2, unmatched: 0, duplicates: 0, outcome: 'ok' });
      const ledger = (await sql(t.org, `SELECT profile_id, channel, status, source, evidence, recorded_at, iys_synced_at FROM engage.consents WHERE source = 'iys' ORDER BY recorded_at`)).rows;
      expect(ledger.map((r) => [r.channel, r.status])).toEqual([['email', 'revoked'], ['sms', 'granted']]);
      expect(new Date(ledger[0].recorded_at).getTime()).toBe(Math.floor(revokedAt / 1000) * 1000);
      expect(ledger[0].evidence).toMatchObject({ iys_source: 'IYS_MOBIL', iys_type: 'EPOSTA' });
      expect(ledger[0].iys_synced_at).not.toBeNull();
      expect(await P.hasConsent(t.org, a.id, 'email')).toBe(false);
      expect(await P.hasConsent(t.org, b.id, 'sms')).toBe(true);
      // What came from İYS is not reported back.
      expect(await outbox(t)).toEqual([]);
    });
    it('records each movement once by İYS\'s transaction id, keeps no address, and a second pull finds nothing new', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      mock.addRecipientChange({ recipient: a.email!, type: 'EPOSTA', status: 'RET', consentDate: new Date(clock - HOUR), creationMs: clock - HOUR });
      await S.pullChanges(t.org);
      expect(await S.pullChanges(t.org)).toMatchObject({ pages: 0, changes: 0, applied: 0 });
      const rows = (await sql(t.org, `SELECT * FROM engage.iys_changes`)).rows;
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(a.email!);
      expect(rows[0]).toMatchObject({ iys_type: 'EPOSTA', iys_status: 'RET', iys_source: 'IYS_WEB', outcome: 'applied', profile_id: a.id });
      // Applying the same page again (the marker lost in a crash) records nothing twice.
      await sql(t.org, `UPDATE engage.iys_sync_state SET changes_after = NULL WHERE organization_id = $1`, [t.org]);
      expect(await S.pullChanges(t.org)).toMatchObject({ changes: 1, applied: 0, duplicates: 1 });
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.consents WHERE source = 'iys'`)).rows[0]!.n).toBe(1);
    });
    it('counts what nobody here has as unmatched, ignores erased customers, and never applies what the provider itself sent', async () => {
      const t = await tenant();
      const erased = await customer(t, { grant: ['email'] });
      await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE id = $1`, [erased.id]);
      mock.addRecipientChange({ recipient: 'stranger@example.com', type: 'EPOSTA', status: 'RET', creationMs: clock - HOUR });
      mock.addRecipientChange({ recipient: erased.email!, type: 'EPOSTA', status: 'RET', creationMs: clock - HOUR });
      const known = await customer(t, { grant: ['email'] });
      mock.addRecipientChange({ recipient: known.email!, type: 'EPOSTA', status: 'RET', source: 'HS_WEB', creationMs: clock - HOUR }); // our own report, listed under HS only
      const out = await S.pullChanges(t.org);
      expect(out).toMatchObject({ changes: 2, applied: 0, unmatched: 2 });
      expect(await P.hasConsent(t.org, known.id, 'email')).toBe(true);
    });
    it('keeps the newest decision when ours and İYS\'s disagree: a later local grant stays, an earlier one is revoked', async () => {
      const t = await tenant();
      const later = await customer(t, { grant: ['email'], grantedAt: clock - HOUR }); // we recorded consent after the recipient acted in İYS
      const earlier = await customer(t, { grant: ['email'], grantedAt: clock - 5 * HOUR });
      for (const c of [later, earlier]) mock.addRecipientChange({ recipient: c.email!, type: 'EPOSTA', status: 'RET', consentDate: new Date(clock - 3 * HOUR), creationMs: clock - 3 * HOUR });
      await S.pullChanges(t.org);
      expect(await P.hasConsent(t.org, later.id, 'email')).toBe(true);
      expect(await P.hasConsent(t.org, earlier.id, 'email')).toBe(false);
    });
    it('moves the marker with each page, so a failure between pages repeats nothing', async () => {
      const t = await tenant();
      const known = await Promise.all([0, 1, 2].map(() => customer(t, { grant: ['email'] })));
      // 1050 movements: the first 1000 are strangers, the last 50 include the three known customers.
      for (let i = 0; i < 1047; i++) mock.addRecipientChange({ recipient: `stranger${i}@example.com`, type: 'EPOSTA', status: 'RET', consentDate: new Date(clock - 2 * HOUR), creationMs: clock - 2 * HOUR + i * 1000 });
      known.forEach((k, i) => mock.addRecipientChange({ recipient: k.email!, type: 'EPOSTA', status: 'RET', consentDate: new Date(clock - HOUR), creationMs: clock - HOUR + i * 1000 }));
      let calls = 0;
      mock.failNext({ status: 503, code: 'ERR-SYS-0002', when: (r) => r.path.includes('/changes') && ++calls === 2 });
      const first = await S.pullChanges(t.org);
      expect(first).toMatchObject({ pages: 1, changes: 1000, outcome: 'error', errorCode: 'ERR-SYS-0002' });
      const state = (await sql(t.org, `SELECT changes_after, last_pull_at, last_pull_outcome FROM engage.iys_sync_state`)).rows[0]!;
      expect(state.changes_after).toMatch(/^\d+_[0-9a-f]+$/);
      expect(state.last_pull_at).toBeNull(); // a pull that failed is not a pull that succeeded
      const second = await S.pullChanges(t.org);
      expect(second).toMatchObject({ pages: 1, changes: 50, applied: 3, unmatched: 47, duplicates: 0, outcome: 'ok' });
      for (const k of known) expect(await P.hasConsent(t.org, k.id, 'email')).toBe(false);
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.iys_changes`)).rows[0]!.n).toBe(1050);
    }, 60_000);

    describe('when İYS cannot be pulled from', () => {
      const failing = async (fault: { status: number; code: string }) => {
        const t = await tenant();
        const a = await customer(t, { grant: ['email'] });
        mock.addRecipientChange({ recipient: a.email!, type: 'EPOSTA', status: 'RET', creationMs: clock - HOUR });
        mock.failNext({ ...fault, when: (r) => r.path.includes('/changes') });
        const out = await S.pullChanges(t.org);
        return { t, a, out, state: (await sql(t.org, `SELECT * FROM engage.iys_sync_state`)).rows[0]! };
      };
      it('a server error changes nothing and says so', async () => {
        const { a, t, out, state } = await failing({ status: 503, code: 'ERR-SYS-0002' });
        expect(out).toMatchObject({ outcome: 'error', errorCode: 'ERR-SYS-0002', applied: 0 });
        expect(state).toMatchObject({ last_pull_outcome: 'error', last_pull_error_code: 'ERR-SYS-0002', last_pull_at: null });
        expect(await P.hasConsent(t.org, a.id, 'email')).toBe(true);
      });
      it('an hourly limit is recorded as rate limited, with İYS\'s code', async () => {
        const { out, state } = await failing({ status: 429, code: 'H089' });
        expect(out).toMatchObject({ outcome: 'rate_limited', errorCode: 'H089' });
        expect(state.last_pull_outcome).toBe('rate_limited');
      });
      it('credentials İYS refuses are recorded as an authentication error', async () => {
        const t = await tenant({ password: 'not-the-password' });
        const out = await S.pullChanges(t.org);
        expect(out).toMatchObject({ outcome: 'auth_error', errorCode: 'H251' });
      });
      it('a tenant without an İYS account is a configuration error, recorded, and nothing is called', async () => {
        const t = await tenant({ iys: false });
        expect(await S.pullChanges(t.org)).toMatchObject({ outcome: 'config_error', errorCode: 'no_iys_account' });
        expect(mock.requests).toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('acceptance: İYS revocation before the next send', () => {
    const readyTenant = async () => {
      const t = await tenant();
      await sql(t.org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [t.org]);
      await M.addRateCard(t.org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(t.org, 'email', 1_000_000, 'TRY');
      const account = (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } })).id;
      return { t, account };
    };
    const UNSUB = 'https://example.com/u/xyz789';
    const marketing = async (t: Tn, account: string, p: { id: string; email: string | null }) => {
      await M.addAllowlistEntry(t.org, 'email', p.email!);
      return (await M.createMessage(t.org, {
        profileId: p.id, channel: 'email', purpose: 'marketing', channelAccountId: account, idempotencyKey: `k-${u()}`,
        content: { subject: 'Hello', html: `<p>Hi</p><a href="${UNSUB}">unsubscribe</a>`, unsubscribe_url: UNSUB, unsubscribe_one_click_url: 'https://api.example.com/api/engage/unsubscribe/t' },
      })).message;
    };

    it('a recipient revokes in İYS, the next pull applies it, and the send gate blocks the message that was about to go', async () => {
      process.env.SEND_MODE = 'sandbox';
      const { t, account } = await readyTenant();
      const revoker = await customer(t, { grant: ['email'] });
      const bystander = await customer(t, { grant: ['email'] });
      const queuedForRevoker = await marketing(t, account, revoker);
      const queuedForBystander = await marketing(t, account, bystander);

      // The recipient opts out through İYS (their app, the 3338 number, the İYS page): the tenant is not told.
      mock.addRecipientChange({ recipient: revoker.email!, type: 'EPOSTA', status: 'RET', source: 'IYS_WEB', consentDate: new Date(clock - HOUR), creationMs: clock - HOUR });
      expect(await P.hasConsent(t.org, revoker.id, 'email')).toBe(true); // not yet known here

      expect(await S.pullChanges(t.org)).toMatchObject({ applied: 1, outcome: 'ok' });

      expect(await P.hasConsent(t.org, revoker.id, 'email')).toBe(false);
      expect(await M.dispatchMessage(t.org, queuedForRevoker.id)).toEqual({ outcome: 'blocked', code: 'no_consent' });
      // The control: a customer who did nothing in İYS is sent to as before.
      expect((await M.dispatchMessage(t.org, queuedForBystander.id)).outcome).toBe('sent');
    });

    it('an opt-out recorded here is queued for İYS in the same breath, and reaches İYS before the three business days are over', async () => {
      process.env.SEND_MODE = 'sandbox';
      const { t } = await readyTenant();
      const a = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await P.recordConsent(t.org, a.id, { channel: 'email', status: 'revoked', source: 'unsubscribe_link' });
      const [queued] = await outbox(t);
      expect(queued).toMatchObject({ status: 'pending' });
      expect(R.classifyPending(new Date(queued.consent_at), new Date(clock))).toBe('on_track');
      await S.runIysSync({ onlyOrganizations: [t.org] });
      expect((await outbox(t))[0]).toMatchObject({ status: 'sent', outcome: 'registered' });
      expect(mock.current(a.email!, 'EPOSTA')).toMatchObject({ status: 'RET' });
      expect((await R.iysSlaReport(t.org, new Date(clock))).push).toMatchObject({ pending: 0, sent: 1, breached: 0 });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the SLA monitor', () => {
    it('says what is late, at risk and breached, from the moment of the opt-out, and the pull\'s freshness', async () => {
      const t = await tenant();
      const mk = async (consentAt: number) => {
        const c = await customer(t, { grant: ['email'], grantedAt: consentAt - 10 * DAY });
        await optOut(t, c.id, 'email', 'unsubscribe_link', consentAt);
        const row = (await outbox(t)).find((r) => r.profile_id === c.id)!;
        await age(t, row.id, consentAt, consentAt);
      };
      // clock is some instant; ages are relative to it. (The business-day boundaries are tested in the format unit test.)
      await mk(clock - 2 * HOUR);
      await mk(clock - 30 * HOUR);
      const early = await R.iysSlaReport(t.org, new Date(clock));
      expect(early.push).toMatchObject({ pending: 2, onTrack: 1, late: 1, breached: 0 });
      expect(early.push.oldestPendingAgeHours).toBe(30);
      expect(early.health).toBe('warning');
      const later = await R.iysSlaReport(t.org, new Date(clock + 30 * DAY));
      expect(later.push.breached).toBe(2);
      expect(later.health).toBe('critical');
    });
    it('classifies a pull by how long ago it last succeeded', async () => {
      const t = await tenant();
      expect((await R.iysSlaReport(t.org, new Date(clock))).pull.status).toBe('never');
      await S.pullChanges(t.org);
      expect((await R.iysSlaReport(t.org, new Date(clock + HOUR))).pull).toMatchObject({ status: 'ok', lastOutcome: 'ok' });
      expect((await R.iysSlaReport(t.org, new Date(clock + 10 * HOUR))).pull.status).toBe('stale');
      const dead = await R.iysSlaReport(t.org, new Date(clock + 4 * DAY));
      expect(dead.pull.status).toBe('critical');
      expect(dead.health).toBe('critical');
    });
    it('counts failures that were not a missed deadline as a warning, and a missed one as critical', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
      mock.failNext({ status: 422, code: 'H121', when: (r) => r.path.startsWith('/v2/') });
      await S.pushPending(t.org);
      await S.pullChanges(t.org);
      const rep = await R.iysSlaReport(t.org, new Date(clock));
      expect(rep.push).toMatchObject({ failed: 1, deadlineMissed: 0 });
      expect(rep.health).toBe('warning');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the scheduled run, the API and the guards', () => {
    it('runs for the tenants it is given, push then pull, and leaves every other tenant alone', async () => {
      const a = await tenant();
      const b = await tenant();
      const ca = await customer(a, { grant: ['email'] });
      const cb = await customer(b, { grant: ['email'] });
      iysHolds(ca.email!); iysHolds(cb.email!);
      await optOut(a, ca.id, 'email', 'unsubscribe_link', clock - HOUR);
      await optOut(b, cb.id, 'email', 'unsubscribe_link', clock - HOUR);
      const s = await S.runIysSync({ onlyOrganizations: [a.org] });
      expect(s).toMatchObject({ tenants: 1, pushed: 1, reported: 1, errors: 0 });
      expect((await outbox(a))[0]).toMatchObject({ status: 'sent' });
      expect((await outbox(b))[0]).toMatchObject({ status: 'pending' });
      expect((await sql(b.org, `SELECT count(*)::int AS n FROM engage.iys_sync_state`)).rows[0]!.n).toBe(0);
    });
    it('lists tenants with an active İYS account by id only, and none without one', async () => {
      const a = await tenant();
      const b = await tenant({ iys: false });
      const work = await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.iys_sync_work($1::uuid[])', [[a.org, b.org]]));
      expect(work.fields.map((x) => x.name)).toEqual(['organization_id']);
      expect(work.rows).toEqual([{ organization_id: a.org }]);
      expect((await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.iys_outbox'))).rows).toEqual([]);
    });
    it('shows a tenant admin the connection and the report, never the credentials, and nobody else', async () => {
      const t = await tenant();
      const r = await app.http('/settings/iys', { token: t.admin });
      expect(r.status).toBe(200);
      expect(r.json.connection).toMatchObject({ provider: 'mock', mode: 'test', iysCode: mock.o.iysCode, brandCode: mock.o.brandCode });
      expect((r.json.report as { health: string }).health).toBeDefined();
      expect(JSON.stringify(r.json)).not.toMatch(new RegExp(`${mock.o.password}|${mock.o.username}|secret|ciphertext`));
      expect((await app.http('/settings/iys', { token: t.member })).status).toBe(403);
      expect((await app.http('/settings/iys', {})).status).toBe(401);
      const none = await tenant({ iys: false });
      expect((await app.http('/settings/iys', { token: none.admin })).json).toEqual({ connection: null, report: null });
    });
    it('checks the connection on request, for an admin only', async () => {
      const t = await tenant();
      expect((await app.http('/settings/iys/check', { method: 'POST', token: t.admin })).json).toEqual({ ok: true, code: null, message: null, brandFound: true });
      expect((await app.http('/settings/iys/check', { method: 'POST', token: t.member })).status).toBe(403);
      const wrong = await tenant({ password: 'nope-nope' });
      expect((await app.http('/settings/iys/check', { method: 'POST', token: wrong.admin })).json).toMatchObject({ ok: false, code: 'H251' });
    });
    it('keeps a finished report as it is (only its address can be emptied), and the engage role cannot delete or rewrite the record', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
      await S.pushPending(t.org);
      await expect(sql(t.org, `UPDATE engage.iys_outbox SET status = 'pending' WHERE organization_id = $1`, [t.org])).rejects.toThrow(/finished İYS report/);
      await expect(sql(t.org, `UPDATE engage.iys_outbox SET consent_at = now() WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.iys_outbox WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
      mock.addRecipientChange({ recipient: a.email!, type: 'EPOSTA', status: 'ONAY', creationMs: clock - HOUR });
      await S.pullChanges(t.org);
      await expect(sql(t.org, `UPDATE engage.iys_changes SET outcome = 'ignored' WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.iys_changes WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
    });
    it('logs ids, counts and İYS\'s codes, never an address, a password or a token', async () => {
      const t = await tenant();
      const a = await customer(t, { grant: ['email'] });
      const b = await customer(t, { grant: ['email'] });
      iysHolds(a.email!);
      await optOut(t, a.id, 'email', 'unsubscribe_link', clock - HOUR);
      await optOut(t, b.id, 'email', 'unsubscribe_link', clock - HOUR); // İYS has nothing for b: H175, logged as a refusal
      mock.addRecipientChange({ recipient: a.email!, type: 'EPOSTA', status: 'ONAY', creationMs: clock - HOUR });
      await S.runIysSync({ onlyOrganizations: [t.org] });
      const text = logs.join('\n');
      expect(text).toContain('iys report refused');
      expect(text).toContain('H175');
      for (const secret of [a.email!, b.email!, a.phone!, mock.o.password]) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/access_token|refresh_token|Bearer /);
    });
  });
});
