/**
 * WhatsApp templates in the platform (WP-40a, migration 137, ADR-025) on real Postgres and the real HTTP stack, against the mock
 * Graph API: registering how a template is filled, the template check (Meta's listing, paging, failures), Meta's status webhook
 * (signed, idempotent, in order), and the send gate's template rules and account pacing, end to end through the dispatcher.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageWhatsappTemplates.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { signBody } from '../../engage/whatsapp/format.js';
import { startMockGraph, templateStatusPayload, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

const APP_SECRET = 'app-secret-for-template-tests';
const WABA = '102290129340398';

describe.skipIf(!adminUrl)('WhatsApp templates (real Postgres, HTTP, mock Graph API)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let W: typeof import('../../engage/whatsapp/templates.js');
  let C: typeof import('../../engage/whatsapp/templateCheck.js');
  let graph: MockGraph;
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905001${n++}`; })();

  interface Tn { org: string; userId: string; account: string; adminToken: string; memberToken: string }
  async function tenant(o: { waba?: string | null; limit?: number } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`WaT ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, sender_name = 'Kitap Evi', frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'whatsapp', 1_000_000, 'TRY');
    const waba = o.waba === undefined ? WABA : o.waba;
    const account = (await creds.createAccount(org, t.admin.userId, {
      channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`,
      config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr', ...(waba ? { waba_id: waba } : {}), ...(o.limit ? { daily_recipient_limit: o.limit } : {}) },
      secrets: { access_token: graph.o.accessToken, app_secret: APP_SECRET, verify_token: 'v' },
    })).id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, account, adminToken: token(t.admin.authUserId, org), memberToken: token(member, org) };
  }
  async function customer(t: Tn, attributes: Record<string, unknown> = { first_name: 'Ayşe' }, consent = true) {
    const phone = phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `wt-${u()}`, phone, attributes });
    if (consent) await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { test: 'wp40a' }, recordedAt: new Date(Date.now() - 60_000) });
    await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    return { id: p.id, phone };
  }
  const cartContent = (over: Record<string, unknown> = {}) => ({
    metaName: 'cart_reminder', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply',
    bodyText: 'Merhaba {{1}}, sepetinde {{2}} seni bekliyor.',
    variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }, { source: 'payload', name: 'book' }],
    ...over,
  });
  /** The approved template at Meta that cartContent fills. */
  const approveCart = (over: Partial<Parameters<MockGraph['setTemplate']>[0]> = {}) => graph.setTemplate({
    name: 'cart_reminder', language: 'tr', status: 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, sepetinde {{2}} seni bekliyor.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }], ...over,
  });
  const register = async (t: Tn, content: Record<string, unknown> = cartContent(), key = `cart-${u()}`) =>
    app.http('/templates', { token: t.adminToken, body: { channel: 'whatsapp', key, name: 'Cart reminder', content } });
  const send = async (t: Tn, templateId: string, profileId: string, purpose: 'marketing' | 'transactional' = 'marketing', payload: Record<string, unknown> = { book: 'Kürk Mantolu Madonna' }) => {
    const { message } = await f.engage.withEngageTenant(t.org, (c) => W.createWhatsappTemplatedMessageOn(c, t.org, {
      profileId, templateId, purpose, channelAccountId: t.account, idempotencyKey: `wt-${u()}`, payload,
    }));
    return { message, out: await M.dispatchMessage(t.org, message.id) };
  };
  const reasons = async (t: Tn, messageId: string) => (await sql(t.org, `SELECT code, reasons FROM engage.send_decisions WHERE message_id = $1 ORDER BY id DESC LIMIT 1`, [messageId])).rows[0] as { code: string; reasons: Array<{ code: string }> };
  const postWebhook = async (accountId: string, payload: unknown, secret = APP_SECRET) => {
    const body = JSON.stringify(payload);
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signBody(secret, body) }, body });
    return { status: r.status, json: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  const mirror = async (t: Tn) => (await sql(t.org, `SELECT meta_name, language, status, category, quality, source FROM engage.whatsapp_template_status ORDER BY meta_name, language`)).rows;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    W = await import('../../engage/whatsapp/templates.js');
    C = await import('../../engage/whatsapp/templateCheck.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    logs.length = 0;
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
  describe('registering a template', () => {
    it('admins register how a Meta template is filled; it lists with its channel and a health that says Meta has not been asked yet', async () => {
      const t = await tenant();
      const r = await register(t);
      expect(r.status).toBe(201);
      const id = (r.json.template as { id: string }).id;
      expect(r.json).toMatchObject({ template: { channel: 'whatsapp', latestVersion: 1 }, health: { sendable: false, problems: ['status_unknown'], category: 'marketing' } });
      const list = await app.http('/templates', { token: t.memberToken });
      expect(list.json.templates).toEqual([expect.objectContaining({ id, channel: 'whatsapp', latestVersion: 1 })]);
      const got = await app.http(`/templates/${id}`, { token: t.memberToken });
      expect(got.json).toMatchObject({ whatsappVersions: [{ version: 1, content: { metaName: 'cart_reminder', variables: [{ position: 1 }, { position: 2 }] } }] });
    });
    it('a new version is WhatsApp content too, and a member can neither create nor version', async () => {
      const t = await tenant();
      const id = ((await register(t)).json.template as { id: string }).id;
      const v2 = await app.http(`/templates/${id}/versions`, { token: t.adminToken, body: { content: cartContent({ optOut: 'text_in_body' }) } });
      expect(v2.status).toBe(201);
      expect(v2.json).toMatchObject({ version: { version: 2, content: { optOut: 'text_in_body' } } });
      // An email version on a WhatsApp template is not a thing: the route takes the template's own channel.
      expect((await app.http(`/templates/${id}/versions`, { token: t.adminToken, body: { subject: 's', html: '<p>x</p>' } })).status).toBe(400);
      expect((await app.http('/templates', { token: t.memberToken, body: { channel: 'whatsapp', key: `m-${u()}`, name: 'm', content: cartContent() } })).status).toBe(403);
      expect((await app.http(`/templates/${id}/versions`, { token: t.memberToken, body: { content: cartContent() } })).status).toBe(403);
    });
    it('refuses a mapping that does not fit the body, with the reason', async () => {
      const t = await tenant();
      const r = await register(t, cartContent({ variables: [{ source: 'attribute', name: 'first_name' }] }));
      expect(r.status).toBe(400);
      expect(String(r.json.error)).toMatch(/^variable_count_mismatch/);
      expect((await register(t, cartContent({ bodyText: 'Hi {{name}}', variables: [] }))).json.error).toMatch(/^named_parameters_unsupported/);
    });
    it('previews with a real customer, filling each value as the message would', async () => {
      const t = await tenant();
      const id = ((await register(t)).json.template as { id: string }).id;
      const c = await customer(t, { first_name: 'Ayşe\nNur' });
      const p = await app.http(`/templates/${id}/preview`, { token: t.memberToken, body: { profileId: c.id, payload: { book: 'Tutunamayanlar' } } });
      expect(p.json).toMatchObject({ body: 'Merhaba Ayşe Nur, sepetinde Tutunamayanlar seni bekliyor.', errors: [] });
      const missing = await app.http(`/templates/${id}/preview`, { token: t.memberToken, body: { attributes: {} } });
      expect(missing.json).toMatchObject({ body: null, errors: [{ code: 'missing_variable', variable: 'payload.book' }] });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the template check', () => {
    it('reads every page of Meta\'s listing into the mirror, and shows which are registered and which registrations Meta does not know', async () => {
      const t = await tenant();
      graph.pageSize = 2;
      approveCart();
      graph.setTemplate({ name: 'order_shipped', language: 'tr', status: 'APPROVED', category: 'UTILITY', bodyText: 'Siparişin {{1}} yolda.' });
      graph.setTemplate({ name: 'spring_sale', language: 'en_US', status: 'REJECTED', category: 'MARKETING', bodyText: 'Sale!', rejectedReason: 'PROMOTIONAL' });
      await register(t);
      await register(t, cartContent({ metaName: 'not_at_meta' }));
      const check = await app.http('/whatsapp/templates/check', { token: t.adminToken, body: {} });
      expect(check.json).toMatchObject({ ok: true, seen: 3, changed: 3, error: null, state: { consecutiveFailures: 0, templatesSeen: 3 } });
      expect(graph.requests.filter((r) => r.path.endsWith('/message_templates'))).toHaveLength(2);
      const view = await app.http('/whatsapp/templates', { token: t.memberToken });
      expect(view.json.templates).toEqual([
        expect.objectContaining({ metaName: 'cart_reminder', status: 'APPROVED', category: 'MARKETING', registeredAs: [expect.objectContaining({ key: expect.any(String) })] }),
        expect.objectContaining({ metaName: 'order_shipped', status: 'APPROVED', category: 'UTILITY', registeredAs: [] }),
        expect.objectContaining({ metaName: 'spring_sale', language: 'en_US', status: 'REJECTED', rejectedReason: 'PROMOTIONAL' }),
      ]);
      expect(view.json.unmatched).toEqual([expect.objectContaining({ metaName: 'not_at_meta' })]);
      expect((await app.http('/whatsapp/templates/check', { token: t.memberToken, body: {} })).status).toBe(403);
    });
    it('records changes as events, marks a template Meta no longer lists as deleted, and changes nothing on a failed check', async () => {
      const t = await tenant();
      approveCart();
      graph.setTemplate({ name: 'order_shipped', language: 'tr', status: 'APPROVED', category: 'UTILITY', bodyText: 'x' });
      await C.runTemplateCheck(t.org);
      graph.setTemplateStatus('cart_reminder', 'tr', 'PAUSED');
      graph.templates.delete('order_shipped|tr');
      const second = await C.runTemplateCheck(t.org);
      expect(second).toMatchObject({ ok: true, seen: 1, changed: 2 });
      expect(await mirror(t)).toEqual([
        expect.objectContaining({ meta_name: 'cart_reminder', status: 'PAUSED' }),
        expect.objectContaining({ meta_name: 'order_shipped', status: 'DELETED' }),
      ]);
      const events = (await sql(t.org, `SELECT event, meta_name FROM engage.whatsapp_template_events ORDER BY id`)).rows.map((r) => `${r.meta_name}:${r.event}`);
      expect(events).toEqual(['cart_reminder:SYNC_APPROVED', 'order_shipped:SYNC_APPROVED', 'cart_reminder:SYNC_PAUSED', 'order_shipped:SYNC_DELETED']);
      // A token Meta refuses: the code is recorded, the failures counted, and the mirror is left as it was.
      graph.failNext({ status: 401, code: 190 });
      graph.failNext({ status: 401, code: 190 });
      await C.runTemplateCheck(t.org);
      const third = await C.runTemplateCheck(t.org);
      expect(third).toMatchObject({ ok: false, error: 'wa_190', state: { consecutiveFailures: 2, lastError: 'wa_190' } });
      expect((await mirror(t)).map((r) => r.status)).toEqual(['PAUSED', 'DELETED']);
      expect(logs.join('\n')).not.toContain(graph.o.accessToken);
    });
    it('needs the WhatsApp Business Account id, and the hourly run picks only tenants that have one and are due', async () => {
      const without = await tenant({ waba: null });
      expect(await C.runTemplateCheck(without.org)).toMatchObject({ ok: false, error: 'waba_missing' });
      const a = await tenant();
      const b = await tenant();
      approveCart();
      const s = await C.runDueTemplateChecks({ onlyOrganizations: [without.org, a.org, b.org] });
      expect(s).toEqual({ due: 2, ok: 2, failed: 0 });
      // Both ran just now, so neither is due again within the hour.
      expect(await C.runDueTemplateChecks({ onlyOrganizations: [a.org, b.org] })).toEqual({ due: 0, ok: 0, failed: 0 });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('Meta\'s status webhook', () => {
    it('applies a signed change once, ignores one older than the mirror, and refuses a forged one', async () => {
      const t = await tenant();
      approveCart();
      await C.runTemplateCheck(t.org);
      const at = Date.now() + 5_000;
      const paused = templateStatusPayload({ wabaId: WABA, id: graph.templates.get('cart_reminder|tr')!.id, name: 'cart_reminder', language: 'tr', event: 'PAUSED', at });
      expect((await postWebhook(t.account, paused)).json).toMatchObject({ templates: { applied: 1, ignored: 0, duplicates: 0 } });
      expect((await postWebhook(t.account, paused)).json).toMatchObject({ templates: { applied: 0, duplicates: 1 } });
      const older = templateStatusPayload({ wabaId: WABA, id: '1', name: 'cart_reminder', language: 'tr', event: 'APPROVED', at: at - 60_000 });
      expect((await postWebhook(t.account, older)).json).toMatchObject({ templates: { applied: 0, ignored: 1 } });
      expect((await mirror(t))[0]).toMatchObject({ status: 'PAUSED', source: 'webhook' });
      const reinstated = templateStatusPayload({ wabaId: WABA, id: '1', name: 'cart_reminder', language: 'tr', event: 'REINSTATED', at: at + 60_000 });
      await postWebhook(t.account, reinstated);
      expect((await mirror(t))[0]).toMatchObject({ status: 'APPROVED' });
      expect((await postWebhook(t.account, paused, 'not-the-secret')).status).toBe(401);
    });
    it('creates the row for a template it has not seen, normalizes the language, and ignores another WhatsApp Business Account', async () => {
      const t = await tenant();
      await postWebhook(t.account, templateStatusPayload({ wabaId: WABA, id: '77', name: 'welcome', language: 'en_US', event: 'APPROVED', category: 'UTILITY' }));
      await postWebhook(t.account, templateStatusPayload({ wabaId: '999999999', id: '78', name: 'other', language: 'tr', event: 'APPROVED' }));
      expect(await mirror(t)).toEqual([expect.objectContaining({ meta_name: 'welcome', language: 'en_US', status: 'APPROVED', category: 'UTILITY' })]);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the send gate', () => {
    async function ready(o: { content?: Record<string, unknown>; at?: Parameters<MockGraph['setTemplate']>[0]; check?: boolean } = {}) {
      const t = await tenant();
      graph.setTemplate(o.at ?? { name: 'cart_reminder', language: 'tr', status: 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, sepetinde {{2}} seni bekliyor.', buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }] });
      if (o.check !== false) await C.runTemplateCheck(t.org);
      const id = ((await register(t, o.content ?? cartContent())).json.template as { id: string }).id;
      return { t, id };
    }
    it('sends an approved template whose values fit, with header and URL button values', async () => {
      const { t, id } = await ready({
        content: cartContent({
          header: { text: 'Sepetin, {{1}}', variable: { source: 'system', name: 'sender_name' } },
          urlButton: { baseUrl: 'https://shop.example.com/cart/', variable: { source: 'payload', name: 'cart_id' } },
        }),
        at: {
          name: 'cart_reminder', language: 'tr', status: 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, sepetinde {{2}} seni bekliyor.',
          header: { format: 'TEXT', text: 'Sepetin, {{1}}' }, buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }, { type: 'URL', text: 'Aç', url: 'https://shop.example.com/cart/{{1}}' }],
        },
      });
      const c = await customer(t);
      const { out } = await send(t, id, c.id, 'marketing', { book: 'Saatleri Ayarlama Enstitüsü', cart_id: 'c 42' });
      expect(out.outcome).toBe('sent');
      expect(graph.sent[0]).toMatchObject({ template: 'cart_reminder', language: 'tr', params: ['Ayşe', 'Saatleri Ayarlama Enstitüsü'] });
      const comps = ((graph.requests.at(-1)!.body as Record<string, unknown>).template as { components: unknown[] }).components;
      expect(comps).toEqual([
        { type: 'header', parameters: [{ type: 'text', text: 'Kitap Evi' }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Ayşe' }, { type: 'text', text: 'Saatleri Ayarlama Enstitüsü' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'c%2042' }] },
      ]);
    });
    it('blocks a template Meta has paused, before asking Meta', async () => {
      const { t, id } = await ready();
      graph.setTemplateStatus('cart_reminder', 'tr', 'PAUSED');
      await C.runTemplateCheck(t.org);
      const before = graph.requests.length;
      const { message, out } = await send(t, id, (await customer(t)).id);
      expect(out).toEqual({ outcome: 'blocked', code: 'template_not_approved' });
      expect((await reasons(t, message.id)).reasons).toEqual([expect.objectContaining({ code: 'template_not_approved', status: 'PAUSED' })]);
      expect(graph.requests.length).toBe(before);
    });
    it('never sends a marketing template as transactional (that would skip consent)', async () => {
      const { t, id } = await ready({ content: cartContent({ declaredCategory: 'utility' }) });
      const noConsent = await customer(t, { first_name: 'Ali' }, false);
      const { out } = await send(t, id, noConsent.id, 'transactional');
      expect(out).toEqual({ outcome: 'blocked', code: 'template_category_mismatch' });
    });
    it('sends a utility template as transactional without marketing consent', async () => {
      const { t, id } = await ready({
        content: cartContent({ metaName: 'order_shipped', declaredCategory: 'utility', optOut: 'none', bodyText: 'Siparişin {{1}} yolda.', variables: [{ source: 'payload', name: 'order_no' }] }),
        at: { name: 'order_shipped', language: 'tr', status: 'APPROVED', category: 'UTILITY', bodyText: 'Siparişin {{1}} yolda.' },
      });
      const { out } = await send(t, id, (await customer(t, {}, false)).id, 'transactional', { order_no: 'KY-1001' });
      expect(out.outcome).toBe('sent');
    });
    it('blocks values that do not fit the template Meta approved, without asking Meta', async () => {
      const { t, id } = await ready({ at: { name: 'cart_reminder', language: 'tr', status: 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, {{2}} ve {{3}}.' } });
      const before = graph.requests.length;
      const { message, out } = await send(t, id, (await customer(t)).id);
      expect(out).toEqual({ outcome: 'blocked', code: 'template_mapping_mismatch' });
      expect((await reasons(t, message.id)).reasons[0]).toMatchObject({ problems: ['body_variable_count'] });
      expect(graph.requests.length).toBe(before);
    });
    it('blocks marketing from a template with no way to stop, and a message whose values could not be filled', async () => {
      const { t, id } = await ready({ content: cartContent({ optOut: 'none' }) });
      expect((await send(t, id, (await customer(t)).id)).out).toEqual({ outcome: 'blocked', code: 'content_no_opt_out' });
      const { t: t2, id: id2 } = await ready();
      expect((await send(t2, id2, (await customer(t2)).id, 'marketing', {})).out).toEqual({ outcome: 'blocked', code: 'render_missing_variable' });
    });
    it('in live mode, refuses a template Meta has never confirmed; in sandbox it may go out (a test number\'s sample template)', async () => {
      const { t, id } = await ready({ check: false });
      const c = await customer(t);
      expect((await send(t, id, c.id)).out.outcome).toBe('sent');
      process.env.SEND_MODE = 'live';
      const { message } = await f.engage.withEngageTenant(t.org, (cl) => W.createWhatsappTemplatedMessageOn(cl, t.org, {
        profileId: c.id, templateId: id, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `live-${u()}`, payload: { book: 'x' },
      }));
      const g = await M.evaluateGate(t.org, message.id);
      expect(g.kind).toBe('deny');
      expect((await reasons(t, message.id)).reasons.map((r) => r.code)).toContain('template_status_unknown');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('account pacing', () => {
    it('defers a new customer beyond the account\'s daily limit until the window frees, and still lets an already-messaged customer through', async () => {
      const t = await tenant({ limit: 2 });
      approveCart();
      await C.runTemplateCheck(t.org);
      const id = ((await register(t)).json.template as { id: string }).id;
      const [a, b, c] = [await customer(t), await customer(t), await customer(t)];
      expect((await send(t, id, a.id)).out.outcome).toBe('sent');
      expect((await send(t, id, b.id)).out.outcome).toBe('sent');
      const third = await send(t, id, c.id);
      expect(third.out).toMatchObject({ outcome: 'deferred', code: 'account_pacing' });
      const retryAt = (third.out as { retryAt: Date }).retryAt.getTime();
      expect(retryAt).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      expect((await reasons(t, third.message.id)).reasons).toEqual([expect.objectContaining({ code: 'account_pacing', recent: 2, limit: 2 })]);
      // A second message to a customer already in the window does not count as a new one.
      const again = await send(t, id, a.id);
      expect(again.out, JSON.stringify(again.out)).toMatchObject({ outcome: 'sent' });
      // At the retry time the first two have left the window, and the waiting message is allowed. (The gate is asked at that
      // clock: the allowed times themselves are frozen with the cost reservation and cannot be moved back.)
      const later = await M.evaluateGate(t.org, third.message.id, { now: new Date(retryAt + 1_000) });
      expect(later, JSON.stringify(later)).toMatchObject({ kind: 'allow' });
    });
    it('refuses at once, with the reason, a message that would expire before the account has room', async () => {
      const t = await tenant({ limit: 1 });
      approveCart();
      await C.runTemplateCheck(t.org);
      const id = ((await register(t)).json.template as { id: string }).id;
      expect((await send(t, id, (await customer(t)).id)).out.outcome).toBe('sent');
      const c = await customer(t);
      const { message } = await f.engage.withEngageTenant(t.org, (cl) => W.createWhatsappTemplatedMessageOn(cl, t.org, {
        profileId: c.id, templateId: id, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `short-${u()}`, payload: { book: 'x' }, ttlSeconds: 3600,
      }));
      expect(await M.dispatchMessage(t.org, message.id)).toEqual({ outcome: 'blocked', code: 'account_limit_reached' });
      expect((await reasons(t, message.id)).reasons).toEqual([expect.objectContaining({ code: 'account_limit_reached', recent: 1, limit: 1 })]);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('other tenants', () => {
    it('never see or change another tenant\'s templates, statuses or checks', async () => {
      const a = await tenant();
      const b = await tenant();
      approveCart();
      await C.runTemplateCheck(a.org);
      const id = ((await register(a)).json.template as { id: string }).id;
      expect((await app.http(`/templates/${id}`, { token: b.adminToken })).status).toBe(404);
      expect((await app.http(`/templates/${id}/versions`, { token: b.adminToken, body: { content: cartContent() } })).status).toBe(404);
      expect((await app.http('/whatsapp/templates', { token: b.adminToken })).json).toMatchObject({ templates: [], unmatched: [], check: { lastAttemptAt: null } });
      // A's webhook URL cannot write into B, and B's statuses are empty whatever A receives.
      await postWebhook(a.account, templateStatusPayload({ wabaId: WABA, id: '1', name: 'cart_reminder', language: 'tr', event: 'PAUSED', at: Date.now() + 10_000 }));
      expect(await mirror(b)).toEqual([]);
      expect(await mirror(a)).toEqual([expect.objectContaining({ status: 'PAUSED' })]);
    });
  });
});
