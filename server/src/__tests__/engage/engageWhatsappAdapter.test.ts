/**
 * The WhatsApp Cloud API adapter against the mock Graph server (WP-27), over real HTTP on localhost, no database. The mock
 * follows Meta's official documentation: the Messages endpoint, its success and error bodies and the documented error codes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdapterError, WebhookSignatureError, type AdapterAccount } from '../../engage/messaging/adapter.js';
import { createWhatsappAdapter, graphBaseUrl, GRAPH_URL, WHATSAPP_PROVIDER } from '../../engage/whatsapp/whatsappAdapter.js';
import { signBody } from '../../engage/whatsapp/format.js';
import { preferencePayload, startMockGraph, statusPayload, textPayload, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

const TO = '+905301234567';

describe('WhatsApp adapter and mock Graph API', () => {
  let mock: MockGraph;
  const env = () => ({ ENGAGE_WHATSAPP_GRAPH_URL: mock.url }) as NodeJS.ProcessEnv;
  const adapter = () => createWhatsappAdapter({ env: env() });
  const account = (over: Partial<AdapterAccount> = {}): AdapterAccount => ({
    id: 'acc-1', channel: 'whatsapp', provider: WHATSAPP_PROVIDER, mode: 'test',
    config: { phone_number_id: mock.o.phoneNumberId, default_language: 'tr' },
    secrets: { access_token: mock.o.accessToken, app_secret: 'app-secret', verify_token: 'verify-me' }, ...over,
  });
  const send = (content: Record<string, unknown>, to = TO, over: Partial<AdapterAccount> = {}) =>
    adapter().send({ idempotencyKey: 'k1', channel: 'whatsapp', to, content }, account(over));
  const code = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as AdapterError;

  beforeEach(async () => { mock = await startMockGraph(); mock.approveTemplate('cart_reminder', 'tr', 2); mock.approveTemplate('hello_world', 'tr', 0); });
  afterEach(async () => { await mock.stop(); });

  it('sends an approved template with its variables through the documented endpoint, and returns Meta\'s message id', async () => {
    const r = await send({ template: 'cart_reminder', body_parameters: ['Ayşe', 'Kitapyurdu'] });
    expect(r.providerMessageId).toMatch(/^wamid\./);
    const call = mock.requests[0]!;
    expect(call).toMatchObject({ method: 'POST', path: `/v23.0/${mock.o.phoneNumberId}/messages`, authorized: true });
    expect(call.body).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: TO, type: 'template',
      template: { name: 'cart_reminder', language: { code: 'tr' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ayşe' }, { type: 'text', text: 'Kitapyurdu' }] }] },
    });
    expect(mock.sent[0]).toMatchObject({ id: r.providerMessageId, template: 'cart_reminder', language: 'tr', params: ['Ayşe', 'Kitapyurdu'] });
  });

  it('uses the configured API version', async () => {
    await send({ template: 'hello_world' }, TO, { config: { phone_number_id: mock.o.phoneNumberId, api_version: 'v27.0' } });
    expect(mock.requests[0]!.path).toBe(`/v27.0/${mock.o.phoneNumberId}/messages`);
  });

  it('sends a text message only inside the 24-hour customer service window', async () => {
    const closed = await code(send({ text: 'Siparişiniz yola çıktı.' }));
    expect(closed).toMatchObject({ kind: 'permanent', code: 'wa_131047', optOut: false });
    mock.openSession(TO);
    expect((await send({ text: 'Siparişiniz yola çıktı.' })).providerMessageId).toMatch(/^wamid\./);
    expect(mock.sent.at(-1)).toMatchObject({ type: 'text', text: 'Siparişiniz yola çıktı.' });
  });

  describe('what Meta refuses', () => {
    it('a template that does not exist in that language, or has the wrong number of variables: final', async () => {
      expect(await code(send({ template: 'nope' }))).toMatchObject({ kind: 'permanent', code: 'wa_132001' });
      expect(await code(send({ template: 'cart_reminder', language: 'en_US', body_parameters: ['a', 'b'] }))).toMatchObject({ kind: 'permanent', code: 'wa_132001' });
      expect(await code(send({ template: 'cart_reminder', body_parameters: ['only one'] }))).toMatchObject({ kind: 'permanent', code: 'wa_132000' });
    });
    it('a recipient who stopped marketing messages: final, and an opt-out', async () => {
      mock.stopMarketing(TO);
      const err = await code(send({ template: 'hello_world' }));
      expect(err).toMatchObject({ kind: 'permanent', code: 'wa_131050', optOut: true });
      expect(adapter().normalizeError(err)).toEqual({ kind: 'permanent', code: 'wa_131050', optOut: true });
      expect(mock.sent).toHaveLength(0);
    });
    it('a number that cannot be delivered to: final', async () => {
      mock.markUndeliverable(TO);
      expect(await code(send({ template: 'hello_world' }))).toMatchObject({ kind: 'permanent', code: 'wa_131026' });
    });
    it('an expired token: final, and the token is never in the error', async () => {
      const err = await code(send({ template: 'hello_world' }, TO, { secrets: { access_token: 'expired-token-xyz', app_secret: 'a', verify_token: 'v' } }));
      expect(err).toMatchObject({ kind: 'permanent', code: 'wa_190' });
      expect(String(err) + err.message).not.toContain('expired-token-xyz');
    });
    it('a rate limit or downtime: worth retrying', async () => {
      mock.failNext({ status: 400, code: 130429 });
      expect(await code(send({ template: 'hello_world' }))).toMatchObject({ kind: 'transient', code: 'wa_130429' });
      mock.failNext({ status: 503, code: 131016 });
      expect(await code(send({ template: 'hello_world' }))).toMatchObject({ kind: 'transient', code: 'wa_131016' });
    });
    it('a server error with no Graph code in its body: retried by its HTTP status', async () => {
      const stub = createWhatsappAdapter({ env: env(), fetchImpl: async () => new Response('<html>Bad gateway</html>', { status: 502 }) });
      const err = await code(stub.send({ idempotencyKey: 'k', channel: 'whatsapp', to: TO, content: { template: 'hello_world' } }, account()));
      expect(err).toMatchObject({ kind: 'transient', code: 'http_502' });
    });
  });

  it('refuses what is wrong before calling Meta: a bad number, a bad template name, a missing token or business number', async () => {
    expect(await code(send({ template: 'hello_world' }, '0530 123 45 67'))).toMatchObject({ kind: 'permanent', code: 'whatsapp_recipient_invalid' });
    expect(await code(send({ template: 'Hello World' }))).toMatchObject({ kind: 'permanent', code: 'whatsapp_template_invalid' });
    expect(await code(send({ template: 'hello_world' }, TO, { secrets: { app_secret: 'a' } }))).toMatchObject({ kind: 'permanent', code: 'whatsapp_config_invalid' });
    expect(await code(send({ template: 'hello_world' }, TO, { config: {} }))).toMatchObject({ kind: 'permanent', code: 'whatsapp_config_invalid' });
    expect(await code(adapter().send({ idempotencyKey: 'k', channel: 'email', to: TO, content: {} }, account()))).toMatchObject({ code: 'channel_unsupported' });
    expect(mock.requests).toHaveLength(0);
  });

  it('an unreachable Meta is worth retrying, and the error names no address', async () => {
    await mock.stop();
    const err = await code(send({ template: 'hello_world' }));
    expect(err).toMatchObject({ kind: 'transient', code: 'whatsapp_unreachable' });
    expect(String(err) + err.message).not.toMatch(/127\.0\.0\.1|905301234567|Bearer/);
  });

  it('an accepted message without an id is final: it cannot be told apart from lost, and sending again could duplicate it', async () => {
    const stub = createWhatsappAdapter({ env: env(), fetchImpl: async () => new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [] }), { status: 200 }) });
    expect(await code(stub.send({ idempotencyKey: 'k', channel: 'whatsapp', to: TO, content: { template: 'hello_world' } }, account()))).toMatchObject({ kind: 'permanent', code: 'whatsapp_unexpected_response' });
  });

  it('only ever talks to Meta, or to a local mock the operator named', () => {
    expect(graphBaseUrl({})).toBe(GRAPH_URL);
    expect(graphBaseUrl({ ENGAGE_WHATSAPP_GRAPH_URL: 'http://127.0.0.1:4020' })).toBe('http://127.0.0.1:4020');
    for (const url of ['https://evil.example', 'http://127.0.0.1.evil.example', 'http://localhost.evil.example']) expect(() => graphBaseUrl({ ENGAGE_WHATSAPP_GRAPH_URL: url }), url).toThrow(AdapterError);
  });

  describe('webhooks', () => {
    const delivery = (payload: unknown, secret = 'app-secret') => { const body = Buffer.from(JSON.stringify(payload)); return { headers: { 'x-hub-signature-256': signBody(secret, body) }, body }; };
    it('verifies the signature, then reads the statuses and the customers\' messages of the same delivery', () => {
      const a = adapter();
      const raw = delivery(statusPayload({ phoneNumberId: mock.o.phoneNumberId, id: 'wamid.S', status: 'delivered', to: TO }));
      expect(a.parseWebhook(raw, account())).toMatchObject([{ providerMessageId: 'wamid.S', type: 'delivered' }]);
      const msg = delivery(textPayload({ phoneNumberId: mock.o.phoneNumberId, from: TO, text: 'STOP', id: 'wamid.T' }));
      expect(a.parseInbound!(msg, account())).toMatchObject([{ providerEventId: 'wamid.T', kind: 'text', from: TO, text: 'STOP' }]);
      const pref = delivery(preferencePayload({ phoneNumberId: mock.o.phoneNumberId, wa: TO, value: 'stop' }));
      expect(a.parseInbound!(pref, account())).toMatchObject([{ kind: 'preference_stop', from: TO }]);
    });
    it('refuses a bad or missing signature, a body changed after signing and a missing app secret', () => {
      const a = adapter();
      const good = delivery(statusPayload({ phoneNumberId: mock.o.phoneNumberId, id: 'wamid.S', status: 'sent', to: TO }));
      expect(() => a.parseWebhook(delivery({ object: 'whatsapp_business_account', entry: [] }, 'wrong-secret'), account())).toThrow(WebhookSignatureError);
      expect(() => a.parseWebhook({ headers: {}, body: good.body }, account())).toThrow(WebhookSignatureError);
      expect(() => a.parseWebhook({ headers: good.headers, body: Buffer.from(good.body.toString() + ' ') }, account())).toThrow(WebhookSignatureError);
      expect(() => a.parseWebhook(good, account({ secrets: { access_token: 't' } }))).toThrow(WebhookSignatureError);
      expect(() => a.parseInbound!({ headers: {}, body: good.body }, account())).toThrow(WebhookSignatureError);
    });
    it('refuses signed rubbish as malformed (400), not as a signature problem', () => {
      const a = adapter();
      const body = Buffer.from('not json');
      expect(() => a.parseWebhook({ headers: { 'x-hub-signature-256': signBody('app-secret', body) }, body }, account())).toThrow(expect.objectContaining({ code: 'malformed_webhook' }));
    });
    it('answers the handshake only for this account\'s verify token', () => {
      const a = adapter();
      const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '1158201444' };
      expect(a.verifyWebhookChallenge!(q, account())).toBe('1158201444');
      expect(a.verifyWebhookChallenge!({ ...q, 'hub.verify_token': 'other' }, account())).toBeNull();
      expect(a.verifyWebhookChallenge!(q, account({ secrets: { access_token: 't' } }))).toBeNull();
    });
  });
});
