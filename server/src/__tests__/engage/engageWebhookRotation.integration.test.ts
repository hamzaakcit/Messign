/**
 * A provider's webhook URL survives rotation of the account's credentials (webhookAccount.ts): the URL names the account the
 * provider was told about, and follows it to the active account that replaced it. Real Postgres and HTTP; WhatsApp through the
 * mock Graph API, and the mock email provider to show it is not specific to one provider. What must not change: the active
 * account's own secrets verify every delivery (a rotated-out secret stops working), and an account that was disabled without a
 * successor, or whose successors are all disabled, is a plain 404.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageWebhookRotation.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';
import { signBody } from '../../engage/whatsapp/format.js';
import { startMockGraph, statusPayload, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

describe.skipIf(!adminUrl)('webhook URLs follow rotated accounts (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let R: typeof import('../../engage/webhookAccount.js');
  let graph: MockGraph;
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();
  const secrets = (tag: string) => ({ access_token: graph.o.accessToken, app_secret: `app-secret-${tag}-${u()}`, verify_token: `verify-${tag}-${u()}` });

  async function tenant() {
    const t = await f.provisionTenant(`Rot ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'whatsapp', 1_000_000, 'TRY');
    return { org, userId: t.admin.userId };
  }
  const waAccount = async (t: { org: string; userId: string }, s: Record<string, string>, phoneNumberId = graph.o.phoneNumberId) =>
    (await creds.createAccount(t.org, t.userId, { channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`, config: { phone_number_id: phoneNumberId, default_language: 'tr' }, secrets: s })).id;
  const rotate = async (t: { org: string; userId: string }, id: string, s: Record<string, string>, config?: Record<string, string>) =>
    (await creds.rotateAccount(t.org, t.userId, id, { secrets: s, ...(config ? { config } : {}) })).id;
  const handshake = async (accountId: string, token: string) => {
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}?${new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '4242' })}`);
    return { status: r.status, text: await r.text() };
  };
  const post = async (accountId: string, payload: unknown, appSecret: string) => {
    const body = JSON.stringify(payload);
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signBody(appSecret, body) }, body });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
  /** A sent WhatsApp message to look at: its Meta id, and the status of it in our ledger. */
  async function sentMessage(t: { org: string; userId: string }, accountId: string) {
    const phone = phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `r-${u()}`, phone });
    await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { test: 'rotation' }, recordedAt: new Date(Date.now() - 60_000) });
    await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    const { message } = await M.createMessage(t.org, { profileId: p.id, channel: 'whatsapp', purpose: 'transactional', channelAccountId: accountId, idempotencyKey: `k-${u()}`, content: { template: 'order_shipped' } });
    expect((await M.dispatchMessage(t.org, message.id)).outcome).toBe('sent');
    return { id: message.id, wamid: graph.sent.at(-1)!.id, phone };
  }
  const status = async (org: string, id: string) => (await M.getMessage(org, id)).message.status;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    R = await import('../../engage/webhookAccount.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    graph = await startMockGraph();
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

  it('resolves the URL of a rotated account to the account that replaced it, and an active account to itself', async () => {
    const t = await tenant();
    const first = await waAccount(t, secrets('a'));
    expect(await R.resolveWebhookAccount(first)).toEqual({ orgId: t.org, activeId: first });
    const second = await rotate(t, first, secrets('b'));
    expect(second).not.toBe(first);
    expect(await R.resolveWebhookAccount(first)).toEqual({ orgId: t.org, activeId: second });
    expect(await R.resolveWebhookAccount(second)).toEqual({ orgId: t.org, activeId: second });
    const third = await rotate(t, second, secrets('c'));
    for (const id of [first, second, third]) expect(await R.resolveWebhookAccount(id), id).toEqual({ orgId: t.org, activeId: third });
  });

  it('says nothing for an unknown account, an account disabled without a successor, or a lineage whose accounts are all disabled', async () => {
    const t = await tenant();
    expect(await R.resolveWebhookAccount(randomUUID())).toBeNull();
    const revoked = await waAccount(t, secrets('a'));
    await creds.disableAccount(t.org, revoked);
    expect(await R.resolveWebhookAccount(revoked)).toBeNull();
    const old = await waAccount(t, secrets('b'));
    const replacement = await rotate(t, old, secrets('c'));
    await creds.disableAccount(t.org, replacement);
    expect(await R.resolveWebhookAccount(old)).toBeNull();
    expect(await R.resolveWebhookAccount(replacement)).toBeNull();
  });

  it('keeps the URL Meta holds working after the token is renewed: the handshake answers with the new verify token only', async () => {
    const t = await tenant();
    const oldS = secrets('old');
    const url = await waAccount(t, oldS);
    expect((await handshake(url, oldS.verify_token)).status).toBe(200);
    const newS = secrets('new');
    await rotate(t, url, newS);
    expect(await handshake(url, newS.verify_token)).toEqual({ status: 200, text: '4242' });
    expect((await handshake(url, oldS.verify_token)).status).toBe(403); // a rotated-out secret is dead
  });

  it('applies a delivery report sent to the old URL, verified by the new app secret, and refuses one signed with the old secret', async () => {
    const t = await tenant();
    const oldS = secrets('old');
    const url = await waAccount(t, oldS);
    const msg = await sentMessage(t, url);
    const newS = secrets('new');
    await rotate(t, url, newS);
    const delivered = statusPayload({ phoneNumberId: graph.o.phoneNumberId, id: msg.wamid, status: 'delivered', to: msg.phone });
    expect((await post(url, delivered, oldS.app_secret)).status).toBe(401);
    expect(await status(t.org, msg.id)).toBe('sent');
    expect(await post(url, delivered, newS.app_secret)).toMatchObject({ status: 200, json: { applied: 1 } });
    expect(await status(t.org, msg.id)).toBe('delivered');
  });

  it('follows a chain of rotations from the first URL, and stops when the last account is disabled', async () => {
    const t = await tenant();
    const url = await waAccount(t, secrets('a'));
    const b = await rotate(t, url, secrets('b'));
    const lastS = secrets('c');
    const c = await rotate(t, b, lastS);
    expect(await handshake(url, lastS.verify_token)).toMatchObject({ status: 200 });
    expect(await handshake(b, lastS.verify_token)).toMatchObject({ status: 200 });
    expect(await handshake(c, lastS.verify_token)).toMatchObject({ status: 200 });
    await creds.disableAccount(t.org, c);
    for (const id of [url, b, c]) expect((await handshake(id, lastS.verify_token)).status, id).toBe(404);
  });

  it('when the number is changed in the rotation, deliveries for the old number are ignored (200) and those for the new number apply', async () => {
    const t = await tenant();
    const oldS = secrets('old');
    const url = await waAccount(t, oldS, '999000111222333'); // the old number
    const newS = secrets('new');
    const active = await rotate(t, url, newS, { phone_number_id: graph.o.phoneNumberId, default_language: 'tr' });
    const msg = await sentMessage(t, active);
    const forOld = statusPayload({ phoneNumberId: '999000111222333', id: msg.wamid, status: 'delivered', to: msg.phone });
    expect(await post(url, forOld, newS.app_secret)).toMatchObject({ status: 200, json: { received: 0 } });
    expect(await status(t.org, msg.id)).toBe('sent');
    const forNew = statusPayload({ phoneNumberId: graph.o.phoneNumberId, id: msg.wamid, status: 'delivered', to: msg.phone });
    expect(await post(url, forNew, newS.app_secret)).toMatchObject({ status: 200, json: { applied: 1 } });
    expect(await status(t.org, msg.id)).toBe('delivered');
  });

  it('is not specific to WhatsApp: a rotated email account\'s old URL verifies with the new secret, and refuses the old one', async () => {
    const t = await tenant();
    const oldSecret = `whsec_old_${u()}`;
    const url = (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: oldSecret } })).id;
    const newSecret = `whsec_new_${u()}`;
    await rotate(t, url, { webhook_secret: newSecret });
    const body = JSON.stringify({ events: [{ provider_message_id: 'mock_unknown', event_id: u(), type: 'delivered', occurred_at: new Date().toISOString() }] });
    const send = async (secret: string) => (await fetch(`${app.baseUrl}/webhooks/${url}`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-mock-signature': M.signMockPayload(secret, body) }, body })).status;
    expect(await send(oldSecret)).toBe(401);
    expect(await send(newSecret)).toBe(503); // signature accepted; the message is not ours yet, so the provider is asked to retry
  });

  it('never lets one tenant\'s URL reach another tenant\'s account', async () => {
    const a = await tenant();
    const b = await tenant();
    const aUrl = await waAccount(a, secrets('a'));
    const bS = secrets('b');
    await waAccount(b, bS);
    const aActive = await rotate(a, aUrl, secrets('a2'));
    expect(await R.resolveWebhookAccount(aUrl)).toEqual({ orgId: a.org, activeId: aActive });
    // Tenant B's verify token does not open tenant A's URL.
    expect((await handshake(aUrl, bS.verify_token)).status).toBe(403);
  });
});
