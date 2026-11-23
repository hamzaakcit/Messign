/**
 * Sandbox end-to-end test across the test ladder (WP-30). One scenario for one synthetic bookstore tenant, from the
 * Settings API to the audit trail, on real Postgres and the real HTTP stack, with every channel provider replaced by its
 * mock (mock email adapter and delivery-report simulator = ladder step 1; the mock Graph API and the mock İYS server
 * stand in for providers we only know from documentation). It evidences pilot gates 4 to 8 of the 90-day roadmap:
 *   4 consent and suppression       a customer who stopped, never consented, is suppressed or is not on the allow-list gets nothing
 *   5 idempotency                   duplicate triggers, concurrent executors and replayed delivery reports leave one message each
 *   6 kill switch                   the global and the per-tenant switch stop a running batch at the next message (timed)
 *   7 audit trail                   every message traces to a gate decision, the consent in force, the journey version and its approver
 *   8 tenant isolation              a second tenant sees none of it and cannot act on it
 * Each check writes a line of evidence; ENGAGE_E2E_REPORT=/path/report.json saves them (docs/quality/e2e-report-wp30.md).
 *
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageSandboxE2E.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { startMockGraph, statusPayload, textPayload, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';
import { signBody } from '../../engage/whatsapp/format.js';
import type { MockIys } from '../../engage/iys/mock/mockIysServer.js';

// The whole server suite runs its files in parallel on one database (CI too): the audit walk over every customer's trail
// took 15 s once under that load, so each check gets room instead of a flaky default.
vi.setConfig({ testTimeout: 120_000 });

const WABA = '102290129340398';
const APP_SECRET = 'e2e-app-secret';
const DAY = 24 * 3_600_000;
const BULK = 120;

interface Evidence { gate: string; check: string; result: string }
const evidence: Evidence[] = [];
const note = (gate: string, check: string, result: string): void => { evidence.push({ gate, check, result }); };

describe.skipIf(!adminUrl)('sandbox end to end across the test ladder (real Postgres, HTTP, mock providers)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let graph: MockGraph;
  let iys: MockIys;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let T: typeof import('../../engage/templates/templates.js');
  let WT: typeof import('../../engage/whatsapp/templates.js');
  let WC: typeof import('../../engage/whatsapp/templateCheck.js');
  let S: typeof import('../../engage/segments/segments.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let CA: typeof import('../../engage/journeys/cartAbandonment.js');
  let Syn: typeof import('../../engage/import/synthetic.js');
  let Imp: typeof import('../../engage/import/run.js');
  let Sim: typeof import('../../engage/simulator/cartSimulator.js');
  let SimRun: typeof import('../../engage/simulator/runCartSimulation.js');
  let IysSync: typeof import('../../engage/iys/sync.js');
  let IysConn: typeof import('../../engage/iys/connection.js');
  let IysClient: typeof import('../../engage/iys/client.js');
  let Ops: typeof import('../../engage/ops/monitor.js');
  let mockAdapter: typeof import('../../engage/messaging/mockAdapter.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905002${n++}`; })();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // The state the scenario builds up, test by test.
  interface Tn { org: string; userId: string; authUserId: string; admin: string }
  let A: Tn;
  let B: Tn;
  let emailAccount: string;
  let waAccount: string;
  let emailTemplateKey: string;
  let emailTemplateId: string;
  let waTemplateId: string;
  let waTemplateKey: string;
  let fallbackJourney: { id: string; key: string };
  let triggerKey: string;
  const cast = {} as Record<'reach' | 'emailOnly' | 'noConsent' | 'outsider' | 'suppressed' | 'unsub' | 'iysRevoker' | 'stopper', { id: string; externalId: string; email: string; phone?: string }>;
  let clock = Date.now();
  let emailSendSpy: ReturnType<typeof vi.spyOn>;

  const authed = (t: Tn) => ({ token: t.admin });
  const run = async (org: string, now = new Date()): Promise<Record<string, number>> => { await E.runTenantTick(org, now); return M.dispatchDue(org, 5000); };
  const msgsOf = async (org: string, profileId: string) =>
    (await sql(org, `SELECT m.id, m.channel, m.status, m.error_code, m.content FROM engage.messages m WHERE m.profile_id = $1 ORDER BY m.created_at, m.id`, [profileId])).rows as Array<{ id: string; channel: string; status: string; error_code: string | null; content: Record<string, unknown> }>;
  const label = (rows: Array<{ channel: string; status: string }>) => rows.map((m) => `${m.channel}:${m.status}`);
  const lastDecision = async (org: string, messageId: string) =>
    (await sql(org, `SELECT decision, code FROM engage.send_decisions WHERE message_id = $1 ORDER BY id DESC LIMIT 1`, [messageId])).rows[0] as { decision: string; code: string } | undefined;
  const withMode = async <R>(mode: string, fn: () => Promise<R>): Promise<R> => {
    const before = process.env.SEND_MODE;
    process.env.SEND_MODE = mode;
    try { return await fn(); } finally { if (before === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = before; }
  };
  async function makeKey(org: string, scopes: string[]): Promise<string> {
    const k = f.keys.generateApiKey();
    await f.admin.query(`INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'e2e', $2, $3, $4)`, [org, k.prefix, k.hash, scopes]);
    return k.plaintext;
  }
  async function newTenant(name: string): Promise<Tn> {
    const t = await f.provisionTenant(name);
    return { org: t.organization.id, userId: t.admin.userId, authUserId: t.admin.authUserId, admin: token(t.admin.authUserId, t.organization.id) };
  }
  /** A cast member: consent granted three days ago (so a later revocation in İYS is newer), on the allow-list unless said otherwise. */
  async function member(t: Tn, name: keyof typeof cast, o: { email?: boolean; wa?: boolean; allow?: boolean; phone?: boolean } = {}): Promise<void> {
    const email = `${name.toLowerCase()}-${u()}@example.com`;
    const phone = o.phone === false ? undefined : phoneN();
    const externalId = `cast-${name}-${u()}`;
    const p = await P.upsertProfile(t.org, { externalId, email, phone, attributes: { cast: 'yes', first_name: 'Ayşe' } });
    const at = new Date(Date.now() - 3 * DAY);
    if (o.email) await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'web', evidence: { form: 'e2e', test: 'wp30' }, recordedAt: at });
    if (o.wa) await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'web', evidence: { form: 'e2e', test: 'wp30' }, recordedAt: at });
    if (o.allow !== false) {
      await M.addAllowlistEntry(t.org, 'email', email);
      if (phone) await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    }
    cast[name] = { id: p.id, externalId, email, phone };
  }
  const waWebhook = (accountId: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    return fetch(`${app.baseUrl}/webhooks/${accountId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signBody(APP_SECRET, body) }, body });
  };

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    T = await import('../../engage/templates/templates.js');
    WT = await import('../../engage/whatsapp/templates.js');
    WC = await import('../../engage/whatsapp/templateCheck.js');
    S = await import('../../engage/segments/segments.js');
    E = await import('../../engage/journeys/engine.js');
    CA = await import('../../engage/journeys/cartAbandonment.js');
    Syn = await import('../../engage/import/synthetic.js');
    Imp = await import('../../engage/import/run.js');
    Sim = await import('../../engage/simulator/cartSimulator.js');
    SimRun = await import('../../engage/simulator/runCartSimulation.js');
    IysSync = await import('../../engage/iys/sync.js');
    IysConn = await import('../../engage/iys/connection.js');
    IysClient = await import('../../engage/iys/client.js');
    Ops = await import('../../engage/ops/monitor.js');
    mockAdapter = await import('../../engage/messaging/mockAdapter.js');
    const MockIysServer = await import('../../engage/iys/mock/mockIysServer.js');
    graph = await startMockGraph({ wabaId: WABA });
    process.env.ENGAGE_WHATSAPP_GRAPH_URL = graph.url;
    iys = await MockIysServer.startMockIys({ now: () => clock, visibilityDelayMs: 0 });
    process.env.ENGAGE_IYS_MOCK_URL = iys.url;
    IysConn.iysDeps.now = () => { clock = Math.max(clock, Date.now()); return new Date(clock); };
    IysConn.iysDeps.makeClient = (c) => new IysClient.IysClient({ baseUrl: c.baseUrl, iysCode: c.iysCode, brandCode: c.brandCode, credentials: c.credentials, now: () => clock, sleep: async () => undefined, minIntervalMs: 0 });
    emailSendSpy = vi.spyOn(mockAdapter.mockAdapter, 'send');
    app = await startEngageApp();
    A = await newTenant('Kitap Evi');
    B = await newTenant('Bravo Books');
  }, 120_000);

  afterAll(async () => {
    delete process.env.SEND_MODE;
    delete process.env.ENGAGE_WHATSAPP_GRAPH_URL;
    delete process.env.ENGAGE_IYS_MOCK_URL;
    emailSendSpy?.mockRestore();
    spies.forEach((s) => s.mockRestore());
    const path = process.env.ENGAGE_E2E_REPORT;
    if (path) writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), evidence }, null, 2));
    process.stdout.write(`\nsandbox E2E evidence (${evidence.length} checks)\n${evidence.map((e) => `  [${e.gate}] ${e.check}: ${e.result}`).join('\n')}\n`);
    await graph?.stop();
    await iys?.stop();
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('1. onboarding a tenant through the Settings API', () => {
    it('refuses to turn sending on until the server mode, an account, a price and a budget are in place, then accepts it', async () => {
      // SEND_MODE is unset: the global switch is off.
      const off = await app.http('/settings/send-enabled', { method: 'PUT', ...authed(A), body: { enabled: true } });
      expect(off.status).toBe(409);
      expect((off.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(expect.arrayContaining(['send_mode_off', 'no_email_account']));
      process.env.SEND_MODE = 'sandbox';

      emailAccount = (await app.http('/channel-accounts', { ...authed(A), body: { channel: 'email', provider: 'mock', mode: 'test', label: 'mock-email', config: {}, secrets: { webhook_secret: `whsec_${u()}` } } })).json.id as string;
      waAccount = (await app.http('/channel-accounts', { ...authed(A), body: {
        channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: 'wa-test',
        config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr', waba_id: WABA },
        secrets: { access_token: graph.o.accessToken, app_secret: APP_SECRET, verify_token: 'v' },
      } })).json.id as string;
      expect(emailAccount && waAccount).toBeTruthy();

      const stillNoPrice = await app.http('/settings/send-enabled', { method: 'PUT', ...authed(A), body: { enabled: true } });
      expect(stillNoPrice.status).toBe(409);
      expect((stillNoPrice.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(expect.arrayContaining(['no_rate_card', 'no_budget_cap']));

      expect((await app.http('/settings/sender', { method: 'PUT', ...authed(A), body: { senderName: 'Kitap Evi' } })).status).toBe(200);
      for (const channel of ['email', 'whatsapp']) {
        for (const category of ['marketing', 'transactional']) {
          expect((await app.http('/settings/rate-cards', { ...authed(A), body: { channel, category, unitCostMinor: 1, currency: 'TRY' } })).status).toBe(201);
        }
        expect((await app.http(`/settings/budget-caps/${channel}`, { method: 'PUT', ...authed(A), body: { monthlyCapMinor: 1_000_000, currency: 'TRY' } })).status).toBe(200);
      }
      expect((await app.http('/settings/gate', { method: 'PUT', ...authed(A), body: { frequencyCap: { max: 1000, windowHours: 24 } } })).status).toBe(200);
      const on = await app.http('/settings/send-enabled', { method: 'PUT', ...authed(A), body: { enabled: true } });
      expect(on.status).toBe(200);
      expect(on.json).toMatchObject({ sendEnabled: true });
      note('onboarding', 'send_enabled refused without server mode, account, rate card and budget; accepted once all exist', '409 with reasons twice, then 200');
    });

    it('registers the tenant\'s İYS account and a second tenant is set up the same way', async () => {
      await creds.createAccount(A.org, A.userId, { channel: 'iys', provider: 'mock', mode: 'test', label: 'iys', config: { iys_code: iys.o.iysCode, brand_code: iys.o.brandCode }, secrets: { username: iys.o.username, password: iys.o.password } });
      expect(await IysConn.checkConnection(A.org)).toMatchObject({ ok: true });
      await creds.createAccount(B.org, B.userId, { channel: 'email', provider: 'mock', mode: 'test', label: 'mock-email', config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
      await sql(B.org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [B.org]);
      await M.addRateCard(B.org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(B.org, 'email', 1_000_000, 'TRY');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('2. customers: a synthetic bookstore import and a cast of eight', () => {
    it('imports the synthetic bookstore CSV through the real importer and ends with exactly the generator\'s counts', async () => {
      const synth = Syn.generateSyntheticTenant({ kind: 'bookstore', profiles: BULK, seed: 20261123 });
      const importId = await Imp.createImport(A.org, A.userId, 'profiles', false, synth.profilesCsv);
      await Imp.runImportJob({ importId, organizationId: A.org });
      const rec = await Imp.getImport(A.org, importId);
      expect(rec.status).toBe('completed');
      const n = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.profiles`)).rows[0].n as number;
      expect(n).toBe(synth.expected.distinctProfiles);
      // Every address of a synthetic customer who agreed to email goes on the sandbox allow-list, as a tenant would list its test addresses.
      const emails = (await sql(A.org, `SELECT i.value_normalized AS email FROM engage.identifiers i JOIN engage.consent_state cs ON cs.organization_id = i.organization_id AND cs.profile_id = i.profile_id
                                         WHERE i.type = 'email' AND i.is_active AND cs.channel = 'email' AND cs.purpose = 'marketing' AND cs.status = 'granted'`)).rows.map((r) => r.email as string);
      for (const e of emails) await M.addAllowlistEntry(A.org, 'email', e);
      expect(emails.length).toBeGreaterThan(20);
      note('customers', `synthetic bookstore import (${BULK} rows)`, `${n} customers, ${emails.length} with email consent and a valid address; matches the generator's own count`);
    });

    it('creates the cast: one customer for each way a message may or may not go out', async () => {
      await member(A, 'reach', { email: true, wa: true });
      await member(A, 'emailOnly', { email: true, phone: false });
      await member(A, 'noConsent', {});
      await member(A, 'outsider', { email: true, allow: false });
      await member(A, 'suppressed', { email: true });
      await member(A, 'unsub', { email: true, phone: false });
      await member(A, 'iysRevoker', { email: true, phone: false });
      await member(A, 'stopper', { email: true, wa: true });
      await f.admin.query(`INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, 'hard_bounce')`, [A.org, cast.suppressed.email]);
      expect(Object.keys(cast)).toHaveLength(8);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('3. templates and a journey that needs approval', () => {
    it('creates an email template and a WhatsApp template Meta has approved, then a "WhatsApp, else email" journey', async () => {
      emailTemplateKey = `autumn-${u()}`;
      const t = await T.createTemplate(A.org, A.userId, { key: emailTemplateKey, name: 'Autumn books', subject: 'Yeni kitaplar', html: '<p>Merhaba {{first_name | default: "okur"}}</p><a href="{{unsubscribe_url}}">abonelikten cik</a>' });
      emailTemplateId = t.template.id;
      graph.setTemplate({ name: 'autumn_books', language: 'tr', status: 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.', buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }] });
      await WC.runTemplateCheck(A.org);
      waTemplateKey = `autumn-wa-${u()}`;
      const wa = await WT.createWhatsappTemplate(A.org, A.userId, {
        key: waTemplateKey, name: 'Autumn on WhatsApp',
        content: { metaName: 'autumn_books', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.', variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }] },
      });
      waTemplateId = wa.template.id;

      const definition = {
        trigger: { type: 'api' }, holdout_percent: 0,
        steps: [
          { id: 'choose', type: 'branch', branches: [{ when: { field: 'reachable.whatsapp', op: 'eq', value: true }, next: 'wa' }], otherwise: 'mail' },
          { id: 'wa', type: 'message', channel: 'whatsapp', template: waTemplateKey, purpose: 'marketing', next: 'done' },
          { id: 'mail', type: 'message', channel: 'email', template: emailTemplateKey, purpose: 'marketing', next: 'done' },
          { id: 'done', type: 'exit' },
        ],
      };
      const created = await app.http('/journeys', { ...authed(A), body: { key: `autumn-${u()}`, name: 'Autumn, WhatsApp else email', definition } });
      expect(created.status).toBe(201);
      const journeyId = (created.json.journey as { id: string; key: string }).id;
      fallbackJourney = { id: journeyId, key: (created.json.journey as { key: string }).key };

      // An unapproved version cannot be activated; the approval is recorded with who gave it.
      const early = await app.http(`/journeys/${journeyId}/versions/1/activate`, { method: 'POST', ...authed(A), body: {} });
      expect(early.status).toBeGreaterThanOrEqual(400);
      expect((await app.http(`/journeys/${journeyId}/versions/1/approve`, { method: 'POST', ...authed(A), body: {} })).status).toBe(200);
      expect((await app.http(`/journeys/${journeyId}/versions/1/activate`, { method: 'POST', ...authed(A), body: {} })).status).toBe(200);
      const v = (await sql(A.org, `SELECT approved_by, activated_by FROM engage.journey_versions WHERE journey_id = $1 AND version = 1`, [journeyId])).rows[0];
      expect(v.approved_by).toBe(A.userId);
      note('audit', 'journey approval', `activation of an unapproved version refused (${early.status}); approver recorded on the version`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('4. the first wave: triggers through the API, executor and dispatcher (gates 4 and 5)', () => {
    it('a duplicate trigger, three executors at once and two more passes leave exactly one message per customer', async () => {
      triggerKey = await makeKey(A.org, ['ingest', 'journeys:trigger']);
      const trigger = (c: { externalId: string }, idem: string) => app.http(`/v1/journeys/${fallbackJourney.key}/trigger`, { key: triggerKey, body: { external_id: c.externalId, idempotency_key: idem, payload: {} } });
      let duplicates = 0;
      for (const [name, c] of Object.entries(cast)) {
        const first = await trigger(c, `wave1-${name}`);
        const second = await trigger(c, `wave1-${name}`);
        expect(first.status, name).toBe(202);
        expect(second.json, name).toMatchObject({ status: 'duplicate', enrollment_id: first.json.enrollment_id });
        duplicates++;
      }
      await Promise.all([run(A.org), run(A.org), run(A.org)]);
      await run(A.org);
      await run(A.org);

      expect(await msgsOf(A.org, cast.reach.id).then(label)).toEqual(['whatsapp:sent']);
      expect(await msgsOf(A.org, cast.emailOnly.id).then(label)).toEqual(['email:sent']);
      expect(await msgsOf(A.org, cast.unsub.id).then(label)).toEqual(['email:sent']);
      expect(await msgsOf(A.org, cast.iysRevoker.id).then(label)).toEqual(['email:sent']);
      expect(await msgsOf(A.org, cast.stopper.id).then(label)).toEqual(['whatsapp:sent']);
      const blocked = async (c: { id: string }) => { const [m] = await msgsOf(A.org, c.id); return { status: m!.status, code: (await lastDecision(A.org, m!.id))?.code }; };
      expect(await blocked(cast.noConsent)).toEqual({ status: 'blocked', code: 'no_consent' });
      expect(await blocked(cast.outsider)).toEqual({ status: 'blocked', code: 'not_allowlisted' });
      expect(await blocked(cast.suppressed)).toEqual({ status: 'blocked', code: 'suppressed' });
      // Provider side: one WhatsApp request per WhatsApp message, one adapter call per sent email, and the ledger agrees.
      expect(graph.sent).toHaveLength(2);
      const emailSent = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages WHERE channel = 'email' AND status = 'sent'`)).rows[0].n as number;
      expect(emailSent).toBe(3);
      const twice = await sql(A.org, `SELECT message_id FROM engage.message_events WHERE type = 'sent' AND source = 'system' GROUP BY message_id HAVING count(*) > 1`);
      expect(twice.rowCount).toBe(0);
      note('4 consent', 'no consent / not on the allow-list / suppressed address', 'blocked with codes no_consent, not_allowlisted, suppressed; nothing reached a provider');
      note('5 idempotency', 'duplicate trigger, 3 concurrent executors, 2 extra passes', `${duplicates} duplicate triggers answered "duplicate"; 8 customers, 8 messages, ${graph.sent.length} WhatsApp requests, ${emailSent} emails, no message sent twice`);
    });

    it('delivery reports arrive shuffled and duplicated, and a replay of the same reports changes nothing', async () => {
      const sent = (await sql(A.org, `SELECT id, provider_message_id FROM engage.messages WHERE channel = 'email' AND status = 'sent' AND provider = 'mock'`)).rows as Array<{ id: string; provider_message_id: string }>;
      const batch = M.simulateReports(sent.map((s) => s.provider_message_id), { seed: 7, shuffle: true, duplicateRate: 0.5, weights: { delivered: 2, bounced: 1 } });
      const secretRow = await creds.loadAccountSecrets(A.org, emailAccount).catch(() => null);
      const secret = (secretRow as { secrets?: Record<string, string> } | null)?.secrets?.webhook_secret;
      expect(secret).toBeTruthy();
      const post = async () => {
        const w = M.signedMockWebhook(secret!, batch.events);
        const r = await fetch(`${app.baseUrl}/webhooks/${emailAccount}`, { method: 'POST', headers: { 'content-type': 'text/plain', ...w.headers }, body: w.body });
        return r.status;
      };
      expect(await post()).toBe(200);
      const status = async () => new Map((await sql(A.org, `SELECT provider_message_id, status FROM engage.messages WHERE id = ANY($1)`, [sent.map((s) => s.id)])).rows.map((r) => [r.provider_message_id as string, r.status as string]));
      const events = async () => (await sql(A.org, `SELECT count(*)::int AS n FROM engage.message_events WHERE message_id = ANY($1)`, [sent.map((s) => s.id)])).rows[0].n as number;
      const after1 = await status();
      const n1 = await events();
      for (const [pid, want] of batch.expected) expect(after1.get(pid), pid).toBe(want);
      expect(await post()).toBe(200);
      expect(await status()).toEqual(after1);
      expect(await events()).toBe(n1);
      // The forged variant is refused.
      const forged = M.signedMockWebhook('whsec_attacker', batch.events);
      expect((await fetch(`${app.baseUrl}/webhooks/${emailAccount}`, { method: 'POST', headers: { 'content-type': 'text/plain', ...forged.headers }, body: forged.body })).status).toBe(401);

      // WhatsApp: Meta's signed delivery and read reports, each twice.
      const waSent = (await sql(A.org, `SELECT provider_message_id FROM engage.messages WHERE channel = 'whatsapp' AND status = 'sent'`)).rows.map((r) => r.provider_message_id as string);
      for (let i = 0; i < 2; i++) {
        for (const id of waSent) {
          const to = graph.sent.find((s) => s.id === id)!.to;
          expect((await waWebhook(waAccount, statusPayload({ phoneNumberId: graph.o.phoneNumberId, id, status: 'delivered', to }))).status).toBe(200);
        }
      }
      const waStatus = (await sql(A.org, `SELECT status FROM engage.messages WHERE channel = 'whatsapp' AND status IN ('delivered','read')`)).rowCount;
      expect(waStatus).toBe(2);
      const delivered = [...batch.expected.values()].filter((v) => v === 'delivered').length;
      note('5 idempotency', 'delivery reports shuffled, 50% duplicated, applied twice', `${sent.length} email reports end as expected (${delivered} delivered, ${sent.length - delivered} bounced), second pass changed 0 rows and 0 events; forged signature 401; WhatsApp reports twice, 2 delivered`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('5. a campaign in flight while customers stop (gate 4)', () => {
    let campaignId: string;
    let queuedForUnsub: string;
    it('an email campaign to everyone with email consent queues its messages without sending them yet', async () => {
      const seg = await S.createSegment(A.org, A.userId, { key: `email-consent-${u()}`, name: 'Email consent', definition: { where: { field: 'consent.email', op: 'eq', value: 'granted' } } });
      const started = await app.http('/campaigns', { ...authed(A), body: { name: 'Autumn email', templateId: emailTemplateId, segmentId: seg.segment.id, holdoutPercent: 0, idempotencyKey: `camp-${u()}${u()}` } });
      expect(started.status).toBe(201);
      campaignId = (started.json.campaign as { id: string }).id;
      const enrolled = (started.json.campaign as { enrolled: number }).enrolled;
      expect(enrolled).toBeGreaterThan(20);
      // The executor creates the messages; the dispatcher has not run, so nothing is sent yet.
      await E.runTenantTick(A.org, new Date());
      queuedForUnsub = (await msgsOf(A.org, cast.unsub.id)).find((m) => m.status === 'queued')!.id;
      expect(queuedForUnsub).toBeTruthy();
      expect((await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages WHERE status = 'queued' AND channel = 'email'`)).rows[0].n).toBeGreaterThanOrEqual(enrolled - 3);
      // The audience was chosen by consent: every queued message belongs to a customer whose email consent is granted right now.
      const notGranted = await sql(A.org, `SELECT m.id FROM engage.messages m LEFT JOIN engage.consent_state cs ON cs.organization_id = m.organization_id AND cs.profile_id = m.profile_id AND cs.channel = 'email' AND cs.purpose = 'marketing'
                                            WHERE m.status = 'queued' AND m.channel = 'email' AND COALESCE(cs.status, 'none') <> 'granted'`);
      expect(notGranted.rowCount).toBe(0);
      note('4 consent', 'email campaign enrolled only customers with email consent', `${enrolled} enrolled of ${BULK + 8} customers; messages queued, none dispatched yet`);
    });

    it('one customer unsubscribes from the link in the queued message, one revokes in İYS, and neither is sent to', async () => {
      await sleep(1100); // İYS and Meta stamp whole seconds: let the opt-outs fall clearly after the first wave's decisions
      const oneClick = (await sql(A.org, `SELECT content->>'unsubscribe_one_click_url' AS url FROM engage.messages WHERE id = $1`, [queuedForUnsub])).rows[0].url as string;
      expect(oneClick).toContain('/api/engage/unsubscribe/');
      const tokenOf = oneClick.split('/').pop()!;
      const get = await fetch(`${app.baseUrl}/unsubscribe/${tokenOf}`);
      expect(get.status).toBe(200); // a GET shows the page and changes nothing
      expect(await P.hasConsent(A.org, cast.unsub.id, 'email')).toBe(true);
      const post = await fetch(`${app.baseUrl}/unsubscribe/${tokenOf}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
      expect(post.status).toBe(200);
      expect(await P.hasConsent(A.org, cast.unsub.id, 'email')).toBe(false);

      // İYS: the recipient revokes there, Messign pulls it.
      clock = Math.max(clock, Date.now());
      iys.addRecipientChange({ recipient: cast.iysRevoker.email, type: 'EPOSTA', status: 'RET', source: 'IYS_WEB', consentDate: new Date(clock), creationMs: clock });
      expect(await P.hasConsent(A.org, cast.iysRevoker.id, 'email')).toBe(true);
      expect(await IysSync.pullChanges(A.org)).toMatchObject({ applied: 1, outcome: 'ok' });
      expect(await P.hasConsent(A.org, cast.iysRevoker.id, 'email')).toBe(false);

      const callsBefore = emailSendSpy.mock.calls.length;
      const queuedBefore = (await sql(A.org, `SELECT id FROM engage.messages WHERE status = 'queued'`)).rows.map((r) => r.id as string);
      const tally = await M.dispatchDue(A.org, 5000);
      const campaignMsgs = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages WHERE channel = 'email'`)).rows[0].n as number;
      const why = Object.fromEntries((await sql(A.org, `SELECT d.code, count(*)::int AS n FROM engage.messages m JOIN engage.send_decisions d ON d.message_id = m.id AND d.id = (SELECT max(id) FROM engage.send_decisions x WHERE x.message_id = m.id)
                                                          WHERE m.status = 'blocked' AND m.id = ANY($1) GROUP BY 1`, [queuedBefore])).rows.map((r) => [r.code as string, r.n as number]));
      // Besides the two who stopped, the audience holds the cast members the gate must refuse and imported customers whose
      // consent has no usable address (messy data): all blocked with a code, none sent.
      expect(Object.keys(why).every((c) => ['suppressed', 'no_consent', 'not_allowlisted', 'no_recipient'].includes(c)), JSON.stringify(why)).toBe(true);
      expect(tally.blocked).toBe(Object.values(why).reduce((a, b) => a + b, 0));
      for (const c of [cast.unsub, cast.iysRevoker]) {
        const last = (await msgsOf(A.org, c.id)).at(-1)!;
        expect(last.status).toBe('blocked');
        expect(['suppressed', 'no_consent']).toContain((await lastDecision(A.org, last.id))?.code);
      }
      // Everyone else in the audience got exactly one campaign message.
      const perProfile = await sql(A.org, `SELECT profile_id FROM engage.messages WHERE id = ANY($1) GROUP BY profile_id HAVING count(*) > 1`, [queuedBefore]);
      expect(perProfile.rowCount).toBe(0);
      expect(emailSendSpy.mock.calls.length - callsBefore).toBe((tally.sent ?? 0));
      note('4 consent', 'revoked after the message was queued: unsubscribe link (one-click POST) and İYS pull', `both blocked at dispatch; the dispatch pass sent ${tally.sent} and blocked ${tally.blocked} (${JSON.stringify(why)}); GET of the link changed nothing; no customer got two campaign messages`);
    });

    it('a repeat of the campaign request is recognised and sends nothing more', async () => {
      const before = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n as number;
      const camp = await app.http(`/campaigns/${campaignId}`, authed(A));
      expect(camp.status).toBe(200);
      await run(A.org);
      expect((await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(before);
    });

    it('a WhatsApp campaign: the customer who replies STOP before dispatch is blocked, the other is sent to', async () => {
      const seg = await S.createSegment(A.org, A.userId, { key: `wa-consent-${u()}`, name: 'WhatsApp consent', definition: { where: { field: 'consent.whatsapp', op: 'eq', value: 'granted' } } });
      const started = await app.http('/campaigns', { ...authed(A), body: { name: 'Autumn WhatsApp', templateId: waTemplateId, segmentId: seg.segment.id, holdoutPercent: 0, idempotencyKey: `wa-${u()}${u()}` } });
      expect(started.status).toBe(201);
      expect((started.json.campaign as { enrolled: number }).enrolled).toBe(2);
      await E.runTenantTick(A.org, new Date());
      const stop = await waWebhook(waAccount, textPayload({ phoneNumberId: graph.o.phoneNumberId, from: cast.stopper.phone!, text: 'STOP', id: `wamid.${u()}` }));
      expect(stop.status).toBe(200);
      expect(await P.hasConsent(A.org, cast.stopper.id, 'whatsapp')).toBe(false);
      expect(await P.hasConsent(A.org, cast.stopper.id, 'email')).toBe(true); // a WhatsApp stop is a WhatsApp stop
      const before = graph.sent.length;
      const tally = await M.dispatchDue(A.org, 5000);
      expect(tally).toMatchObject({ sent: 1, blocked: 1 });
      expect(graph.sent.length - before).toBe(1);
      expect(graph.sent.at(-1)!.to).toBe(cast.reach.phone!.slice(1));
      const stopperLast = (await msgsOf(A.org, cast.stopper.id)).at(-1)!;
      expect(stopperLast).toMatchObject({ channel: 'whatsapp', status: 'blocked' });
      expect((await lastDecision(A.org, stopperLast.id))?.code).toMatch(/no_consent|suppressed/);
      const inbound = (await sql(A.org, `SELECT * FROM engage.inbound_events`)).rows;
      expect(JSON.stringify(inbound)).not.toMatch(/STOP|905002/);
      note('4 consent', 'WhatsApp STOP reply between enrolment and dispatch', 'stopper blocked, reach sent; WhatsApp stop left email consent alone; the inbound record holds neither text nor number');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('6. cart abandonment from events (event trigger, exits, duplicates)', () => {
    it('simulated carts, orders and duplicate deliveries give exactly the expected enrolments, exits and messages', async () => {
      const { journeyId } = await CA.installCartAbandonment(A.org, A.userId);
      expect((await app.http(`/journeys/${journeyId}/versions/1/approve`, { method: 'POST', ...authed(A), body: {} })).status).toBe(200);
      expect((await app.http(`/journeys/${journeyId}/versions/1/activate`, { method: 'POST', ...authed(A), body: {} })).status).toBe(200);
      const plan = Sim.planCartSimulation({ carts: 90, seed: 20261123, runId: 'e2e' });
      const sentBefore = emailSendSpy.mock.calls.length;
      const result = await SimRun.runCartSimulation(A.org, plan, { dispatch: true, concurrency: 4 });
      const v = Sim.verifyCartSimulation(plan, await SimRun.observeCartSimulation(A.org, plan), { dispatched: true });
      expect(v.mismatches).toEqual([]);
      expect(result.rejected).toBe(0);
      expect(result.duplicates).toBeGreaterThan(0);
      expect(emailSendSpy.mock.calls.length - sentBefore).toBe(v.totals.sent);
      const keys = new Set(emailSendSpy.mock.calls.slice(sentBefore).map((call: unknown[]) => (call[0] as { idempotencyKey: string }).idempotencyKey));
      expect(keys.size).toBe(v.totals.sent);
      note('5 idempotency', 'cart-abandonment events through ingestion: duplicate event deliveries, an order that exits the journey', `90 carts: ${result.duplicates} duplicate deliveries stored once; ${v.totals.enrolled} enrolled, ${v.totals.sent} sent, ${v.totals.blocked} blocked, ${v.totals.holdout} holdout; no mismatch with the scenario's own expectation; ${keys.size} distinct idempotency keys`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('7. the kill switches, timed (gate 6)', () => {
    it('SEND_MODE off and the tenant\'s own switch each stop a running batch at the next message, and nothing is lost', async () => {
      const seg = await S.createSegment(A.org, A.userId, { key: `winter-${u()}`, name: 'Winter', definition: { where: { field: 'consent.email', op: 'eq', value: 'granted' } } });
      const tpl = await T.createTemplate(A.org, A.userId, { key: `winter-${u()}`, name: 'Winter', subject: 'Kis kitaplari', html: '<p>Merhaba</p><a href="{{unsubscribe_url}}">abonelikten cik</a>' });
      const started = await app.http('/campaigns', { ...authed(A), body: { name: 'Winter', templateId: tpl.template.id, segmentId: seg.segment.id, holdoutPercent: 0, idempotencyKey: `win-${u()}${u()}` } });
      expect(started.status).toBe(201);
      const enrolled = (started.json.campaign as { enrolled: number }).enrolled;
      await E.runTenantTick(A.org, new Date());
      const due = (await sql(A.org, `SELECT id FROM engage.messages WHERE status = 'queued' AND content->>'template_id' = $1 ORDER BY created_at, id`, [tpl.template.id])).rows.map((r) => r.id as string);
      expect(due.length).toBe(enrolled);
      expect(due.length).toBeGreaterThan(40);

      const calls = () => emailSendSpy.mock.calls.length;
      let i = 0;
      // Messages the gate refuses on their merits (no usable address, an earlier opt-out) are part of any batch; count only the sends.
      const sendNext = async (n: number): Promise<void> => {
        for (let sentNow = 0; sentNow < n; i++) {
          const r = await M.dispatchMessage(A.org, due[i]!);
          expect(['sent', 'blocked']).toContain(r.outcome);
          if (r.outcome === 'sent') sentNow++;
        }
      };
      await sendNext(10);

      // Global switch: flipped between two messages of a running batch.
      const callsAtFlip = calls();
      const t0 = Date.now();
      process.env.SEND_MODE = 'off';
      const globalHeld = await M.dispatchMessage(A.org, due[i++]!);
      const globalMs = Date.now() - t0;
      expect(globalHeld).toEqual({ outcome: 'held', code: 'send_mode_off' });
      for (let k = 0; k < 5; k++) expect(await M.dispatchMessage(A.org, due[i++]!)).toEqual({ outcome: 'held', code: 'send_mode_off' });
      expect(calls() - callsAtFlip).toBe(0);
      process.env.SEND_MODE = 'sandbox';

      // Tenant switch, through the Settings API, flipped between two messages.
      const sentBeforeTenant = calls();
      await sendNext(5);
      const t1 = Date.now();
      expect((await app.http('/settings/send-enabled', { method: 'PUT', ...authed(A), body: { enabled: false } })).status).toBe(200);
      const tenantHeld = await M.dispatchMessage(A.org, due[i++]!);
      const tenantMs = Date.now() - t1;
      expect(tenantHeld).toEqual({ outcome: 'held', code: 'tenant_send_disabled' });
      const callsAtTenantFlip = calls();
      for (let k = 0; k < 5; k++) expect(await M.dispatchMessage(A.org, due[i++]!)).toEqual({ outcome: 'held', code: 'tenant_send_disabled' });
      expect(calls() - callsAtTenantFlip).toBe(0);
      expect(callsAtTenantFlip - sentBeforeTenant).toBe(5);
      // Another tenant is unaffected by this tenant's switch.
      expect((await sql(B.org, `SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1`, [B.org])).rows[0].send_enabled).toBe(true);

      // Switching back: the held messages go out, each once, none were written off.
      expect((await app.http('/settings/send-enabled', { method: 'PUT', ...authed(A), body: { enabled: true } })).status).toBe(200);
      await run(A.org);
      const states = (await sql(A.org, `SELECT status, count(*)::int AS n FROM engage.messages WHERE content->>'template_id' = $1 GROUP BY 1`, [tpl.template.id])).rows;
      const byStatus = Object.fromEntries(states.map((s) => [s.status as string, s.n as number]));
      const blockedLate = byStatus.blocked ?? 0; // customers who stopped in step 5 are blocked, not held
      expect((byStatus.sent ?? 0) + blockedLate).toBe(enrolled);
      const dup = await sql(A.org, `SELECT message_id FROM engage.message_events WHERE type = 'sent' AND source = 'system' GROUP BY message_id HAVING count(*) > 1`);
      expect(dup.rowCount).toBe(0);
      note('6 kill switch', 'SEND_MODE=off flipped during a batch of campaign messages', `10 sent, then the very next message held (${globalMs} ms after the flip), 5 more held, 0 adapter calls after the flip`);
      note('6 kill switch', 'tenant send_enabled=false through the Settings API during a batch', `5 sent, next held (${tenantMs} ms after the request), 5 more held, 0 adapter calls; another tenant stayed enabled`);
      note('6 kill switch', 'switching back on', `held messages went out once each: ${enrolled} messages, ${byStatus.sent} sent, ${blockedLate} blocked for earlier opt-outs, 0 sent twice`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('8. audit trail (gate 7): every message traces to its decision, consent and journey version', () => {
    it('for every message of the tenant, the trail shows an allow or deny decision, the consent in force and, for journeys, the approved version', async () => {
      expect((await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages WHERE status IN ('queued', 'sending')`)).rows[0].n).toBe(0);
      const profiles = (await sql(A.org, `SELECT DISTINCT profile_id FROM engage.messages`)).rows.map((r) => r.profile_id as string);
      let messages = 0, journeyMessages = 0, allowed = 0, denied = 0, withConsent = 0;
      for (const pid of profiles) {
        const r = await app.http(`/profiles/${pid}/trail`, authed(A));
        expect(r.status).toBe(200);
        const trail = r.json as unknown as { messages: Array<{ id: string; purpose: string; status: string; decisions: Array<{ decision: string; code: string; consentInForce: { status: string } | null }>; journey: { stepId: string } | null; template: unknown }>; enrollments: Array<{ version: number }> };
        for (const m of trail.messages) {
          messages++;
          expect(m.decisions.length, `${m.id} has a decision`).toBeGreaterThan(0);
          const final = m.decisions.at(-1)!;
          if (m.status !== 'blocked') { // sent, delivered, read, or reported back as bounced: all went to a provider
            expect(final.decision, `${m.id} reached a provider only after an allow`).toBe('allow');
            allowed++;
            if (m.purpose === 'marketing') { expect(final.consentInForce?.status, `${m.id} (${(m as { channel?: string }).channel}) consent in force`).toBe('granted'); withConsent++; }
          } else if (m.status === 'blocked') {
            expect(final.decision).toBe('deny');
            expect(final.code).toBeTruthy();
            denied++;
          }
          if (m.journey) journeyMessages++;
        }
      }
      expect(messages).toBeGreaterThan(150);
      // Every message that came from a journey or campaign sits on an approved, activated journey version.
      const unapproved = await sql(A.org, `SELECT m.id FROM engage.messages m
          JOIN engage.enrollment_steps st ON st.organization_id = m.organization_id AND st.message_id = m.id
          JOIN engage.enrollments en ON en.organization_id = st.organization_id AND en.id = st.enrollment_id
          JOIN engage.journey_versions v ON v.organization_id = en.organization_id AND v.id = en.journey_version_id
         WHERE v.approved_by IS NULL OR v.activated_by IS NULL`);
      expect(unapproved.rowCount).toBe(0);
      const noJourney = await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages m WHERE NOT EXISTS (SELECT 1 FROM engage.enrollment_steps st WHERE st.organization_id = m.organization_id AND st.message_id = m.id)`);
      expect(noJourney.rows[0].n).toBe(0);
      // Sandbox rows say so, and the decision rows are append-only for the engage role.
      const mode = await sql(A.org, `SELECT DISTINCT send_mode FROM engage.send_decisions`);
      expect(mode.rows.map((r) => r.send_mode)).toEqual(['sandbox']);
      await expect(sql(A.org, `UPDATE engage.send_decisions SET decision = 'allow'`)).rejects.toThrow();
      await expect(sql(A.org, `DELETE FROM engage.send_decisions`)).rejects.toThrow();
      note('7 audit', `trail of every message in the tenant (${profiles.length} customers)`, `${messages} messages: ${allowed} handed to a provider after an allow decision (${withConsent} marketing ones with the consent record in force and granted), ${denied} blocked with a deny code and reason; ${journeyMessages} came through journeys, all on approved and activated versions; decisions are append-only`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('9. results reconcile with the ledger', () => {
    it('the journey results screen counts the same enrolments and messages as direct SQL', async () => {
      const r = await app.http(`/journeys/${fallbackJourney.id}/analytics`, authed(A));
      expect(r.status).toBe(200);
      const res = r.json as unknown as { enrollments: { treatment: { entered: number } }; messages: { created: number; byStatus: Record<string, number> } };
      const sqlEntered = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.enrollments WHERE journey_id = $1`, [fallbackJourney.id])).rows[0].n as number;
      const sqlMsgs = (await sql(A.org, `SELECT m.status, count(*)::int AS n FROM engage.messages m JOIN engage.enrollment_steps st ON st.organization_id = m.organization_id AND st.message_id = m.id
                                           JOIN engage.enrollments en ON en.organization_id = st.organization_id AND en.id = st.enrollment_id WHERE en.journey_id = $1 GROUP BY 1`, [fallbackJourney.id])).rows;
      expect(res.enrollments.treatment.entered).toBe(sqlEntered);
      expect(res.messages.created).toBe(sqlMsgs.reduce((s, x) => s + (x.n as number), 0));
      for (const x of sqlMsgs) expect(res.messages.byStatus[x.status as string]).toBe(x.n);
      note('results', 'journey results vs direct SQL on the ledger', `${sqlEntered} enrolments and ${res.messages.created} messages agree, per status`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('10. a second tenant sees none of it and cannot act on it (gate 8)', () => {
    it('reads, writes and sends across the tenant line all fail, while the second tenant works normally', async () => {
      const bKey = await makeKey(B.org, ['ingest', 'journeys:trigger']);
      const bProfile = await P.upsertProfile(B.org, { externalId: cast.reach.externalId, email: cast.reach.email, phone: cast.reach.phone }); // same identifiers as A's customer, in another tenant
      await P.recordConsent(B.org, bProfile.id, { channel: 'email', status: 'granted', source: 'web', evidence: { test: 'wp30' }, recordedAt: new Date(Date.now() - 3 * DAY) });
      expect(bProfile.id).not.toBe(cast.reach.id);

      const attempts: Array<[string, number]> = [];
      const expectNotFound = async (what: string, path: string, opts: Parameters<TestApp['http']>[1] = {}) => {
        const r = await app.http(path, { token: B.admin, ...opts });
        attempts.push([what, r.status]);
        expect([400, 403, 404, 409], what).toContain(r.status);
        expect(JSON.stringify(r.json)).not.toContain(cast.reach.email);
      };
      await expectNotFound("A's customer trail", `/profiles/${cast.reach.id}/trail`);
      await expectNotFound("A's customer", `/profiles/${cast.reach.id}`);
      await expectNotFound("A's journey", `/journeys/${fallbackJourney.id}`);
      await expectNotFound("A's journey results", `/journeys/${fallbackJourney.id}/analytics`);
      await expectNotFound("a campaign with A's template and segment", '/campaigns/preview', { body: { templateId: emailTemplateId, segmentId: (await S.listSegments(A.org))[0]!.id } });
      await expectNotFound("A's channel account", `/channel-accounts/${emailAccount}`);
      const trig = await app.http(`/v1/journeys/${fallbackJourney.key}/trigger`, { key: bKey, body: { external_id: cast.reach.externalId, idempotency_key: 'x', payload: {} } });
      attempts.push(["trigger of A's journey with B's key", trig.status]);
      expect(trig.status).toBe(404);
      // A forged delivery report for A's account, signed with another tenant's secret.
      const forged = M.signedMockWebhook('whsec_of_tenant_b', M.simulateReports(['x']).events);
      expect((await fetch(`${app.baseUrl}/webhooks/${emailAccount}`, { method: 'POST', headers: { 'content-type': 'text/plain', ...forged.headers }, body: forged.body })).status).toBe(401);

      // Data: B's own queries see only B's rows.
      for (const table of ['profiles', 'messages', 'send_decisions', 'consents', 'enrollments', 'events', 'channel_accounts', 'send_allowlist', 'journeys', 'templates', 'campaigns', 'segments']) {
        const own = (await sql(B.org, `SELECT count(*)::int AS n FROM engage.${table} WHERE organization_id <> $1`, [B.org])).rows[0].n;
        expect(own, `B sees foreign rows in ${table}`).toBe(0);
      }
      // A's allow-list does not carry over: B's message to the same address is refused by the gate.
      const bAccount = (await creds.listAccounts(B.org))[0]!.id;
      const { message } = await M.createMessage(B.org, { profileId: bProfile.id, channel: 'email', purpose: 'marketing', channelAccountId: bAccount, idempotencyKey: `iso-${u()}`,
        content: { subject: 'Hi', html: '<p>Hi</p><a href="https://app.example.com/u/t">unsubscribe</a>', unsubscribe_url: 'https://app.example.com/u/t', unsubscribe_one_click_url: 'https://api.example.com/api/engage/unsubscribe/t' } });
      expect(await M.dispatchMessage(B.org, message.id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });
      // B's own allow-listed customer is sent to normally, and A's rows are unchanged by it.
      const aBefore = (await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n;
      await M.addAllowlistEntry(B.org, 'email', cast.reach.email);
      const { message: ok } = await M.createMessage(B.org, { profileId: bProfile.id, channel: 'email', purpose: 'marketing', channelAccountId: bAccount, idempotencyKey: `iso-${u()}`,
        content: { subject: 'Hi', html: '<p>Hi</p><a href="https://app.example.com/u/t">unsubscribe</a>', unsubscribe_url: 'https://app.example.com/u/t', unsubscribe_one_click_url: 'https://api.example.com/api/engage/unsubscribe/t' } });
      expect(await M.dispatchMessage(B.org, ok.id)).toMatchObject({ outcome: 'sent' });
      expect((await sql(A.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(aBefore);
      note('8 isolation', 'tenant B against tenant A: customer, trail, journey, results, campaign preview, account, trigger, forged webhook', `${attempts.map(([w, s]) => `${s}`).join(', ')} (all refused, none echoing A's data); B's queries see 0 foreign rows in 12 tables; A's allow-list does not carry over (blocked not_allowlisted); B sends normally and A's ledger is unchanged`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('11. operations after the run', () => {
    it('the ops check reports no failing provider, no missing reports and no stuck messages for a healthy run', async () => {
      const delivered: Array<{ text: string; notices: unknown[] }> = [];
      const summary = await Ops.runOpsCheck({
        onlyOrganizations: [A.org], send: async (text: string, notices: unknown[]) => { delivered.push({ text, notices }); return { configured: true, ok: true }; },
        queueFailures: async () => ({}), heartbeat: false, orgLabel: async () => 'kitap-evi', now: () => new Date(),
      });
      const open = (await sql(A.org, `SELECT rule FROM engage.ops_alerts WHERE state = 'open'`)).rows.map((r) => r.rule as string);
      const bad = open.filter((r) => /provider_failing|credentials_rejected|stuck|dlq|missing_reports/.test(r));
      expect(bad).toEqual([]);
      note('ops', 'ops check on the tenant after the whole run', `${summary.tenants} tenant checked, ${summary.conditions} conditions found, ${summary.opened} alerts opened, ${summary.errors} errors; open rules: ${open.length ? open.join(', ') : 'none'}`);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('12. the scheduled path', () => {
    it('a trigger is picked up and sent by the same two calls the scheduled job makes, for this tenant only', async () => {
      const fresh = `late-${u()}`;
      const email = `${fresh}@example.com`;
      const p = await P.upsertProfile(A.org, { externalId: fresh, email, attributes: { first_name: 'Deniz' } });
      await P.recordConsent(A.org, p.id, { channel: 'email', status: 'granted', source: 'web', evidence: { form: 'e2e', test: 'wp30' }, recordedAt: new Date(Date.now() - DAY) });
      await M.addAllowlistEntry(A.org, 'email', email);
      const r = await app.http(`/v1/journeys/${fallbackJourney.key}/trigger`, { key: triggerKey, body: { external_id: fresh, idempotency_key: `sched-${u()}`, payload: {} } });
      expect(r.status).toBe(202);
      expect(await msgsOf(A.org, p.id)).toHaveLength(0);
      // The journey job's handler body: the executor's tick, then the dispatcher (journeyJob.ts); narrowed to this tenant so parallel test files are left alone.
      const tick = await E.runJourneyTick({ onlyOrganizations: [A.org] });
      expect(tick.triggers + tick.runs).toBeGreaterThan(0);
      const tally = await M.dispatchDueAcrossTenants({ onlyOrganizations: [A.org] });
      expect(tally.sent).toBe(1);
      expect(await msgsOf(A.org, p.id).then(label)).toEqual(['email:sent']);
      // With the global switch off the dispatcher reads nothing at all.
      await withMode('off', async () => expect(await M.dispatchDueAcrossTenants({ onlyOrganizations: [A.org] })).toEqual({}));
      note('scheduler', 'the journey job\'s two calls (executor tick, then dispatcher) pick up a new API trigger', `trigger answered 202, no message until the tick, then 1 sent; dispatcher reads nothing with SEND_MODE off. (The pg-boss schedule itself is not exercised here.)`);
    });
  });
});
