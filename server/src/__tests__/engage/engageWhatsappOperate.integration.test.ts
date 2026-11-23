/**
 * Operating WhatsApp (WP-40c, ADR-025) on real Postgres, the real HTTP stack and the mock Graph API: the Settings card's view (the
 * account, the webhook URL, the checklist, the daily limit, the templates in use), and the four WhatsApp alerts: a template in use
 * stopped at Meta, the template check failing, Meta holding marketing back (131049), and messages held by the daily limit for a day.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageWhatsappOperate.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { startMockGraph, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

const WABA = '102290129340398';
const HOUR = 3_600_000;

describe.skipIf(!adminUrl)('operating WhatsApp: Settings card and alerts (real Postgres, HTTP, mock Graph)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let W: typeof import('../../engage/whatsapp/templates.js');
  let C: typeof import('../../engage/whatsapp/templateCheck.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let O: typeof import('../../engage/whatsapp/operate.js');
  let A: typeof import('../../engage/settings/attention.js');
  let snapshot: typeof import('../../engage/ops/snapshot.js');
  let rules: typeof import('../../engage/ops/rules.js');
  let thresholds: typeof import('../../engage/ops/thresholds.js');
  let graph: MockGraph;
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905003${n++}`; })();

  interface Tn { org: string; userId: string; account: string; admin: string; member: string; templateId: string; key: string }
  /** A tenant with a WhatsApp account and one registered template that Meta lists as approved (unless told otherwise). */
  async function tenant(o: { waba?: boolean; limit?: number; status?: string; quality?: string } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`WaO ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, sender_name = 'Kitap Evi', frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'whatsapp', 1_000_000, 'TRY');
    const account = (await creds.createAccount(org, t.admin.userId, {
      channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`,
      config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr', ...(o.waba === false ? {} : { waba_id: WABA }), ...(o.limit ? { daily_recipient_limit: o.limit } : {}) },
      secrets: { access_token: graph.o.accessToken, app_secret: 'app-secret', verify_token: 'v' },
    })).id;
    graph.setTemplate({
      name: 'autumn_books', language: 'tr', status: o.status ?? 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.',
      buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }], ...(o.quality ? { quality: o.quality } : {}),
    });
    if (o.waba !== false) await C.runTemplateCheck(org);
    const key = `autumn-${u()}`;
    const wa = await W.createWhatsappTemplate(org, t.admin.userId, {
      key, name: 'Autumn',
      content: { metaName: 'autumn_books', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.', variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }] },
    });
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, account, admin: token(t.admin.authUserId, org), member: token(member, org), templateId: wa.template.id, key };
  }
  async function customer(t: Tn) {
    const phone = phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `wo-${u()}`, phone, attributes: { first_name: 'Ayşe' } });
    await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { test: 'wp40c' }, recordedAt: new Date(Date.now() - 60_000) });
    await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    return p.id;
  }
  const send = async (t: Tn, profileId: string) => {
    const { message } = await f.engage.withEngageTenant(t.org, (c) => W.createWhatsappTemplatedMessageOn(c, t.org, {
      profileId, templateId: t.templateId, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `wo-${u()}`, payload: {},
    }));
    return { id: message.id as string, out: await M.dispatchMessage(t.org, message.id) };
  };
  async function activeJourney(t: Tn): Promise<string> {
    const key = `j-${u()}`;
    const { journey } = await J.createJourney(t.org, t.userId, {
      key, name: 'Autumn', definition: {
        trigger: { type: 'api' }, holdout_percent: 0,
        steps: [{ id: 'wa', type: 'message', channel: 'whatsapp', template: t.key, purpose: 'marketing', next: 'done' }, { id: 'done', type: 'exit' }],
      },
    });
    await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
    await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
    return key;
  }
  const conditions = async (org: string, now = new Date()) => {
    const T = thresholds.DEFAULT_THRESHOLDS;
    return rules.evaluateRules(await snapshot.takeSnapshot(org, T, now), T);
  };

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    W = await import('../../engage/whatsapp/templates.js');
    C = await import('../../engage/whatsapp/templateCheck.js');
    J = await import('../../engage/journeys/journeys.js');
    O = await import('../../engage/whatsapp/operate.js');
    A = await import('../../engage/settings/attention.js');
    snapshot = await import('../../engage/ops/snapshot.js');
    rules = await import('../../engage/ops/rules.js');
    thresholds = await import('../../engage/ops/thresholds.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    graph = await startMockGraph({ wabaId: WABA });
    process.env.ENGAGE_WHATSAPP_GRAPH_URL = graph.url;
    process.env.SEND_MODE = 'sandbox';
  });
  afterEach(async () => { await graph.stop(); delete process.env.SEND_MODE; delete process.env.ENGAGE_WHATSAPP_GRAPH_URL; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the Settings card', () => {
    it('shows the account, the webhook URL to give Meta, the check, the daily limit and the templates in use; admins only, never a secret', async () => {
      const t = await tenant();
      await activeJourney(t);
      const r = await app.http('/whatsapp/setup', { token: t.admin });
      expect(r.status).toBe(200);
      const v = r.json as unknown as import('../../engage/whatsapp/operate.js').WhatsappSetup;
      expect(v.account).toMatchObject({ id: t.account, provider: 'whatsapp_cloud', mode: 'test', phoneNumberId: String(graph.o.phoneNumberId), wabaId: WABA });
      expect(v.accountProblem).toBeNull();
      expect(v.webhook).toMatchObject({
        url: `https://api.example.com/api/engage/webhooks/${t.account}`, urlProblem: null,
        fields: ['messages', 'user_preferences', 'message_template_status_update'], lastDeliveryReportAt: null,
      });
      expect(v.check).toMatchObject({ consecutiveFailures: 0, lastError: null, templatesSeen: 1 });
      expect(v.pacing).toEqual({ limit: 250, limitIsDefault: true, contacted24h: 0, waiting: 0, waitingOverADay: 0 });
      expect(v.templatesInUse).toEqual([{ metaName: 'autumn_books', language: 'tr', journeyKeys: [t.key], recentMessages: 0, status: 'APPROVED', quality: null, rejectedReason: null }]);
      expect(v.steps).toEqual([
        { step: 'account', done: true }, { step: 'waba_id', done: true }, { step: 'webhook_url', done: true },
        { step: 'template_check', done: true }, { step: 'templates_in_use', done: true }, { step: 'sending_ready', done: true },
      ]);
      const raw = JSON.stringify(r.json);
      expect(raw).not.toContain(graph.o.accessToken);
      expect(raw).not.toContain('app-secret');
      expect((await app.http('/whatsapp/setup', { token: t.member })).status).toBe(403);
    });

    it('says what is missing: no waba_id, no public address, no account', async () => {
      const t = await tenant({ waba: false });
      const before = process.env.ENGAGE_PUBLIC_API_URL;
      delete process.env.ENGAGE_PUBLIC_API_URL;
      try {
        const v = await O.getWhatsappSetup(t.org);
        expect(v.account?.wabaId).toBeNull();
        expect(v.webhook).toMatchObject({ url: null, urlProblem: 'public_api_url_not_set' });
        expect(v.steps.filter((s) => !s.done).map((s) => s.step)).toEqual(['waba_id', 'webhook_url', 'template_check']);
        expect((await O.getWhatsappSetup(t.org, { ENGAGE_PUBLIC_API_URL: 'http://api.example.com' } as NodeJS.ProcessEnv)).webhook.urlProblem).toBe('public_api_url_invalid');
      } finally { process.env.ENGAGE_PUBLIC_API_URL = before; }
      // The check names the missing id, which the card explains.
      expect((await C.runTemplateCheck(t.org)).error).toBe('waba_missing');
      const empty = await f.provisionTenant(`WaO none ${u()}`);
      const none = await O.getWhatsappSetup(empty.organization.id);
      expect(none).toMatchObject({ account: null, accountProblem: 'no_whatsapp_account', pacing: null, templatesInUse: [] });
      expect(none.steps[0]).toEqual({ step: 'account', done: false });
    });

    it('counts the customers messaged against the account\'s own limit, and the messages waiting for room', async () => {
      const t = await tenant({ limit: 1 });
      const [a, b] = [await customer(t), await customer(t)];
      expect((await send(t, a)).out.outcome).toBe('sent');
      expect((await send(t, b)).out).toMatchObject({ outcome: 'deferred', code: 'account_pacing' });
      const v = await O.getWhatsappSetup(t.org);
      expect(v.pacing).toEqual({ limit: 1, limitIsDefault: false, contacted24h: 1, waiting: 1, waitingOverADay: 0 });
      // The template is in use by the message that was allowed, though no journey sends it.
      expect(v.templatesInUse).toEqual([expect.objectContaining({ metaName: 'autumn_books', journeyKeys: [], recentMessages: 1 })]);
      // A day later the same message is still waiting: the ops rule says so (asked at that clock; the ledgers are append-only).
      const later = new Date(Date.now() + 25 * HOUR);
      expect((await O.getWhatsappSetup(t.org, process.env, later)).pacing).toMatchObject({ waiting: 1, waitingOverADay: 1 });
      const held = (await conditions(t.org, later)).filter((c) => c.rule === 'whatsapp_pacing_holding');
      expect(held).toEqual([{ rule: 'whatsapp_pacing_holding', subject: t.account, severity: 'warning', data: expect.objectContaining({ waiting: 1, overADay: 1, limit: 1, limitIsDefault: false }) }]);
      expect((await conditions(t.org)).filter((c) => c.rule === 'whatsapp_pacing_holding')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('alerts', () => {
    it('a template an active journey uses that Meta paused needs attention at once, critical; red quality alone is a warning', async () => {
      const t = await tenant();
      await activeJourney(t);
      expect((await A.getAttention(t.org)).map((i) => i.code)).toEqual([]);
      graph.setTemplateStatus('autumn_books', 'tr', 'PAUSED');
      await C.runTemplateCheck(t.org);
      const items = await A.getAttention(t.org);
      expect(items).toEqual([expect.objectContaining({
        code: 'whatsapp_template_unhealthy', severity: 'critical',
        data: { count: 1, templates: [expect.objectContaining({ metaName: 'autumn_books', language: 'tr', status: 'PAUSED', journeys: 1 })] },
      })]);
      // The ops check turns it into an alert, and the Settings card and attention route agree.
      expect((await conditions(t.org)).map((c) => `${c.rule}:${c.severity}`)).toContain('whatsapp_template_unhealthy:critical');
      expect((await O.getWhatsappSetup(t.org)).steps.find((s) => s.step === 'templates_in_use')).toEqual({ step: 'templates_in_use', done: false });
      const r = await app.http('/settings/attention', { token: t.admin });
      expect((r.json.items as Array<{ code: string }>).map((i) => i.code)).toContain('whatsapp_template_unhealthy');

      const red = await tenant({ quality: 'RED' });
      await activeJourney(red);
      expect((await O.getWhatsappSetup(red.org)).templatesInUse[0]).toMatchObject({ status: 'APPROVED', quality: 'RED' });
      expect(await A.getAttention(red.org)).toEqual([expect.objectContaining({ code: 'whatsapp_template_unhealthy', severity: 'warning' })]);
    });

    it('a template nobody uses is not an alert, however Meta files it', async () => {
      const t = await tenant({ status: 'REJECTED' });
      expect(await A.getAttention(t.org)).toEqual([]);
      expect((await O.getWhatsappSetup(t.org)).templatesInUse).toEqual([]);
    });

    it('the template check failing three times in a row needs attention with Meta\'s code; one success clears it', async () => {
      const t = await tenant();
      for (let i = 0; i < 2; i++) {
        graph.failNext({ status: 401, code: 190 });
        expect((await C.runTemplateCheck(t.org)).error).toBe('wa_190');
      }
      expect(await A.getAttention(t.org)).toEqual([]);
      graph.failNext({ status: 401, code: 190 });
      await C.runTemplateCheck(t.org);
      expect(await A.getAttention(t.org)).toEqual([expect.objectContaining({
        code: 'whatsapp_template_check_failing', severity: 'warning', data: expect.objectContaining({ failures: 3, code: 'wa_190' }),
      })]);
      expect((await O.getWhatsappSetup(t.org)).steps.find((s) => s.step === 'template_check')!.done).toBe(false);
      expect((await C.runTemplateCheck(t.org)).ok).toBe(true);
      expect(await A.getAttention(t.org)).toEqual([]);
    });

    it('counts messages Meta held back with 131049 for the account (a share of what was sent decides the rule)', async () => {
      const t = await tenant();
      const p = await customer(t);
      graph.failNext({ status: 400, code: 131049, when: (r) => r.path.endsWith('/messages') });
      const r = await send(t, p);
      expect(r.out).toMatchObject({ outcome: 'failed' });
      const snap = await snapshot.takeSnapshot(t.org, thresholds.DEFAULT_THRESHOLDS);
      const acct = snap.accounts.find((a) => a.accountId === t.account)!;
      expect(acct.whatsapp).toMatchObject({ frequencyLimited24h: 1, pacingWaiting: 0 });
      // One message is far below the volume the rule needs.
      expect((await conditions(t.org)).filter((c) => c.rule === 'whatsapp_frequency_limited')).toEqual([]);
    });
  });
});
