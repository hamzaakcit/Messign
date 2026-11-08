/**
 * Email channel end to end (WP-12): dispatch through the gate to the SES adapter (SES itself faked at the HTTP layer),
 * then SES notifications through SNS into POST /api/engage/webhooks/:accountId on the real HTTP stack and real Postgres.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';

const REGION = 'eu-central-1';
const TOPIC = `arn:aws:sns:${REGION}:123456789012:messign-ses-events`;
const CERT_URL = `https://sns.${REGION}.amazonaws.com/SimpleNotificationService-test.pem`;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

describe.skipIf(!adminUrl)('email channel: SES adapter and signed webhooks (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let A: string;
  let B: string;
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const sesCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const confirmCalls: string[] = [];
  let certAvailable = true;
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const UNSUB = 'https://example.com/u/ses1';
  const CONTENT = { subject: 'Yeni kitaplar', html: `<p>Merhaba</p><a href="${UNSUB}">abonelikten cik</a>`, text: `Merhaba. ${UNSUB}`, unsubscribe_url: UNSUB };

  const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(`https://sns.${REGION}.amazonaws.com/?Action=ConfirmSubscription`)) { confirmCalls.push(url); return new Response('<ok/>', { status: 200 }); }
    if (url === `https://email.${REGION}.amazonaws.com/v2/email/outbound-emails`) {
      sesCalls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ MessageId: `0100019-${randomUUID()}` }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  });

  const gateReady = async (org: string) => {
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'email', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
  };
  const sesAccount = async (org: string, over: Record<string, string> = {}) =>
    (await creds.createAccount(org, (org === A ? f.A : f.B).admin.userId, {
      channel: 'email', provider: 'ses', mode: 'test', label: `ses-${u()}`,
      config: { region: REGION, from_address: 'hello@demo.example.com', from_name: 'Demo Kitap', sns_topic_arn: TOPIC, ...over },
      secrets: { access_key_id: 'AKIDEXAMPLE', secret_access_key: 'fake-secret-not-real-0000' },
    })).id;
  const recipient = async (org: string, consent = false) => {
    const email = `${u()}@example.com`;
    const p = await P.upsertProfile(org, { externalId: `w-${u()}`, email });
    if (consent) await P.recordConsent(org, p.id, { channel: 'email', status: 'granted', source: 'api', evidence: { test: 'wp12' } });
    await M.addAllowlistEntry(org, 'email', email);
    return { id: p.id, email };
  };
  const sent = async (org: string, acct: string, purpose: 'marketing' | 'transactional' = 'transactional') => {
    const r = await recipient(org, purpose === 'marketing');
    const m = (await M.createMessage(org, { profileId: r.id, channel: 'email', purpose, channelAccountId: acct, idempotencyKey: `k-${u()}`, content: CONTENT })).message;
    const res = await M.dispatchMessage(org, m.id);
    if (res.outcome !== 'sent') throw new Error(`expected sent, got ${JSON.stringify(res)}`);
    return { ...r, messageId: m.id, sesId: res.providerMessageId };
  };
  const sns = (notification: unknown, over: Record<string, unknown> = {}, key = keys.privateKey) => {
    const msg: Record<string, unknown> = {
      Type: 'Notification', MessageId: randomUUID(), TopicArn: TOPIC, Message: JSON.stringify(notification),
      Timestamp: new Date().toISOString(), SignatureVersion: '2', SigningCertURL: CERT_URL, ...over,
    };
    msg.Signature = createSign('RSA-SHA256').update(M.snsStringToSign(msg)!).sign(key, 'base64');
    return msg;
  };
  const post = async (accountId: string, body: unknown, contentType = 'text/plain; charset=UTF-8') => {
    const r = await fetch(`${app.baseUrl}/webhooks/${accountId}`, { method: 'POST', headers: { 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const delivery = (sesId: string) => ({ notificationType: 'Delivery', mail: { messageId: sesId }, delivery: { timestamp: new Date().toISOString(), recipients: ['x'] } });
  const bounce = (sesId: string, email: string, bounceType = 'Permanent') =>
    ({ notificationType: 'Bounce', mail: { messageId: sesId }, bounce: { bounceType, bounceSubType: bounceType === 'Permanent' ? 'General' : 'MailboxFull', bouncedRecipients: [{ emailAddress: email }], timestamp: new Date().toISOString() } });
  const complaint = (sesId: string, email: string) =>
    ({ notificationType: 'Complaint', mail: { messageId: sesId }, complaint: { complainedRecipients: [{ emailAddress: email }], complaintFeedbackType: 'abuse', timestamp: new Date().toISOString() } });
  const status = async (org: string, id: string) => (await M.getMessage(org, id)).message.status;
  const suppression = async (org: string, email: string) =>
    (await sql(org, `SELECT reason FROM engage.suppressions WHERE channel = 'email' AND value_normalized = $1`, [email.toLowerCase()])).rows[0]?.reason ?? null;

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
    M.registerAdapter(M.createSesAdapter({
      fetch: fakeFetch as unknown as typeof fetch,
      fetchCert: async (url) => { if (!certAvailable || url !== CERT_URL) throw new Error('unavailable'); return PUB; },
    }));
    app = await startEngageApp();
    A = f.A.organization.id;
    B = f.B.organization.id;
    await gateReady(A);
    await gateReady(B);
  }, 90_000);
  afterEach(() => { delete process.env.SEND_MODE; certAvailable = true; });
  afterAll(async () => {
    M?.registerAdapter(M.createSesAdapter());
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('sends through SES and applies a signed delivery notification; a redelivered notification is a duplicate', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct);
    expect(sesCalls.at(-1)!.body).toMatchObject({ FromEmailAddress: '"Demo Kitap" <hello@demo.example.com>', Destination: { ToAddresses: [s.email] } });
    const note = sns(delivery(s.sesId));
    expect(await post(acct, note)).toMatchObject({ status: 200, json: { received: 1, applied: 1, duplicates: 0 } });
    expect(await status(A, s.messageId)).toBe('delivered');
    expect(await post(acct, note)).toMatchObject({ status: 200, json: { duplicates: 1, applied: 0 } });
  });

  it('a hard bounce marks the message bounced and suppresses the address, so the next send to it is denied', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct);
    const hard = sns(bounce(s.sesId, s.email.toUpperCase()));
    expect(await post(acct, hard)).toMatchObject({ status: 200, json: { applied: 1, suppressed: 1 } });
    expect(await post(acct, hard)).toMatchObject({ status: 200, json: { duplicates: 1, suppressed: 0 } }); // SNS redelivery
    expect(await status(A, s.messageId)).toBe('bounced');
    expect(await suppression(A, s.email)).toBe('hard_bounce');
    const again = (await M.createMessage(A, { profileId: s.id, channel: 'email', purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, content: CONTENT })).message;
    expect(await M.dispatchMessage(A, again.id)).toEqual({ outcome: 'blocked', code: 'suppressed' });
  });

  it('a complaint after delivery keeps the status, records the complaint and suppresses the address', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct, 'marketing');
    await post(acct, sns(delivery(s.sesId)));
    expect(await post(acct, sns(complaint(s.sesId, s.email)))).toMatchObject({ status: 200, json: { suppressed: 1 } });
    const got = await M.getMessage(A, s.messageId);
    expect(got.message.status).toBe('delivered');
    expect(got.events.map((e) => e.type)).toContain('complained');
    expect(await suppression(A, s.email)).toBe('complaint');
  });

  it('a soft bounce fails the message without suppressing the address', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct);
    expect(await post(acct, sns(bounce(s.sesId, s.email, 'Transient')))).toMatchObject({ status: 200, json: { applied: 1, suppressed: 0 } });
    expect(await status(A, s.messageId)).toBe('failed');
    expect(await suppression(A, s.email)).toBeNull();
  });

  it('rejects a forged, tampered or foreign-topic notification with 401 and changes nothing', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct);
    const before = (await M.getMessage(A, s.messageId)).events.length;
    const forger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const good = sns(bounce(s.sesId, s.email));
    for (const [name, body] of [
      ['signed by another key', sns(bounce(s.sesId, s.email), {}, forger)],
      ['tampered after signing', { ...sns(delivery(s.sesId)), Message: JSON.stringify(bounce(s.sesId, s.email)) }],
      ['validly signed for another topic', sns(bounce(s.sesId, s.email), { TopicArn: `arn:aws:sns:${REGION}:999999999999:attacker` })],
      ['certificate from elsewhere', { ...good, SigningCertURL: 'https://evil.example/cert.pem' }],
      ['unsigned', { ...good, Signature: undefined }],
      ['not even JSON', 'hello'],
    ] as const) {
      expect((await post(acct, body)).status, name).toBe(401);
    }
    expect((await M.getMessage(A, s.messageId)).events.length).toBe(before);
    expect(await status(A, s.messageId)).toBe('sent');
    expect(await suppression(A, s.email)).toBeNull();
  });

  it('returns 404 for a malformed, unknown or disabled account, and 503 when the certificate cannot be fetched', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acct = await sesAccount(A);
    const s = await sent(A, acct);
    expect((await post('not-a-uuid', sns(delivery(s.sesId)))).status).toBe(404);
    expect((await post(randomUUID(), sns(delivery(s.sesId)))).status).toBe(404);
    certAvailable = false;
    expect((await post(acct, sns(delivery(s.sesId)))).status).toBe(503);
    certAvailable = true;
    await creds.disableAccount(A, acct);
    expect((await post(acct, sns(delivery(s.sesId)))).status).toBe(404);
    expect(await status(A, s.messageId)).toBe('sent');
  });

  it('never applies a report to another tenant\'s message, even with the same topic', async () => {
    process.env.SEND_MODE = 'sandbox';
    const acctA = await sesAccount(A);
    const acctB = await sesAccount(B);
    const s = await sent(A, acctA);
    expect(await post(acctB, sns(bounce(s.sesId, s.email)))).toMatchObject({ status: 200, json: { unmatched: 1, applied: 0, suppressed: 0 } });
    expect(await status(A, s.messageId)).toBe('sent');
    expect(await suppression(A, s.email)).toBeNull();
    expect(await suppression(B, s.email)).toBeNull();
  });

  it('the pre-auth account lookup can see exactly the one account it names, and nothing without it', async () => {
    const mine = await sesAccount(A);
    await sesAccount(A);
    await sesAccount(B);
    const seen = await f.engage.withAccountLookup(mine, async (c) => (await c.query<{ id: string }>('SELECT id FROM engage.channel_accounts')).rows.map((r) => r.id));
    expect(seen).toEqual([mine]);
    const none = await f.engage.withAccountLookup(randomUUID(), async (c) => (await c.query('SELECT id FROM engage.channel_accounts')).rowCount);
    expect(none).toBe(0);
    await expect(f.engage.withAccountLookup(mine, (c) => c.query(`UPDATE engage.channel_accounts SET status = 'disabled' WHERE id = $1`, [mine])))
      .resolves.toMatchObject({ rowCount: 0 }); // reading only: no tenant, so no write
  });

  it('confirms an SNS subscription by visiting SubscribeURL', async () => {
    const acct = await sesAccount(A);
    const url = `https://sns.${REGION}.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=t0k3n`;
    const msg: Record<string, unknown> = {
      Type: 'SubscriptionConfirmation', MessageId: randomUUID(), Token: 't0k3n', TopicArn: TOPIC, Message: 'You have chosen to subscribe',
      SubscribeURL: url, Timestamp: new Date().toISOString(), SignatureVersion: '2', SigningCertURL: CERT_URL,
    };
    msg.Signature = createSign('RSA-SHA256').update(M.snsStringToSign(msg)!).sign(keys.privateKey, 'base64');
    expect((await post(acct, msg)).status).toBe(200);
    expect(confirmCalls).toContain(url);
  });

  it('refuses a body that was parsed as JSON upstream (the signed bytes are gone)', async () => {
    const acct = await sesAccount(A);
    expect((await post(acct, sns(delivery('x')), 'application/json')).status).toBe(400);
  });

  it('logs neither addresses nor message bodies', () => {
    const all = logs.join('\n');
    expect(all).toContain('webhook rejected: signature'); // capture is live, so the next two lines mean something
    expect(all).not.toMatch(/@example\.com/);
    expect(all).not.toContain('Yeni kitaplar');
  });
});
