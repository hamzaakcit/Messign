/**
 * WhatsApp (migration 135, WP-27, ADR-023) on real Postgres and the real HTTP stack, against the mock Graph API. Acceptance:
 * a marketing template to a customer without WhatsApp consent is blocked by the real send gate, and sent with it. Also:
 * Meta's webhook handshake and signature on the server's own body parser, delivery statuses, the two ways Meta tells us a
 * customer stopped marketing (error 131050 and the user_preferences webhook), a STOP reply, retries, other tenants.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageWhatsapp.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';
import { signBody } from '../../engage/whatsapp/format.js';
import { preferencePayload, startMockGraph, statusPayload, textPayload, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

const APP_SECRET = 'app-secret-for-tests';
const VERIFY = 'verify-token-for-tests';

describe.skipIf(!adminUrl)('WhatsApp channel (real Postgres, HTTP, mock Graph API)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let graph: MockGraph;
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();

  interface Tn { org: string; userId: string; account: string }
  async function tenant(o: { sandboxReady?: boolean } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Wa ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    if (o.sandboxReady !== false) {
      for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, 'whatsapp', 1_000_000, 'TRY');
    }
    const account = (await creds.createAccount(org, t.admin.userId, {
      channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`,
      config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr' },
      secrets: { access_token: graph.o.accessToken, app_secret: APP_SECRET, verify_token: VERIFY },
    })).id;
    return { org, userId: t.admin.userId, account };
  }
  /** A customer with a phone number on the sandbox allow-list, and WhatsApp consent unless said otherwise. */
  async function customer(t: Tn, o: { phone?: string; consent?: Array<'whatsapp' | 'email' | 'sms'> } = {}) {
    const phone = o.phone ?? phoneN();
    const email = `${u()}@example.com`;
    const p = await P.upsertProfile(t.org, { externalId: `w-${u()}`, email, phone });
    // Consent was given before the customer wrote STOP: a minute ago (Meta's timestamps have one-second resolution, and the consent state keeps the newest decision).
    for (const ch of o.consent ?? ['whatsapp']) await P.recordConsent(t.org, p.id, { channel: ch, status: 'granted', source: 'api', evidence: { test: 'wp27' }, recordedAt: new Date(Date.now() - 60_000) });
    await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    return { id: p.id, phone, email };
  }
  const message = async (t: Tn, profileId: string, content: Record<string, unknown> = { template: 'cart_reminder', body_parameters: ['Ayşe', 'Kitapyurdu'] }, purpose: 'marketing' | 'transactional' = 'marketing') =>
    (await M.createMessage(t.org, { profileId, channel: 'whatsapp', purpose, channelAccountId: t.account, idempotencyKey: `k-${u()}`, content })).message;
  const state = async (t: Tn, profileId: string, channel = 'whatsapp') => (await sql(t.org, `SELECT status FROM engage.consent_state WHERE profile_id = $1 AND channel = $2`, [profileId, channel])).rows[0]?.status as string | undefined;
  const ledger = async (t: Tn, profileId: string) => (await sql(t.org, `SELECT channel, status, source, evidence FROM engage.consents WHERE profile_id = $1 AND channel = 'whatsapp' ORDER BY recorded_at, id`, [profileId])).rows;
  const inboundRows = async (t: Tn) => (await sql(t.org, `SELECT * FROM engage.inbound_events WHERE organization_id = $1 ORDER BY received_at, id`, [t.org])).rows;

  const post = async (accountId: string, payload: unknown, o: { secret?: string; headers?: Record<string, string>; raw?: string } = {}) => {
    const body = o.raw ?? JSON.stringify(payload);
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signBody(o.secret ?? APP_SECRET, body), ...(o.headers ?? {}) },
      body,
    });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const handshake = async (accountId: string, query: Record<string, string>) => {
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}?${new URLSearchParams(query)}`);
    return { status: r.status, text: await r.text(), type: r.headers.get('content-type') };
  };
  const status = (p: Partial<Parameters<typeof statusPayload>[0]> & { id: string; status: Parameters<typeof statusPayload>[0]['status']; to: string }) => statusPayload({ phoneNumberId: graph.o.phoneNumberId, ...p });
  const text = (from: string | null, body: string, id = `wamid.${u()}`) => textPayload({ phoneNumberId: graph.o.phoneNumberId, from, text: body, id });

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
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    logs.length = 0;
    graph = await startMockGraph();
    graph.approveTemplate('cart_reminder', 'tr', 2);
    graph.approveTemplate('order_shipped', 'tr', 0);
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
  describe('acceptance: a marketing template needs WhatsApp consent', () => {
    it('is blocked by the real send gate for a customer who consented to email and SMS but not WhatsApp, and goes out with WhatsApp consent', async () => {
      const t = await tenant();
      const noWa = await customer(t, { consent: ['email', 'sms'] });
      const blocked = await message(t, noWa.id);
      expect(await M.dispatchMessage(t.org, blocked.id)).toEqual({ outcome: 'blocked', code: 'no_consent' });
      expect(graph.requests).toHaveLength(0);

      const yes = await customer(t, { consent: ['whatsapp'] });
      const ok = await message(t, yes.id);
      const out = await M.dispatchMessage(t.org, ok.id);
      expect(out.outcome).toBe('sent');
      expect(graph.sent).toHaveLength(1);
      expect(graph.sent[0]).toMatchObject({ template: 'cart_reminder', language: 'tr', params: ['Ayşe', 'Kitapyurdu'], to: yes.phone.slice(1) });
      expect((await M.getMessage(t.org, ok.id)).message).toMatchObject({ status: 'sent', providerMessageId: graph.sent[0]!.id });
    });
    it('also blocks a marketing message with no template, or with a template name WhatsApp could not have', async () => {
      const t = await tenant();
      const c = await customer(t);
      const noTemplate = await message(t, c.id, { text: 'Merhaba, indirim var!' });
      expect(await M.dispatchMessage(t.org, noTemplate.id)).toMatchObject({ outcome: 'blocked', code: 'content_no_template' });
      const badName = await message(t, c.id, { template: 'Cart Reminder' });
      expect(await M.dispatchMessage(t.org, badName.id)).toMatchObject({ outcome: 'blocked', code: 'content_template_invalid' });
      expect(graph.requests).toHaveLength(0);
    });
    it('sends a transactional template without marketing consent, as it does for email', async () => {
      const t = await tenant();
      const c = await customer(t, { consent: [] });
      const m = await message(t, c.id, { template: 'order_shipped' }, 'transactional');
      expect((await M.dispatchMessage(t.org, m.id)).outcome).toBe('sent');
    });
    it('never reaches Meta when the template Meta has not approved is named: a final failure with Meta\'s code', async () => {
      const t = await tenant();
      const c = await customer(t);
      const m = await message(t, c.id, { template: 'not_approved_yet' });
      expect(await M.dispatchMessage(t.org, m.id)).toEqual({ outcome: 'failed', code: 'wa_132001' });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the webhook handshake', () => {
    it('answers Meta\'s GET with the challenge as plain text when the verify token is the account\'s', async () => {
      const t = await tenant();
      const r = await handshake(t.account, { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444' });
      expect(r).toMatchObject({ status: 200, text: '1158201444' });
      expect(r.type).toMatch(/^text\/plain/);
    });
    it('refuses a wrong token, a wrong mode, a challenge that is not a token, and an account that has no handshake', async () => {
      const t = await tenant();
      const q = { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '123' };
      expect((await handshake(t.account, { ...q, 'hub.verify_token': 'nope' })).status).toBe(403);
      expect((await handshake(t.account, { ...q, 'hub.mode': 'unsubscribe' })).status).toBe(403);
      expect((await handshake(t.account, { ...q, 'hub.challenge': '<script>alert(1)</script>' })).status).toBe(403);
      expect((await handshake(t.account, { 'hub.mode': 'subscribe' })).status).toBe(403);
      const mockAccount = (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: 'w' } })).id;
      expect((await handshake(mockAccount, q)).status).toBe(403);
    });
    it('is a plain 404 for an unknown, malformed or disabled account', async () => {
      const t = await tenant();
      const q = { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '123' };
      expect((await handshake(randomUUID(), q)).status).toBe(404);
      expect((await handshake('not-a-uuid', q)).status).toBe(404);
      await creds.disableAccount(t.org, t.account);
      expect((await handshake(t.account, q)).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('delivery statuses', () => {
    const sentMessage = async (t: Tn) => {
      const c = await customer(t);
      const m = await message(t, c.id);
      await M.dispatchMessage(t.org, m.id);
      return { c, m, wamid: graph.sent.at(-1)!.id };
    };
    it('applies signed sent, delivered and read reports sent as application/json, and a retry of the same delivery is a duplicate', async () => {
      const t = await tenant();
      const { c, m, wamid } = await sentMessage(t);
      const delivered = status({ id: wamid, status: 'delivered', to: c.phone });
      expect(await post(t.account, delivered)).toMatchObject({ status: 200, json: { received: 1, applied: 1, duplicates: 0 } });
      expect((await M.getMessage(t.org, m.id)).message.status).toBe('delivered');
      expect(await post(t.account, delivered)).toMatchObject({ status: 200, json: { duplicates: 1, applied: 0 } });
      // "read" arrives as a delivery too; the message is already delivered, so it is recorded and changes nothing.
      expect(await post(t.account, status({ id: wamid, status: 'read', to: c.phone }))).toMatchObject({ status: 200, json: { received: 1, ignored: 1 } });
      expect((await M.getMessage(t.org, m.id)).message.status).toBe('delivered');
    });
    it('treats a read report that arrives alone as delivered (Meta leaves out "delivered" when a message is read at once)', async () => {
      const t = await tenant();
      const { c, m, wamid } = await sentMessage(t);
      expect(await post(t.account, status({ id: wamid, status: 'read', to: c.phone }))).toMatchObject({ status: 200, json: { applied: 1 } });
      expect((await M.getMessage(t.org, m.id)).message.status).toBe('delivered');
    });
    it('applies a failed report with Meta\'s code', async () => {
      const t = await tenant();
      const { c, m, wamid } = await sentMessage(t);
      await post(t.account, status({ id: wamid, status: 'failed', to: c.phone, errorCode: 131026 }));
      const msg = (await M.getMessage(t.org, m.id));
      expect(msg.message.status).toBe('failed');
      expect(msg.events.some((e) => e.errorCode === 'wa_131026')).toBe(true);
    });
    it('refuses a missing, wrong or forged signature, and a body changed after signing, and applies nothing', async () => {
      const t = await tenant();
      const { c, m, wamid } = await sentMessage(t);
      const body = JSON.stringify(status({ id: wamid, status: 'delivered', to: c.phone }));
      expect((await post(t.account, null, { raw: body, secret: 'wrong' })).status).toBe(401);
      expect((await post(t.account, null, { raw: body, headers: { 'x-hub-signature-256': '' } })).status).toBe(401);
      expect((await post(t.account, null, { raw: body.replace('delivered', 'failed ') , headers: { 'x-hub-signature-256': signBody(APP_SECRET, body) } })).status).toBe(401);
      expect((await M.getMessage(t.org, m.id)).message.status).toBe('sent');
    });
    it('is a 400 for a signed delivery that is not a WhatsApp delivery, and ignores a delivery for another business number', async () => {
      const t = await tenant();
      expect((await post(t.account, { object: 'page', entry: [] })).status).toBe(400);
      expect(await post(t.account, statusPayload({ phoneNumberId: '999999999999', id: 'wamid.X', status: 'sent', to: phoneN() }))).toMatchObject({ status: 200, json: { received: 0 } });
    });
    it('asks Meta to retry (503) for a report about a message not recorded yet, like every provider', async () => {
      const t = await tenant();
      expect(await post(t.account, status({ id: 'wamid.unknown', status: 'delivered', to: phoneN() }))).toMatchObject({ status: 503, json: { unmatched: 1 } });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('when the customer stops marketing messages in WhatsApp (131050)', () => {
    it('Meta refuses the send: the message fails for good and WhatsApp consent is revoked, so the next marketing message is blocked', async () => {
      const t = await tenant();
      const c = await customer(t);
      graph.stopMarketing(c.phone);
      const first = await message(t, c.id);
      expect(await M.dispatchMessage(t.org, first.id)).toEqual({ outcome: 'failed', code: 'wa_131050' });
      expect(await state(t, c.id)).toBe('revoked');
      expect(await ledger(t, c.id)).toMatchObject([{ status: 'granted' }, { status: 'revoked', source: 'stop_keyword', evidence: { via: 'wa_131050' } }]);
      const next = await message(t, c.id);
      expect(await M.dispatchMessage(t.org, next.id)).toMatchObject({ outcome: 'blocked' });
      expect(graph.sent).toHaveLength(0);
    });
    it('Meta reports it afterwards in a failed status: the same, once, whatever the retries', async () => {
      const t = await tenant();
      const c = await customer(t);
      const m = await message(t, c.id);
      await M.dispatchMessage(t.org, m.id);
      const wamid = graph.sent[0]!.id;
      const failed = status({ id: wamid, status: 'failed', to: c.phone, errorCode: 131050 });
      expect(await post(t.account, failed)).toMatchObject({ status: 200, json: { applied: 1 } });
      expect(await state(t, c.id)).toBe('revoked');
      expect(await post(t.account, failed)).toMatchObject({ status: 200, json: { duplicates: 1 } });
      expect((await ledger(t, c.id)).filter((r) => r.status === 'revoked')).toHaveLength(1);
    });
    it('does not touch the customer\'s email or SMS consent', async () => {
      const t = await tenant();
      const c = await customer(t, { consent: ['whatsapp', 'email', 'sms'] });
      graph.stopMarketing(c.phone);
      await M.dispatchMessage(t.org, (await message(t, c.id)).id);
      expect(await state(t, c.id, 'whatsapp')).toBe('revoked');
      expect(await state(t, c.id, 'email')).toBe('granted');
      expect(await state(t, c.id, 'sms')).toBe('granted');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('what customers send', () => {
    it('a STOP reply revokes WhatsApp consent at once, suppresses the number for WhatsApp, and records only that it happened', async () => {
      const t = await tenant();
      const c = await customer(t, { consent: ['whatsapp', 'email'] });
      expect(await post(t.account, text(c.phone, 'STOP'))).toMatchObject({ status: 200, json: { inbound: { received: 1, optedOut: 1 } } });
      expect(await state(t, c.id)).toBe('revoked');
      expect(await state(t, c.id, 'email')).toBe('granted');
      expect(await ledger(t, c.id)).toMatchObject([{ status: 'granted' }, { status: 'revoked', source: 'stop_keyword', evidence: { via: 'whatsapp_stop_message' } }]);
      expect(Number((await sql(t.org, `SELECT count(*) AS n FROM engage.suppressions WHERE channel = 'whatsapp' AND value_normalized = $1`, [c.phone])).rows[0]!.n)).toBe(1);
      // The next marketing message is blocked by the gate, and so is a transactional one to a suppressed number.
      expect(await M.dispatchMessage(t.org, (await message(t, c.id)).id)).toMatchObject({ outcome: 'blocked' });
      expect(await M.dispatchMessage(t.org, (await message(t, c.id, { template: 'order_shipped' }, 'transactional')).id)).toMatchObject({ outcome: 'blocked', code: 'suppressed' });
      const rows = await inboundRows(t);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ provider: 'whatsapp_cloud', channel: 'whatsapp', kind: 'text', outcome: 'opt_out_applied', profile_id: c.id });
      expect(JSON.stringify(rows)).not.toMatch(/STOP|905000/);
    });
    it('understands the words Turkish customers use, as a typed message or a quick-reply button', async () => {
      const t = await tenant();
      for (const word of ['iptal', 'Durdur', 'VAZGEÇ', 'Abonelikten çık']) {
        const c = await customer(t);
        await post(t.account, text(c.phone, word));
        expect(await state(t, c.id), word).toBe('revoked');
      }
      const c = await customer(t);
      await post(t.account, textPayload({ phoneNumberId: graph.o.phoneNumberId, from: c.phone, text: 'Durdur', id: `wamid.${u()}`, type: 'button' }));
      expect(await state(t, c.id)).toBe('revoked');
    });
    it('a retry of the same message (Meta retries for days) changes nothing the second time', async () => {
      const t = await tenant();
      const c = await customer(t);
      const stop = text(c.phone, 'STOP', 'wamid.STOP-1');
      await post(t.account, stop);
      expect(await post(t.account, stop)).toMatchObject({ status: 200, json: { inbound: { received: 1, duplicates: 1, optedOut: 0 } } });
      expect((await ledger(t, c.id)).filter((r) => r.status === 'revoked')).toHaveLength(1);
      expect(await inboundRows(t)).toHaveLength(1);
    });
    it('an ordinary message, or a sentence that contains a word like stop, is not an opt-out', async () => {
      const t = await tenant();
      const c = await customer(t);
      for (const body of ['Merhaba, kargom nerede?', 'please stop by the shop', 'iptal etmek istemiyorum', 'dur bakalım']) {
        expect(await post(t.account, text(c.phone, body))).toMatchObject({ status: 200, json: { inbound: { optedOut: 0, noOptOut: 1 } } });
      }
      expect(await state(t, c.id)).toBe('granted');
      expect((await inboundRows(t)).every((r) => r.outcome === 'no_opt_out')).toBe(true);
    });
    it('a STOP from a number nobody here has, or from a customer known only by an opaque id, is recorded as unmatched and is not retried (200)', async () => {
      const t = await tenant();
      const known = await customer(t);
      expect(await post(t.account, text(phoneN(), 'STOP'))).toMatchObject({ status: 200, json: { inbound: { unmatched: 1, optedOut: 0 } } });
      expect(await post(t.account, text(null, 'STOP'))).toMatchObject({ status: 200, json: { inbound: { unmatched: 1, optedOut: 0 } } });
      expect(await state(t, known.id)).toBe('granted');
    });
    it('the customer\'s own stop in the WhatsApp app revokes consent; their resume does not grant it again', async () => {
      const t = await tenant();
      const c = await customer(t);
      await post(t.account, preferencePayload({ phoneNumberId: graph.o.phoneNumberId, wa: c.phone, value: 'stop', at: Date.now() - 5000 }));
      expect(await state(t, c.id)).toBe('revoked');
      expect(await ledger(t, c.id)).toMatchObject([{ status: 'granted' }, { status: 'revoked', evidence: { via: 'whatsapp_user_preferences' } }]);
      expect(await post(t.account, preferencePayload({ phoneNumberId: graph.o.phoneNumberId, wa: c.phone, value: 'resume' }))).toMatchObject({ status: 200, json: { inbound: { resumeIgnored: 1, optedOut: 0 } } });
      expect(await state(t, c.id)).toBe('revoked'); // a grant needs the tenant's own proof
    });
    it('is never applied from an unsigned or wrongly signed delivery', async () => {
      const t = await tenant();
      const c = await customer(t);
      expect((await post(t.account, text(c.phone, 'STOP'), { secret: 'wrong' })).status).toBe(401);
      expect(await state(t, c.id)).toBe('granted');
      expect(await inboundRows(t)).toEqual([]);
    });
    it('only revokes inside the tenant whose account received it, even when the same number is a customer of another tenant', async () => {
      const a = await tenant();
      const b = await tenant();
      const shared = phoneN();
      const inA = await customer(a, { phone: shared });
      const inB = await customer(b, { phone: shared });
      await post(a.account, text(shared, 'STOP'));
      expect(await state(a, inA.id)).toBe('revoked');
      expect(await state(b, inB.id)).toBe('granted');
      expect(await inboundRows(b)).toEqual([]);
    });
    it('does not let a signed delivery of one account act through another account\'s secret', async () => {
      const a = await tenant();
      const b = await tenant();
      const c = await customer(b);
      // Account A's id with B's body: A has the same secret in this test, so what protects B is the account's own tenant.
      await post(a.account, text(c.phone, 'STOP'));
      expect(await state(b, c.id)).toBe('granted');
    });
    it('stores no phone number and no message text in inbound_events', async () => {
      const t = await tenant();
      const c = await customer(t);
      await post(t.account, text(c.phone, 'STOP'));
      await post(t.account, text(c.phone, 'Merhaba, siparişim nerede acaba?'));
      const dump = JSON.stringify(await inboundRows(t));
      expect(dump).not.toMatch(/905000|STOP|siparişim|Merhaba/);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  it('logs ids, codes and counts, never a phone number, a message, a token or a secret', async () => {
    const t = await tenant();
    const c = await customer(t);
    graph.stopMarketing(c.phone);
    await M.dispatchMessage(t.org, (await message(t, c.id)).id);
    await post(t.account, text(c.phone, 'STOP'));
    await post(t.account, text(c.phone, 'STOP'), { secret: 'bad' });
    await handshake(t.account, { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' });
    const out = logs.join('\n');
    for (const secret of [c.phone, c.phone.slice(1), graph.o.accessToken, APP_SECRET, VERIFY, 'Ayşe']) expect(out).not.toContain(secret);
  });

  it('the inbound events table is append-only for the engage role', async () => {
    const t = await tenant();
    const c = await customer(t);
    await post(t.account, text(c.phone, 'STOP'));
    await expect(sql(t.org, `UPDATE engage.inbound_events SET outcome = 'no_opt_out' WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
    await expect(sql(t.org, `DELETE FROM engage.inbound_events WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
  });
});
