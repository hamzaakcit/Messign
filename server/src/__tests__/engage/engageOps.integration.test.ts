/**
 * The ops layer (WP-29, ADR-024) on real Postgres and HTTP: this is the alert drill. Real failures are provoked through the
 * WhatsApp mock (rejected credentials, failing calls, a tenant with no price), the ops check runs, and an alert is opened, told
 * to the operators once, kept while the condition lasts and resolved when it ends. Also: a real HTTP webhook receives the digest,
 * a webhook that is down leaves alerts "not told yet", tenants never see each other's alerts, the Settings routes show them,
 * and the restore check passes on a good database and catches tampering.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageOps.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { startMockGraph, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';
import { DEFAULT_THRESHOLDS } from '../../engage/ops/thresholds.js';
import type { Delivery } from '../../engage/ops/notify.js';

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'migrations');
const MIN = 60_000;

describe.skipIf(!adminUrl)('ops monitoring: the alert drill (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let O: typeof import('../../engage/ops/monitor.js');
  let AL: typeof import('../../engage/ops/alerts.js');
  let SN: typeof import('../../engage/ops/snapshot.js');
  let E: typeof import('../../engage/ops/errors.js');
  let RC: typeof import('../../engage/ops/restoreCheck.js');
  let graph: MockGraph;
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();
  interface Tn { org: string; userId: string; authUserId: string }

  async function tenant(o: { priced?: boolean } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Ops ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    if (o.priced !== false) {
      for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, 'whatsapp', 1_000_000, 'TRY');
    }
    return { org, userId: t.admin.userId, authUserId: t.admin.authUserId };
  }
  const waAccount = async (t: Tn) => (await creds.createAccount(t.org, t.userId, { channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`,
    config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr' }, secrets: { access_token: graph.o.accessToken, app_secret: `s-${u()}`, verify_token: `v-${u()}` } })).id;
  /** One WhatsApp message for a new customer, dispatched once. */
  async function dispatchOne(t: Tn, accountId: string) {
    const phone = phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `o-${u()}`, phone });
    await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { test: 'ops' }, recordedAt: new Date(Date.now() - 60_000) });
    await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    const { message } = await M.createMessage(t.org, { profileId: p.id, channel: 'whatsapp', purpose: 'transactional', channelAccountId: accountId, idempotencyKey: `k-${u()}`, content: { template: 'order_shipped' } });
    const out = await M.dispatchMessage(t.org, message.id);
    return { id: message.id, out };
  }
  interface Sent { text: string; notices: Array<Record<string, unknown>> }
  const sink = (ok = true) => {
    const calls: Sent[] = [];
    return { calls, send: async (text: string, notices: unknown[]): Promise<Delivery> => { calls.push({ text, notices: notices as Sent['notices'] }); return { configured: true, ok }; } };
  };
  const check = (t: Tn, send: (text: string, notices: unknown[]) => Promise<Delivery>, o: { at?: Date; thresholds?: typeof DEFAULT_THRESHOLDS } = {}) =>
    O.runOpsCheck({ onlyOrganizations: [t.org], send, queueFailures: async () => ({}), heartbeat: false, orgLabel: async () => 'tenant-x', now: () => o.at ?? new Date(), thresholds: o.thresholds });
  const rulesOf = (r: Awaited<ReturnType<typeof check>>) => r.found.flatMap((x) => x.conditions.map((c) => `${c.rule}:${c.severity}`)).sort();

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    O = await import('../../engage/ops/monitor.js');
    AL = await import('../../engage/ops/alerts.js');
    SN = await import('../../engage/ops/snapshot.js');
    E = await import('../../engage/ops/errors.js');
    RC = await import('../../engage/ops/restoreCheck.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    graph = await startMockGraph();
    graph.approveTemplate('order_shipped', 'tr', 0);
    process.env.ENGAGE_WHATSAPP_GRAPH_URL = graph.url;
    process.env.SEND_MODE = 'sandbox';
    E.resetErrorGroups();
    O.resetPlatformState();
  });
  afterEach(async () => { await graph.stop(); delete process.env.SEND_MODE; delete process.env.ENGAGE_WHATSAPP_GRAPH_URL; delete process.env.ENGAGE_ALERT_WEBHOOK_URL; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('a quiet tenant with an account has no alerts and nobody is told', async () => {
    const t = await tenant();
    await waAccount(t);
    const s = sink();
    const r = await check(t, s.send);
    expect(r).toMatchObject({ tenants: 1, conditions: 0, opened: 0, webhook: 'none', errors: 0 });
    expect(s.calls).toEqual([]);
  });

  it('DRILL: rejected credentials open a critical alert, the operators are told once, and it resolves when the failures stop', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    for (let i = 0; i < 3; i++) graph.failNext({ status: 401, code: 190 });
    for (let i = 0; i < 3; i++) await dispatchOne(t, acct);

    const s = sink();
    const first = await check(t, s.send);
    expect(rulesOf(first)).toContain('credentials_rejected:critical');
    expect(first).toMatchObject({ opened: expect.any(Number), webhook: 'sent' });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.text).toMatch(/\[CRITICAL\] new · tenant-x · credentials_rejected/);
    expect(s.calls[0]!.notices[0]).toMatchObject({ kind: 'opened', rule: 'credentials_rejected', subject: acct, severity: 'critical' });
    expect((await AL.listOpenAlerts(t.org)).map((a) => a.rule)).toContain('credentials_rejected');

    const again = await check(t, s.send);
    expect(again.opened).toBe(0);
    expect(s.calls).toHaveLength(1); // still open, already told: silence

    // 40 minutes later the failures are outside the window: the alert is resolved after its grace period, and that is told once.
    const later = new Date(Date.now() + 40 * MIN);
    const done = await check(t, s.send, { at: later });
    expect(done.resolved).toBeGreaterThan(0);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1]!.text).toMatch(/resolved · tenant-x · credentials_rejected/);
    await check(t, s.send, { at: new Date(later.getTime() + 5 * MIN) });
    expect(s.calls).toHaveLength(2);
    expect(await AL.listOpenAlerts(t.org)).toEqual([]);
  });

  it('a webhook that is down leaves the alert "not told yet", and the next run tells it', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    for (let i = 0; i < 3; i++) graph.failNext({ status: 401, code: 190 });
    for (let i = 0; i < 3; i++) await dispatchOne(t, acct);
    const down = sink(false);
    const r1 = await check(t, down.send);
    expect(r1.webhook).toBe('failed');
    expect(r1.told).toBe(0);
    const up = sink(true);
    const r2 = await check(t, up.send);
    expect(r2.webhook).toBe('sent');
    expect(up.calls).toHaveLength(1);
    const r3 = await check(t, up.send);
    expect(r3.webhook).toBe('none');
    expect(up.calls).toHaveLength(1);
  });

  it('failing provider calls make a provider_failing alert with the codes', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    for (let i = 0; i < 6; i++) graph.failNext({ status: 400, code: 132000 });
    for (let i = 0; i < 6; i++) await dispatchOne(t, acct);
    for (let i = 0; i < 6; i++) await dispatchOne(t, acct); // these succeed
    const r = await check(t, sink().send);
    expect(rulesOf(r)).toContain('provider_failing:critical');
    const c = r.found[0]!.conditions.find((x) => x.rule === 'provider_failing')!;
    expect(c.data).toMatchObject({ attempts: 12, failures: 6, rate: 0.5, provider: 'whatsapp_cloud' });
    expect(JSON.stringify(c.data)).toContain('wa_132000');
  });

  it('a tenant with no price set has its sends refused, and that is a setup alert', async () => {
    const t = await tenant({ priced: false });
    const acct = await waAccount(t);
    for (let i = 0; i < 5; i++) expect((await dispatchOne(t, acct)).out.outcome).toBe('blocked');
    const r = await check(t, sink().send);
    expect(rulesOf(r)).toContain('gate_denials_systemic:warning');
  });

  it('messages accepted but never reported on, and messages left waiting, are found', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const m = await dispatchOne(t, acct); expect(m.out.outcome).toBe('sent'); ids.push(m.id); }
    await f.admin.query(`UPDATE engage.messages SET status_changed_at = now() - interval '1 hour' WHERE organization_id = $1`, [t.org]);
    const waiting = await dispatchOne(t, acct); // sent now, so not "waiting for a report" yet
    await f.admin.query(`UPDATE engage.messages SET status = 'queued', next_attempt_at = now() - interval '20 minutes' WHERE organization_id = $1 AND id = $2`, [t.org, waiting.id]);
    const snap = await SN.takeSnapshot(t.org, DEFAULT_THRESHOLDS);
    expect(snap.accounts[0]).toMatchObject({ waitingForReport: 5, reports24h: 0, expectsReports: true, sent24h: 6 });
    expect(snap.queue).toMatchObject({ sendingOn: true, overdue: 1 });
    const r = await check(t, sink().send);
    expect(rulesOf(r)).toEqual(expect.arrayContaining(['delivery_reports_missing:critical', 'messages_stuck:warning']));
    await f.admin.query(`UPDATE engage.messages SET status = 'sent' WHERE organization_id = $1 AND id = $2`, [t.org, waiting.id]); // undo the hand edit
  });

  it('while sending is off for the tenant, waiting messages are not an alert', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    const m = await dispatchOne(t, acct);
    await f.admin.query(`UPDATE engage.messages SET status = 'queued', next_attempt_at = now() - interval '20 minutes' WHERE organization_id = $1 AND id = $2`, [t.org, m.id]);
    await sql(t.org, `UPDATE engage.tenant_settings SET send_enabled = false WHERE organization_id = $1`, [t.org]);
    expect(rulesOf(await check(t, sink().send))).not.toContain('messages_stuck:warning');
    await f.admin.query(`UPDATE engage.messages SET status = 'sent' WHERE organization_id = $1 AND id = $2`, [t.org, m.id]); // undo the hand edit
  });

  it('counts provider-reported bounces and complaints of the last day', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    const a = await dispatchOne(t, acct);
    await dispatchOne(t, acct);
    await sql(t.org, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'bounced', 'provider')`, [t.org, a.id]);
    const snap = await SN.takeSnapshot(t.org, DEFAULT_THRESHOLDS);
    expect(snap.accounts[0]).toMatchObject({ sent24h: 2, bounced24h: 1, reports24h: 1 });
  });

  it('the digest reaches a real HTTP webhook with text, content and notices, and no customer data', async () => {
    const t = await tenant();
    const acct = await waAccount(t);
    for (let i = 0; i < 3; i++) graph.failNext({ status: 401, code: 190 });
    const sent: string[] = [];
    for (let i = 0; i < 3; i++) sent.push(...[]);
    for (let i = 0; i < 3; i++) await dispatchOne(t, acct);
    const bodies: Array<Record<string, unknown>> = [];
    const hook: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => { bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); res.writeHead(200).end('ok'); });
    });
    await new Promise<void>((r) => hook.listen(0, '127.0.0.1', r));
    process.env.ENGAGE_ALERT_WEBHOOK_URL = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/services/secret-token`;
    try {
      const r = await O.runOpsCheck({ onlyOrganizations: [t.org], queueFailures: async () => ({}), heartbeat: false, orgLabel: async () => 'tenant-x' });
      expect(r.webhook).toBe('sent');
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ source: 'messign-engage', text: expect.stringContaining('credentials_rejected'), content: expect.stringContaining('credentials_rejected') });
      expect(JSON.stringify(bodies[0])).not.toMatch(/\+90|secret-token|access_token|app_secret/);
    } finally { await new Promise<void>((r) => hook.close(() => r())); }
  });

  it('only the tenant with a problem has alerts; another tenant sees none of them; work lists follow open alerts', async () => {
    const a = await tenant();
    const b = await tenant();
    const aAcct = await waAccount(a);
    await waAccount(b);
    for (let i = 0; i < 3; i++) graph.failNext({ status: 401, code: 190 });
    for (let i = 0; i < 3; i++) await dispatchOne(a, aAcct);
    await check(a, sink().send);
    expect((await AL.listOpenAlerts(a.org)).length).toBeGreaterThan(0);
    expect(await AL.listOpenAlerts(b.org)).toEqual([]);
    const work = async () => (await f.engage.withEngageScheduler((c) => c.query<{ organization_id: string }>('SELECT organization_id FROM engage.ops_work(1000, $1::uuid[])', [[a.org, b.org]]))).rows.map((r) => r.organization_id).sort();
    expect(await work()).toEqual([a.org, b.org].sort());
    await creds.disableAccount(a.org, aAcct);
    await sql(b.org, `UPDATE engage.channel_accounts SET status = 'disabled' WHERE organization_id = $1`, [b.org]).catch(() => undefined);
    expect(await work()).toContain(a.org); // its alert is still open, so it is still looked at (and will be closed)
  });

  it('an error caught in a tenant check is tracked and does not stop the other tenants', async () => {
    const t = await tenant();
    await waAccount(t);
    const r = await O.runOpsCheck({ onlyOrganizations: [t.org], send: sink().send, queueFailures: async () => { throw new Error('queue read failed 42'); }, heartbeat: false });
    expect(r.errors).toBe(1);
    expect(E.errorGroups().some((g) => g.source === 'ops_platform')).toBe(true);
  });

  describe('Settings routes', () => {
    it('the attention list and the delivery health show the alerts of the admin\'s own tenant; members are refused', async () => {
      const t = await tenant();
      const acct = await waAccount(t);
      for (let i = 0; i < 3; i++) graph.failNext({ status: 401, code: 190 });
      for (let i = 0; i < 3; i++) await dispatchOne(t, acct);
      await check(t, sink().send);
      const member = `member-${u()}`;
      await f.admin.query(`INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`, [t.org, member, `${member}@example.com`]);
      const get = (path: string, tok: string) => fetch(`${app.baseUrl}/settings/${path}`, { headers: { authorization: `Bearer ${tok}` } });
      const admin = token(t.authUserId, t.org);

      const attention = await (await get('attention', admin)).json() as { items: Array<{ code: string; subject?: string; severity: string }> };
      expect(attention.items).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'credentials_rejected', subject: acct, severity: 'critical' })]));

      const health = await (await get('delivery-health', admin)).json() as { accounts: Array<{ accountId: string; status: string; issues: Array<{ rule: string }> }> };
      expect(health.accounts).toHaveLength(1);
      expect(health.accounts[0]).toMatchObject({ accountId: acct, status: 'failing' });
      expect(health.accounts[0]!.issues.map((i) => i.rule)).toContain('credentials_rejected');

      expect((await get('delivery-health', token(member, t.org))).status).toBe(403);
      expect((await get('attention', token(member, t.org))).status).toBe(403);
    });
  });

  describe('restore check', () => {
    it('passes on a good database, and catches a lost event, an edited consent state and a wrong manifest', async () => {
      const t = await tenant();
      const acct = await waAccount(t);
      await dispatchOne(t, acct);
      await f.admin.query('SELECT engage.ensure_event_partition(now())');
      const good = await RC.runRestoreCheck(f.admin, { migrationsDir: MIGRATIONS });
      expect(good.checks.filter((c) => !c.ok), JSON.stringify(good.checks.filter((c) => !c.ok))).toEqual([]);
      expect(good.ok).toBe(true);

      // Other test files write to this database at the same time, so the live manifest is taken as a superset: a restore from earlier.
      const live = { ...good.manifest, tables: Object.fromEntries(Object.entries(good.manifest.tables).map(([k, v]) => [k, { ...v, count: v.count + 1_000_000 }])) };
      const withManifest = await RC.runRestoreCheck(f.admin, { migrationsDir: MIGRATIONS, manifest: live, skip: ['messages', 'consents'] });
      expect(withManifest.checks.find((c) => c.name === 'counts')).toMatchObject({ ok: true });
      const tooSmall = { ...live, tables: { ...live.tables, messages: { count: 0, newest: null } } };
      expect((await RC.runRestoreCheck(f.admin, { migrationsDir: MIGRATIONS, manifest: tooSmall, skip: ['messages', 'consents'] })).checks.find((c) => c.name === 'counts')).toMatchObject({ ok: false });

      const client = await f.admin.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM engage.message_events WHERE organization_id = $1 AND type = 'sent'`, [t.org]);
        expect((await RC.runRestoreCheck(client, { migrationsDir: MIGRATIONS, skip: ['consents'] })).checks.find((c) => c.name === 'messages')).toMatchObject({ ok: false });
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        await client.query(`INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, 'x')`, [t.org]);
        await client.query(`UPDATE engage.consent_state SET status = CASE WHEN status = 'granted' THEN 'revoked' ELSE 'granted' END WHERE organization_id = $1`, [t.org]);
        expect((await RC.runRestoreCheck(client, { migrationsDir: MIGRATIONS, skip: ['messages'] })).checks.find((c) => c.name === 'consents')).toMatchObject({ ok: false });
        await client.query('ROLLBACK');
      } finally { client.release(); }
    }, 120_000); // the checks read whole ledgers: a database left with a large import makes them slow

    it('refuses to run as a role that row-level security would blind', async () => {
      const r = await RC.runRestoreCheck(f.engage.getEngagePool() as never, { migrationsDir: MIGRATIONS });
      expect(r.ok).toBe(false);
      expect(r.checks[0]).toMatchObject({ name: 'access', ok: false });
    });
  });
});
