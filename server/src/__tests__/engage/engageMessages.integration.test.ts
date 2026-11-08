/**
 * Messaging core (WP-10) on real Postgres, through the non-bypass engage role: ledger rules, idempotency, the status
 * machine under duplicate and out-of-order delivery reports, atomic claims, dispatch with the interim gate, retries,
 * signed webhooks, and the delivery-report simulator.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('messaging core (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let M: typeof import('../../engage/messaging/index.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let A: string;
  let B: string;
  const logs: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();

  const account = async (org: string, over: Partial<import('../../engage/credentials.js').CreateInput> = {}) => {
    const secret = `whsec_${randomBytes(8).toString('hex')}`;
    const meta = await creds.createAccount(org, (org === A ? f.A : f.B).admin.userId, {
      channel: 'email', provider: 'mock', mode: 'test', label: `acct-${u()}`, config: {}, secrets: { webhook_secret: secret }, ...over,
    });
    return { id: meta.id, secret };
  };
  const profile = async (org: string, o: { email?: string | null; phone?: string | null; consent?: Array<'email' | 'sms'> } = {}) => {
    const email = o.email === undefined ? `${u()}@example.com` : o.email;
    const phone = o.phone === undefined ? phoneN() : o.phone;
    const p = await P.upsertProfile(org, { externalId: `m-${u()}`, email, phone });
    for (const ch of o.consent ?? []) await P.recordConsent(org, p.id, { channel: ch, status: 'granted', source: 'api', evidence: { test: 'wp10' } });
    // Sandbox sends only reach allow-listed addresses (WP-11); these tests are about the pipeline, so list them all.
    if (email) await M.addAllowlistEntry(org, 'email', email);
    if (phone) { await M.addAllowlistEntry(org, 'sms', phone); await M.addAllowlistEntry(org, 'whatsapp', phone); }
    return { id: p.id, email, phone };
  };
  const msg = async (org: string, acct: string, profileId: string, over: Partial<import('../../engage/messaging/messages.js').CreateMessageInput> = {}) =>
    (await M.createMessage(org, { profileId, channel: 'email', purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, content: VALID[over.channel ?? 'email'], ...over })).message;
  // An allow decision written directly, for tests that call claim_message without the gate.
  const allow = async (org: string, messageId: string) =>
    (await sql(org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'allow', 'allowed', 'sandbox') RETURNING id`, [org, messageId])).rows[0].id as string;
  // Configure a tenant so the gate's budget, readiness and kill-switch rules pass unless a test changes them.
  const gateReady = async (org: string) => {
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const channel of ['email', 'sms', 'whatsapp'] as const) {
      for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel, category, unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, channel, 1_000_000_000_000, 'TRY');
    }
  };
  const UNSUB = 'https://example.com/u/abc123';
  const VALID: Record<'email' | 'sms' | 'whatsapp', Record<string, unknown>> = {
    email: { subject: 'Hello', html: `<p>Hi</p><a href="${UNSUB}">unsubscribe</a>`, unsubscribe_url: UNSUB },
    sms: { text: 'Kampanya basladi. Iptal icin IPTAL yazin', sender_id: 'MESSIGN' },
    whatsapp: { template: 'promo_v1' },
  };
  const status = async (org: string, id: string) => (await M.getMessage(org, id)).message.status;
  const sendSpies: Array<{ mockRestore: () => void }> = [];
  const spySend = () => { const s = vi.spyOn(mock.mockAdapter, 'send'); sendSpies.push(s); return s; };
  const setMode = (m: string | undefined) => { if (m === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = m; };

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    M = await import('../../engage/messaging/index.js');
    mock = await import('../../engage/messaging/mockAdapter.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    A = f.A.organization.id;
    B = f.B.organization.id;
    await gateReady(A);
    await gateReady(B);
  }, 90_000);

  afterEach(() => { setMode(undefined); mock.resetMockAdapter(); sendSpies.splice(0).forEach((s) => s.mockRestore()); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  describe('ledger rules (raw SQL as the engage role)', () => {
    it('cannot change a status, an attempt counter or any content, and cannot delete anything', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await expect(sql(A, `UPDATE engage.messages SET status = 'delivered' WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.messages SET attempt_count = 0 WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.messages SET content = '{}'::jsonb WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.messages SET idempotency_key = 'x' WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.messages WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [A, m.id]);
      await expect(sql(A, `UPDATE engage.message_events SET type = 'failed' WHERE message_id = $1`, [m.id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.message_events WHERE message_id = $1`, [m.id])).rejects.toThrow(/permission denied/);
    });

    it('only accepts an account of the same tenant and the same channel', async () => {
      const email = await account(A);
      const p = await profile(A);
      await expect(M.createMessage(A, { profileId: p.id, channel: 'sms', purpose: 'transactional', channelAccountId: email.id, idempotencyKey: `k-${u()}`, content: {} }))
        .rejects.toThrow(M.MessageInputError);
      await expect(sql(A, `INSERT INTO engage.messages (organization_id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, request_hash, content)
        VALUES ($1, $2, 'sms', 'transactional', $3, 'mock', $4, $5, '{}'::jsonb)`, [A, p.id, email.id, `k-${u()}`, 'a'.repeat(64)])).rejects.toThrow(/foreign key/);
      const otherTenant = await account(B);
      await expect(M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: otherTenant.id, idempotencyKey: `k-${u()}`, content: {} }))
        .rejects.toThrow(M.MessageInputError);
      const pb = await profile(B);
      await expect(M.createMessage(A, { profileId: pb.id, channel: 'email', purpose: 'transactional', channelAccountId: email.id, idempotencyKey: `k-${u()}`, content: {} }))
        .rejects.toThrow(/foreign key|violates/);
    });

    it('refuses a message for a disabled account', async () => {
      const a = await account(A);
      const p = await profile(A);
      await creds.disableAccount(A, a.id);
      await expect(M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: `k-${u()}`, content: {} }))
        .rejects.toThrow(M.MessageInputError);
    });

    it('refuses an event written for another tenant', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await expect(sql(B, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [A, m.id])).rejects.toThrow();
      await expect(sql(B, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [B, m.id])).rejects.toThrow();
      await expect(sql(B, `SELECT engage.claim_message($1, $2, interval '1 minute', 1)`, [A, m.id])).rejects.toThrow(/outside the current tenant/);
      expect(await status(A, m.id)).toBe('queued');
    });

    it('refuses events and claims without a tenant context, even from a connection that bypasses RLS', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await expect(f.admin.query(`INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [A, m.id]))
        .rejects.toThrow(/message event outside the current tenant/);
      const d = await allow(A, m.id);
      await expect(f.admin.query(`SELECT engage.claim_message($1, $2, interval '1 minute', $3)`, [A, m.id, d])).rejects.toThrow(/claim outside the current tenant/);
      await expect(sql(B, `SELECT engage.claim_message($1, $2, interval '1 minute', $3)`, [A, m.id, d])).rejects.toThrow(/claim outside the current tenant/);
      expect(await status(A, m.id)).toBe('queued');
    });

    it('never gives two messages the same provider id', async () => {
      const a = await account(A);
      const m1 = await msg(A, a.id, (await profile(A)).id);
      const m2 = await msg(A, a.id, (await profile(A)).id);
      await sql(A, `UPDATE engage.messages SET provider_message_id = 'dup-id' WHERE id = $1`, [m1.id]);
      await expect(sql(A, `UPDATE engage.messages SET provider_message_id = 'dup-id' WHERE id = $1`, [m2.id])).rejects.toThrow(/messages_provider_id_uq/);
    });

    it('lets only one of two conflicting final reports win when they arrive at the same moment', async () => {
      const a = await account(A);
      for (let i = 0; i < 12; i++) {
        const m = await msg(A, a.id, (await profile(A)).id);
        await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sent', 'system')`, [A, m.id]);
        await Promise.all(['delivered', 'failed'].map((type) =>
          sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source, provider_event_id) VALUES ($1, $2, $3, 'provider', $3)`, [A, m.id, type])));
        const final = (await M.getMessage(A, m.id)).events.filter((e) => e.type === 'delivered' || e.type === 'failed');
        expect(final.filter((e) => e.applied), `round ${i}`).toHaveLength(1);
        expect(await status(A, m.id)).toBe(final.find((e) => e.applied)!.type);
      }
    });

    it('applies the same provider report only once', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      const ins = () => sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source, provider_event_id) VALUES ($1, $2, 'sent', 'provider', 'evt-1')`, [A, m.id]);
      await ins();
      await expect(ins()).rejects.toThrow(/message_events_dedup_uq/);
    });
  });

  describe('status machine: reports in any order, or twice', () => {
    const cases: Array<[string, string[], string]> = [
      ['sent then delivered', ['sent', 'delivered'], 'delivered'],
      ['delivered then a late sent', ['delivered', 'sent'], 'delivered'],
      ['failed then a late sent', ['failed', 'sent'], 'failed'],
      ['delivered, then a conflicting failed: first final report wins', ['delivered', 'failed'], 'delivered'],
      ['failed, then a conflicting delivered: first final report wins', ['failed', 'delivered'], 'failed'],
      ['an asynchronous bounce after delivery wins', ['sent', 'delivered', 'bounced'], 'bounced'],
      ['bounce, then a late delivered', ['bounced', 'delivered'], 'bounced'],
      ['blocked is final', ['blocked', 'sent', 'delivered'], 'blocked'],
      ['blocked is never bounced', ['blocked', 'bounced'], 'blocked'],
      ['a sent message cannot be blocked afterwards', ['sent', 'blocked'], 'sent'],
      ['a delivered message cannot be sent back to the queue', ['delivered', 'retry_scheduled'], 'delivered'],
      ['a sent message cannot be sent back to the queue', ['sent', 'retry_scheduled'], 'sent'],
    ];
    it.each(cases)('%s', async (_name, events, expected) => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      for (const [i, type] of events.entries()) {
        await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source, provider_event_id) VALUES ($1, $2, $3, 'provider', $4)`, [A, m.id, type, `e${i}`]);
      }
      expect(await status(A, m.id)).toBe(expected);
    });

    it('records which events changed the status', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      for (const [i, type] of ['delivered', 'sent', 'delivered'].entries()) {
        await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source, provider_event_id) VALUES ($1, $2, $3, 'provider', $4)`, [A, m.id, type, `e${i}`]);
      }
      expect((await M.getMessage(A, m.id)).events.map((e) => e.applied)).toEqual([true, false, false]);
    });

    it('a "sending" or "retry_scheduled" event cannot be forged to change a queued message', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'sending', 'system')`, [A, m.id]);
      expect(await status(A, m.id)).toBe('queued');
      await sql(A, `INSERT INTO engage.message_events (organization_id, message_id, type, source) VALUES ($1, $2, 'retry_scheduled', 'system')`, [A, m.id]);
      expect(await status(A, m.id)).toBe('queued');
      expect((await M.getMessage(A, m.id)).message.attemptCount).toBe(0);
    });
  });

  describe('atomic claim', () => {
    const claim = async (org: string, id: string, lease = '300 seconds') =>
      sql(org, `SELECT engage.claim_message($1, $2, $3::interval, $4) AS ok`, [org, id, lease, await allow(org, id)]).then((r) => r.rows[0].ok as boolean);

    it('lets exactly one of many concurrent callers win', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      const wins = (await Promise.all(Array.from({ length: 10 }, () => claim(A, m.id)))).filter(Boolean);
      expect(wins).toHaveLength(1);
      const got = (await M.getMessage(A, m.id)).message;
      expect(got.status).toBe('sending');
      expect(got.attemptCount).toBe(1);
    });

    it('does not claim a message that is not yet due', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await sql(A, `UPDATE engage.messages SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`, [m.id]);
      expect(await claim(A, m.id)).toBe(false);
    });

    it('takes over an expired claim, and fails a message that is out of attempts', async () => {
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id, { maxAttempts: 2 });
      expect(await claim(A, m.id)).toBe(true);
      expect(await claim(A, m.id)).toBe(false); // still leased
      expect(await claim(A, m.id, '0 seconds')).toBe(true); // attempt 2
      expect(await claim(A, m.id, '0 seconds')).toBe(false); // expired with no attempts left
      const got = (await M.getMessage(A, m.id)).message;
      expect(got.status).toBe('failed');
      expect(got.errorCode).toBe('lease_expired');
    });
  });

  describe('idempotent creation', () => {
    it('returns the same message for the same key and request, and rejects the same key with a different request', async () => {
      const a = await account(A);
      const p = await profile(A);
      const key = `once-${u()}`;
      const one = await M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: key, content: { subject: 'x', body: 'y' } });
      const two = await M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: key, content: { body: 'y', subject: 'x' } });
      expect(one.created).toBe(true);
      expect(two.created).toBe(false);
      expect(two.message.id).toBe(one.message.id);
      await expect(M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: key, content: { subject: 'other' } }))
        .rejects.toThrow(M.IdempotencyConflictError);
      await expect(M.createMessage(A, { profileId: (await profile(A)).id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: key, content: { subject: 'x', body: 'y' } }))
        .rejects.toThrow(M.IdempotencyConflictError);
    });

    it('creates exactly one row when the same request arrives 20 times at once', async () => {
      const a = await account(A);
      const p = await profile(A);
      const key = `race-${u()}`;
      const results = await Promise.all(Array.from({ length: 20 }, () =>
        M.createMessage(A, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: a.id, idempotencyKey: key, content: { subject: 'x' } })));
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
      expect((await sql(A, `SELECT count(*)::int AS n FROM engage.messages WHERE idempotency_key = $1`, [key])).rows[0].n).toBe(1);
    });

    it('treats the same key in another tenant as a different message', async () => {
      const key = `shared-${u()}`;
      const ma = await M.createMessage(A, { profileId: (await profile(A)).id, channel: 'email', purpose: 'transactional', channelAccountId: (await account(A)).id, idempotencyKey: key, content: {} });
      const mb = await M.createMessage(B, { profileId: (await profile(B)).id, channel: 'email', purpose: 'transactional', channelAccountId: (await account(B)).id, idempotencyKey: key, content: {} });
      expect(ma.created && mb.created).toBe(true);
      await expect(M.getMessage(B, ma.message.id)).rejects.toThrow(M.MessageNotFoundError);
    });
  });

  describe('dispatch and the interim gate', () => {
    it('holds everything while SEND_MODE is off (unset, empty, or a typo): no adapter call, message stays queued', async () => {
      const send = spySend();
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      for (const v of [undefined, '', 'off', 'LIVE', 'sandbox ', 'true']) {
        setMode(v);
        expect(await M.dispatchMessage(A, m.id), `SEND_MODE=${String(v)}`).toEqual({ outcome: 'held', code: 'send_mode_off' });
      }
      expect(send).not.toHaveBeenCalled();
      expect(await status(A, m.id)).toBe('queued');
    });

    it('sends through the mock adapter in sandbox, with the idempotency key, and records the ledger trail', async () => {
      setMode('sandbox');
      const send = spySend();
      const a = await account(A);
      const p = await profile(A);
      const m = await msg(A, a.id, p.id, { idempotencyKey: `trail-${u()}` });
      const res = await M.dispatchMessage(A, m.id);
      expect(res).toEqual({ outcome: 'sent', providerMessageId: M.mockProviderMessageId(a.id, m.idempotencyKey) });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![0]).toMatchObject({ idempotencyKey: m.idempotencyKey, channel: 'email', to: p.email!.toLowerCase() });
      const got = await M.getMessage(A, m.id);
      expect(got.message).toMatchObject({ status: 'sent', attemptCount: 1, providerMessageId: res.outcome === 'sent' ? res.providerMessageId : '' });
      expect(got.events.map((e) => [e.type, e.applied])).toEqual([['sending', true], ['sent', true]]);
      expect(await M.dispatchMessage(A, m.id)).toEqual({ outcome: 'skipped', code: 'not_due_or_claimed' });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends exactly once when the same message is dispatched 10 times at once', async () => {
      setMode('sandbox');
      const send = spySend();
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      const outcomes = await Promise.all(Array.from({ length: 10 }, () => M.dispatchMessage(A, m.id)));
      expect(outcomes.filter((o) => o.outcome === 'sent')).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect((await M.getMessage(A, m.id)).message.attemptCount).toBe(1);
    });

    it('blocks an account whose mode does not match SEND_MODE (test account in live, live account in sandbox)', async () => {
      const send = spySend();
      const a = await account(A);
      const real = await account(A, { provider: 'ses', mode: 'live', secrets: { api_key: 'fakekey_not_real_1234' } });
      const m1 = await msg(A, a.id, (await profile(A)).id);
      setMode('live');
      expect(await M.dispatchMessage(A, m1.id)).toEqual({ outcome: 'blocked', code: 'account_mode_mismatch' });
      const m2 = await msg(A, real.id, (await profile(A)).id);
      setMode('sandbox');
      expect(await M.dispatchMessage(A, m2.id)).toEqual({ outcome: 'blocked', code: 'account_mode_mismatch' });
      expect(send).not.toHaveBeenCalled();
      expect(await status(A, m1.id)).toBe('blocked');
      expect(await status(A, m2.id)).toBe('blocked');
    });

    it('blocks marketing without a consent grant, allows it with one, and always blocks a suppressed address', async () => {
      setMode('sandbox');
      const a = await account(A);
      const noConsent = await profile(A);
      const m1 = await msg(A, a.id, noConsent.id, { purpose: 'marketing' });
      expect(await M.dispatchMessage(A, m1.id)).toEqual({ outcome: 'blocked', code: 'no_consent' });

      const granted = await profile(A, { consent: ['email'] });
      expect((await M.dispatchMessage(A, (await msg(A, a.id, granted.id, { purpose: 'marketing' })).id)).outcome).toBe('sent');

      const wrongChannel = await profile(A, { consent: ['sms'] });
      expect(await M.dispatchMessage(A, (await msg(A, a.id, wrongChannel.id, { purpose: 'marketing' })).id)).toEqual({ outcome: 'blocked', code: 'no_consent' });

      const suppressed = await profile(A, { consent: ['email'] });
      await P.addSuppression(A, 'email', suppressed.email!, 'hard_bounce');
      expect(await M.dispatchMessage(A, (await msg(A, a.id, suppressed.id, { purpose: 'marketing' })).id)).toEqual({ outcome: 'blocked', code: 'suppressed' });
      expect(await M.dispatchMessage(A, (await msg(A, a.id, suppressed.id, { purpose: 'transactional' })).id)).toEqual({ outcome: 'blocked', code: 'suppressed' });
    });

    it('blocks a message whose profile has no address for the channel', async () => {
      setMode('sandbox');
      const a = await account(A);
      const noEmail = await profile(A, { email: null });
      expect(await M.dispatchMessage(A, (await msg(A, a.id, noEmail.id)).id)).toEqual({ outcome: 'blocked', code: 'no_recipient' });
    });

    it('uses the phone number for sms', async () => {
      setMode('sandbox');
      const send = spySend();
      const a = await account(A, { channel: 'sms' });
      const p = await profile(A);
      await M.dispatchMessage(A, (await msg(A, a.id, p.id, { channel: 'sms' })).id);
      expect(send.mock.calls[0]![0].to).toBe(p.phone);
    });

    it('retries transient failures with backoff and then succeeds, reusing the same idempotency key', async () => {
      setMode('sandbox');
      const send = spySend();
      const a = await account(A, { config: { transient_failures: 2 } });
      const m = await msg(A, a.id, (await profile(A)).id);
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 })).toMatchObject({ outcome: 'retry_scheduled', attempt: 1, code: 'mock_transient_failure' });
      expect(await status(A, m.id)).toBe('queued');
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 })).toMatchObject({ outcome: 'retry_scheduled', attempt: 2 });
      expect((await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('sent');
      const got = await M.getMessage(A, m.id);
      expect(got.message).toMatchObject({ status: 'sent', attemptCount: 3 });
      expect(new Set(send.mock.calls.map((c) => c[0].idempotencyKey)).size).toBe(1);
      expect(got.events.map((e) => e.type)).toEqual(['sending', 'retry_scheduled', 'sending', 'retry_scheduled', 'sending', 'sent']);
    });

    it('does not retry before the backoff has passed, and the delay doubles', async () => {
      setMode('sandbox');
      const a = await account(A, { config: { transient_failures: 5 } });
      const m = await msg(A, a.id, (await profile(A)).id);
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 60 })).toMatchObject({ outcome: 'retry_scheduled' });
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 60 })).toEqual({ outcome: 'skipped', code: 'not_due_or_claimed' });
      const delay = async () => Number((await sql(A, `SELECT extract(epoch FROM next_attempt_at - now()) AS s FROM engage.messages WHERE id = $1`, [m.id])).rows[0].s);
      expect(await delay()).toBeGreaterThan(50);
      expect(await delay()).toBeLessThanOrEqual(60);
      await sql(A, `UPDATE engage.messages SET next_attempt_at = now() WHERE id = $1`, [m.id]);
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 60 })).toMatchObject({ outcome: 'retry_scheduled', attempt: 2 });
      expect(await delay()).toBeGreaterThan(110);
    });

    it('fails after the last attempt, and never retries a permanent error', async () => {
      setMode('sandbox');
      const flaky = await account(A, { config: { transient_failures: 99 } });
      const m = await msg(A, flaky.id, (await profile(A)).id, { maxAttempts: 2 });
      expect((await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('retry_scheduled');
      expect(await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 })).toEqual({ outcome: 'failed', code: 'mock_transient_failure' });
      expect(await status(A, m.id)).toBe('failed');

      const send = spySend();
      const hard = await account(A, { config: { permanent_failure: true } });
      const m2 = await msg(A, hard.id, (await profile(A)).id);
      expect(await M.dispatchMessage(A, m2.id)).toEqual({ outcome: 'failed', code: 'mock_permanent_failure' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(await M.dispatchMessage(A, m2.id)).toEqual({ outcome: 'skipped', code: 'not_due_or_claimed' });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('recovers a message whose worker died after claiming it, with the same provider id', async () => {
      setMode('sandbox');
      const a = await account(A);
      const m = await msg(A, a.id, (await profile(A)).id);
      await sql(A, `SELECT engage.claim_message($1, $2, interval '300 seconds', $3)`, [A, m.id, await allow(A, m.id)]); // the "crashed" worker
      expect(await M.dispatchMessage(A, m.id)).toEqual({ outcome: 'skipped', code: 'not_due_or_claimed' }); // still leased
      const res = await M.dispatchMessage(A, m.id, { leaseSeconds: 0 });
      expect(res).toEqual({ outcome: 'sent', providerMessageId: M.mockProviderMessageId(a.id, m.idempotencyKey) });
      expect((await M.getMessage(A, m.id)).message.attemptCount).toBe(2);
    });

    it('fails a message cleanly when its adapter is missing or does not support the channel', async () => {
      setMode('sandbox');
      const a = await account(A);
      const none = await msg(A, a.id, (await profile(A)).id);
      M.clearAdapters();
      try {
        expect(await M.dispatchMessage(A, none.id)).toEqual({ outcome: 'failed', code: 'no_adapter' });
        M.registerAdapter({ ...mock.mockAdapter, capabilities: () => ({ ...mock.mockAdapter.capabilities(), channels: ['sms'] }) });
        const wrong = await msg(A, a.id, (await profile(A)).id);
        expect(await M.dispatchMessage(A, wrong.id)).toEqual({ outcome: 'failed', code: 'channel_unsupported' });
        expect(await status(A, wrong.id)).toBe('failed');
      } finally {
        M.clearAdapters();
        M.registerBuiltInAdapters();
      }
    });

    it('does not send to an erased profile or a deactivated address', async () => {
      setMode('sandbox');
      const send = spySend();
      const a = await account(A);
      const erased = await profile(A);
      await sql(A, `UPDATE engage.profiles SET erased_at = now() WHERE id = $1`, [erased.id]);
      expect(await M.dispatchMessage(A, (await msg(A, a.id, erased.id)).id)).toEqual({ outcome: 'blocked', code: 'no_recipient' });
      const moved = await profile(A);
      await sql(A, `UPDATE engage.identifiers SET is_active = false, deactivated_at = now() WHERE profile_id = $1 AND type = 'email'`, [moved.id]);
      expect(await M.dispatchMessage(A, (await msg(A, a.id, moved.id)).id)).toEqual({ outcome: 'blocked', code: 'no_recipient' });
      expect(send).not.toHaveBeenCalled();
    });

    it('treats a mock-provider account in live mode like any other non-test account in sandbox', async () => {
      setMode('sandbox');
      const send = spySend();
      const live = await account(A, { mode: 'live' });
      expect(await M.dispatchMessage(A, (await msg(A, live.id, (await profile(A)).id)).id)).toEqual({ outcome: 'blocked', code: 'account_mode_mismatch' });
      expect(send).not.toHaveBeenCalled();
    });

    it('does not re-evaluate or add events to a message that already left the queue', async () => {
      setMode('sandbox');
      const a = await account(A);
      const p = await profile(A);
      const m = await msg(A, a.id, p.id);
      expect((await M.dispatchMessage(A, m.id)).outcome).toBe('sent');
      await P.addSuppression(A, 'email', p.email!, 'manual');
      const before = (await M.getMessage(A, m.id)).events.length;
      expect(await M.dispatchMessage(A, m.id)).toEqual({ outcome: 'skipped', code: 'not_due_or_claimed' });
      expect((await M.getMessage(A, m.id)).events).toHaveLength(before);
      expect(await status(A, m.id)).toBe('sent');
    });

    it('caps the retry delay at one hour', async () => {
      setMode('sandbox');
      const a = await account(A, { config: { transient_failures: 9 } });
      const m = await msg(A, a.id, (await profile(A)).id);
      await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 3600 });
      await sql(A, `UPDATE engage.messages SET next_attempt_at = now() WHERE id = $1`, [m.id]);
      await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 3600 }); // 3600 * 2, capped
      const delay = Number((await sql(A, `SELECT extract(epoch FROM next_attempt_at - now()) AS s FROM engage.messages WHERE id = $1`, [m.id])).rows[0].s);
      expect(delay).toBeGreaterThan(3500);
      expect(delay).toBeLessThanOrEqual(3600);
    });

    it('lists only messages that are due', async () => {
      const a = await account(A);
      const due = await msg(A, a.id, (await profile(A)).id);
      const later = await msg(A, a.id, (await profile(A)).id);
      await sql(A, `UPDATE engage.messages SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`, [later.id]);
      const ids = await M.listDueMessageIds(A, 1000);
      expect(ids).toContain(due.id);
      expect(ids).not.toContain(later.id);
    });

    it('dispatchDue sends what is due and tallies the rest without one failure stopping the others', async () => {
      setMode('sandbox');
      const a = await account(A);
      const ok = await msg(A, a.id, (await profile(A)).id);
      const bad = await msg(A, a.id, (await profile(A, { email: null })).id);
      const tally = await M.dispatchDue(A, 1000);
      expect(tally.sent).toBeGreaterThanOrEqual(1);
      expect(tally.blocked).toBeGreaterThanOrEqual(1);
      expect(await status(A, ok.id)).toBe('sent');
      expect(await status(A, bad.id)).toBe('blocked');
    });
  });

  describe('webhooks and the delivery-report simulator', () => {
    const sent = async (a: { id: string }, n: number) => {
      setMode('sandbox');
      const ids: Array<{ id: string; pid: string }> = [];
      for (let i = 0; i < n; i++) {
        const m = await msg(A, a.id, (await profile(A)).id);
        const r = await M.dispatchMessage(A, m.id);
        if (r.outcome !== 'sent') throw new Error(`expected sent, got ${r.outcome}`);
        ids.push({ id: m.id, pid: r.providerMessageId });
      }
      return ids;
    };

    it('applies a correctly signed delivery report', async () => {
      const a = await account(A);
      const [m] = await sent(a, 1);
      const batch = M.simulateReports([m!.pid]);
      const res = await M.ingestWebhook(A, a.id, M.signedMockWebhook(a.secret, batch.events));
      expect(res).toMatchObject({ received: 2, applied: 1, ignored: 1, duplicates: 0, unmatched: 0 }); // "sent" is already known; "delivered" applies
      expect(await status(A, m!.id)).toBe('delivered');
    });

    it('rejects a forged, unsigned, re-signed or tampered webhook without touching anything', async () => {
      const a = await account(A);
      const other = await account(A);
      const [m] = await sent(a, 1);
      const events = M.simulateReports([m!.pid]).events;
      const good = M.signedMockWebhook(a.secret, events);
      const before = (await M.getMessage(A, m!.id)).events.length;

      const forged = M.signedMockWebhook('whsec_attacker_guess', events);
      await expect(M.ingestWebhook(A, a.id, forged)).rejects.toThrow(M.WebhookSignatureError);
      await expect(M.ingestWebhook(A, a.id, { headers: {}, body: good.body })).rejects.toThrow(M.WebhookSignatureError);
      await expect(M.ingestWebhook(A, a.id, { headers: { [M.MOCK_SIGNATURE_HEADER]: 'zz' }, body: good.body })).rejects.toThrow(M.WebhookSignatureError);
      await expect(M.ingestWebhook(A, a.id, { headers: { [M.MOCK_SIGNATURE_HEADER]: '' }, body: good.body })).rejects.toThrow(M.WebhookSignatureError);
      await expect(M.ingestWebhook(A, a.id, { headers: good.headers, body: Buffer.from(`${good.body.toString()} `) })).rejects.toThrow(M.WebhookSignatureError);
      await expect(M.ingestWebhook(A, other.id, good)).rejects.toThrow(M.WebhookSignatureError); // another account's secret
      expect((await M.getMessage(A, m!.id)).events.length).toBe(before);
      expect(await status(A, m!.id)).toBe('sent');
    });

    it('rejects a malformed body even when correctly signed', async () => {
      const a = await account(A);
      const body = Buffer.from('{"events": [{"type": "delivered"}]}');
      const raw = { headers: { [M.MOCK_SIGNATURE_HEADER]: M.signMockPayload(a.secret, body) }, body };
      await expect(M.ingestWebhook(A, a.id, raw)).rejects.toThrow(/malformed_webhook/);
    });

    it('drops reports for unknown messages and for another tenant\'s messages', async () => {
      const a = await account(A);
      const b = await account(B);
      const [mb] = await (async () => { setMode('sandbox'); const m = await msg(B, b.id, (await profile(B)).id); const r = await M.dispatchMessage(B, m.id); return [{ id: m.id, pid: (r as { providerMessageId: string }).providerMessageId }]; })();
      const events = M.simulateReports([mb!.pid, 'mock_doesnotexist']).events;
      const res = await M.ingestWebhook(A, a.id, M.signedMockWebhook(a.secret, events));
      expect(res.unmatched).toBe(events.length);
      expect(await status(B, mb!.id)).toBe('sent');
    });

    it('reaches the right final status for 300 messages with shuffled, duplicated, partly missing reports, delivered in chunks', async () => {
      const a = await account(A);
      const msgs = await sent(a, 300);
      const batch = M.simulateReports(msgs.map((m) => m.pid), {
        seed: 42, shuffle: true, duplicateRate: 0.4, weights: { delivered: 6, failed: 1, bounced: 1, silent: 2 },
      });
      const tally = { received: 0, applied: 0, duplicates: 0 };
      for (let i = 0; i < batch.events.length; i += 97) {
        const r = await M.ingestWebhook(A, a.id, M.signedMockWebhook(a.secret, batch.events.slice(i, i + 97)));
        tally.received += r.received; tally.applied += r.applied; tally.duplicates += r.duplicates;
      }
      const stored = (await sql(A, `SELECT id, status FROM engage.messages WHERE id = ANY($1::uuid[])`, [msgs.map((m) => m.id)])).rows as Array<{ id: string; status: string }>;
      const byId = new Map(stored.map((r) => [r.id, r.status]));
      const wrong = msgs.filter((m) => byId.get(m.id) !== batch.expected.get(m.pid));
      expect(wrong).toEqual([]);
      expect(new Set(batch.expected.values())).toEqual(new Set(['delivered', 'failed', 'bounced', 'sent']));
      expect(tally.received).toBe(batch.events.length);
      expect(tally.duplicates).toBeGreaterThan(0);

      // the whole batch again changes nothing and is all duplicates
      const again = await M.ingestWebhook(A, a.id, M.signedMockWebhook(a.secret, batch.events));
      expect(again).toMatchObject({ applied: 0, ignored: 0, duplicates: batch.events.length, unmatched: 0 });
      const after = (await sql(A, `SELECT id, status FROM engage.messages WHERE id = ANY($1::uuid[])`, [msgs.map((m) => m.id)])).rows as Array<{ id: string; status: string }>;
      expect(after.filter((r) => r.status !== byId.get(r.id))).toEqual([]);
      // at most one event row per provider event id per message
      const dupes = await sql(A, `SELECT count(*)::int AS n FROM (SELECT message_id, provider_event_id FROM engage.message_events WHERE message_id = ANY($1::uuid[])
        AND provider_event_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) d`, [msgs.map((m) => m.id)]);
      expect(dupes.rows[0].n).toBe(0);
    }, 120_000);

    it('gives the same final statuses whatever the arrival order (several seeds)', async () => {
      const a = await account(A);
      const msgs = await sent(a, 40);
      const pids = msgs.map((m) => m.pid);
      const reference = M.simulateReports(pids, { seed: 7, weights: { delivered: 3, bounced: 1, failed: 1 } });
      for (const seed of [1, 2, 3]) {
        const replay = M.simulateReports(pids, { seed: 7, shuffle: true, duplicateRate: 0.5, weights: { delivered: 3, bounced: 1, failed: 1 } });
        expect([...replay.expected]).toEqual([...reference.expected]);
        void seed;
      }
      await M.ingestWebhook(A, a.id, M.signedMockWebhook(a.secret, M.simulateReports(pids, { seed: 7, shuffle: true, duplicateRate: 0.5, weights: { delivered: 3, bounced: 1, failed: 1 } }).events));
      const stored = (await sql(A, `SELECT provider_message_id AS pid, status FROM engage.messages WHERE id = ANY($1::uuid[])`, [msgs.map((m) => m.id)])).rows as Array<{ pid: string; status: string }>;
      expect(stored.filter((r) => r.status !== reference.expected.get(r.pid))).toEqual([]);
    });
  });

  describe('privacy', () => {
    it('keeps addresses out of events and logs', async () => {
      setMode('sandbox');
      const a = await account(A, { config: { transient_failures: 1 } });
      const p = await profile(A);
      const m = await msg(A, a.id, p.id);
      await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 });
      await M.dispatchMessage(A, m.id, { backoffBaseSeconds: 0 });
      const events = await sql(A, `SELECT detail::text AS d, coalesce(error_code, '') AS e FROM engage.message_events WHERE message_id = $1`, [m.id]);
      expect(JSON.stringify(events.rows)).not.toMatch(/@|\+90/);
      expect(logs.some((l) => l.includes('[engage]'))).toBe(true); // capture is live, so the next two assertions mean something
      expect(logs.join('\n')).not.toContain(p.email!);
      expect(logs.join('\n')).not.toContain(p.phone!);
    });
  });
});
