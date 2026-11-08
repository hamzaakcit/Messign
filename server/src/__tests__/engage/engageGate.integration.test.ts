/**
 * The send gate (WP-11), adversarially, on real Postgres through the non-bypass engage role. Each test gets a fresh
 * tenant so budgets, frequency counts and settings never leak between tests.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('send gate (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let M: typeof import('../../engage/messaging/index.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const sendSpies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905000${n++}`; })();
  const UNSUB = 'https://example.com/u/xyz789';
  const VALID: Record<'email' | 'sms', Record<string, unknown>> = {
    email: { subject: 'Hello', html: `<p>Hi</p><a href="${UNSUB}">unsubscribe</a>`, unsubscribe_url: UNSUB },
    sms: { text: 'Yeni kitaplar geldi. Iptal icin IPTAL yazin', sender_id: 'KITAPCI' },
  };
  const setMode = (m: string | undefined) => { if (m === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = m; };
  const spySend = () => { const s = vi.spyOn(mock.mockAdapter, 'send'); sendSpies.push(s); return s; };

  interface T { org: string; userId: string }
  /** A fresh tenant with send_enabled, a 1-TRY rate card per channel and category, and a large budget. */
  const tenant = async (o: { ready?: boolean } = {}): Promise<T> => {
    const t = await f.provisionTenant(`Gate ${u()}`);
    const org = t.organization.id;
    if (o.ready !== false) {
      await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
      for (const channel of ['email', 'sms'] as const) {
        for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel, category, unitCostMinor: 1, currency: 'TRY' });
        await M.setBudgetCap(org, channel, 1_000_000, 'TRY');
      }
    }
    return { org, userId: t.admin.userId };
  };
  const account = async (t: T, over: Partial<import('../../engage/credentials.js').CreateInput> = {}) =>
    (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` }, ...over })).id;
  const profile = async (t: T, o: { email?: string | null; consent?: Array<'email' | 'sms'>; list?: boolean } = {}) => {
    const email = o.email === undefined ? `${u()}@example.com` : o.email;
    const phone = phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `g-${u()}`, email, phone });
    for (const ch of o.consent ?? []) await P.recordConsent(t.org, p.id, { channel: ch, status: 'granted', source: 'api', evidence: { test: 'wp11' } });
    if (o.list !== false) {
      if (email) await M.addAllowlistEntry(t.org, 'email', email);
      await M.addAllowlistEntry(t.org, 'sms', phone);
    }
    return { id: p.id, email, phone };
  };
  const msg = async (t: T, acct: string, profileId: string, over: Partial<import('../../engage/messaging/messages.js').CreateMessageInput> = {}) =>
    (await M.createMessage(t.org, { profileId, channel: 'email', purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, content: VALID[(over.channel ?? 'email') as 'email' | 'sms'], ...over })).message;
  const decisions = async (t: T, messageId: string) =>
    (await sql(t.org, `SELECT id, decision, code, reasons, cost_estimate_minor::int AS cost, retry_at FROM engage.send_decisions WHERE message_id = $1 ORDER BY id`, [messageId])).rows;
  const codes = (reasons: Array<{ code: string }>) => reasons.map((r) => r.code);
  const status = async (t: T, id: string) => (await M.getMessage(t.org, id)).message.status;
  /** A ready tenant, a test account and one sendable message: the common starting point. */
  const ready = async (over: Partial<import('../../engage/messaging/messages.js').CreateMessageInput> = {}, profileOpts: Parameters<typeof profile>[1] = {}) => {
    const t = await tenant();
    const a = await account(t);
    const p = await profile(t, profileOpts);
    const m = await msg(t, a, p.id, over);
    return { t, a, p, m };
  };

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
  }, 90_000);
  afterEach(() => { setMode(undefined); mock.resetMockAdapter(); sendSpies.splice(0).forEach((s) => s.mockRestore()); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  describe('kill switches', () => {
    it('SEND_MODE off (unset, empty, a typo): zero adapter calls and no decision rows', async () => {
      const send = spySend();
      const { t, m } = await ready();
      for (const v of [undefined, '', 'off', 'Sandbox', 'LIVE', '1']) {
        setMode(v);
        expect(await M.dispatchMessage(t.org, m.id)).toEqual({ outcome: 'held', code: 'send_mode_off' });
        expect(await M.dispatchDue(t.org)).toEqual({ held: 1 });
      }
      expect(send).not.toHaveBeenCalled();
      expect(await decisions(t, m.id)).toEqual([]);
      expect(await status(t, m.id)).toBe('queued');
    });

    it('tenant send_enabled false (or no settings row) holds that tenant only, without a decision row', async () => {
      setMode('sandbox');
      const send = spySend();
      const off = await ready();
      const on = await ready();
      await sql(off.t.org, `UPDATE engage.tenant_settings SET send_enabled = false WHERE organization_id = $1`, [off.t.org]);
      expect(await M.dispatchMessage(off.t.org, off.m.id)).toEqual({ outcome: 'held', code: 'tenant_send_disabled' });
      expect(await decisions(off.t, off.m.id)).toEqual([]);
      expect((await M.dispatchMessage(on.t.org, on.m.id)).outcome).toBe('sent');
      expect(send).toHaveBeenCalledTimes(1);
      await sql(off.t.org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [off.t.org]);
      expect((await M.dispatchMessage(off.t.org, off.m.id)).outcome).toBe('sent');
    });

    it('switching SEND_MODE off mid-batch stops the batch at the next message', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      for (let i = 0; i < 20; i++) await msg(t, a, (await profile(t)).id);
      let calls = 0;
      const real = mock.mockAdapter.send.bind(mock.mockAdapter);
      const send = spySend();
      send.mockImplementation(async (req, acct) => { if (++calls === 3) setMode('off'); return real(req, acct); });
      expect(await M.dispatchDue(t.org, 1000)).toEqual({ sent: 3, held: 17 });
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('switching the tenant off mid-batch stops the batch at the next message', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      for (let i = 0; i < 12; i++) await msg(t, a, (await profile(t)).id);
      let calls = 0;
      const real = mock.mockAdapter.send.bind(mock.mockAdapter);
      const send = spySend();
      send.mockImplementation(async (req, acct) => {
        if (++calls === 2) await sql(t.org, `UPDATE engage.tenant_settings SET send_enabled = false WHERE organization_id = $1`, [t.org]);
        return real(req, acct);
      });
      expect(await M.dispatchDue(t.org, 1000)).toEqual({ sent: 2, held: 10 });
    });

    it('a message held past its expiry is denied, not sent late', async () => {
      setMode('sandbox');
      const { t, m } = await ready({ ttlSeconds: 60 });
      const later = await M.evaluateGate(t.org, m.id, { now: new Date(Date.now() + 120_000) });
      expect(later).toMatchObject({ kind: 'deny', code: 'expired' });
      expect((await M.evaluateGate(t.org, m.id)).kind).toBe('allow');
    });
  });

  describe('accounts and channels', () => {
    it('denies a message whose account was disabled after the message was created', async () => {
      setMode('sandbox');
      const { t, a, m } = await ready();
      await creds.disableAccount(t.org, a);
      expect(await M.dispatchMessage(t.org, m.id)).toEqual({ outcome: 'blocked', code: 'account_inactive' });
    });

    it('an allow-list entry is per channel even where channels share an address (sms and whatsapp share the phone)', async () => {
      setMode('sandbox');
      const t = await tenant();
      const smsAcct = await account(t, { channel: 'sms' });
      const p = await profile(t, { list: false });
      await M.addAllowlistEntry(t.org, 'whatsapp', p.phone);
      expect(await M.dispatchMessage(t.org, (await msg(t, smsAcct, p.id, { channel: 'sms' })).id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });
      await M.addAllowlistEntry(t.org, 'sms', p.phone);
      expect((await M.dispatchMessage(t.org, (await msg(t, smsAcct, p.id, { channel: 'sms' })).id)).outcome).toBe('sent');
    });
  });

  describe('the decision ledger', () => {
    it('writes an allow decision BEFORE the provider is called, and links the claim to it', async () => {
      setMode('sandbox');
      const { t, m } = await ready();
      const real = mock.mockAdapter.send.bind(mock.mockAdapter);
      const send = spySend();
      const seen: unknown[] = [];
      send.mockImplementation(async (req, acct) => { seen.push(...(await decisions(t, m.id))); return real(req, acct); });
      expect((await M.dispatchMessage(t.org, m.id)).outcome).toBe('sent');
      expect(seen).toMatchObject([{ decision: 'allow', code: 'allowed', cost: 1 }]);
      const sending = (await M.getMessage(t.org, m.id)).events.find((e) => e.type === 'sending');
      const detail = (await sql(t.org, `SELECT detail FROM engage.message_events WHERE id = $1`, [sending!.id])).rows[0].detail;
      expect(String(detail.decision_id)).toBe(String((seen[0] as { id: string }).id));
    });

    it('records every failing rule, in rule order, and never an address', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      const p = await profile(t, { list: false });
      await P.addSuppression(t.org, 'email', p.email!, 'complaint');
      const m = await msg(t, a, p.id, { purpose: 'marketing', content: { subject: 'x', html: 'no link' } });
      const res = await M.dispatchMessage(t.org, m.id);
      expect(res).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });
      const [d] = await decisions(t, m.id);
      expect(d).toMatchObject({ decision: 'deny', code: 'not_allowlisted' });
      expect(codes(d.reasons)).toEqual(['not_allowlisted', 'suppressed', 'no_consent', 'content_no_unsubscribe']);
      expect(JSON.stringify(d.reasons)).not.toMatch(/@|\+90/);
      const blocked = (await M.getMessage(t.org, m.id)).events.find((e) => e.type === 'blocked');
      expect(blocked?.errorCode).toBe('not_allowlisted');
    });

    it('is append-only, and only the gate writes it (claim refuses a missing, denied, stale or foreign decision)', async () => {
      const { t, a, p, m } = await ready();
      const claim = (decisionId: string | number, id = m.id) => sql(t.org, `SELECT engage.claim_message($1, $2, interval '5 minutes', $3) AS ok`, [t.org, id, decisionId]);
      await expect(claim(999999999)).rejects.toThrow(/no recent allow decision/);
      const deny = (await sql(t.org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'deny', 'suppressed', 'sandbox') RETURNING id`, [t.org, m.id])).rows[0].id;
      await expect(claim(deny)).rejects.toThrow(/no recent allow decision/);
      const stale = (await sql(t.org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode, created_at) VALUES ($1, $2, 'allow', 'allowed', 'sandbox', now() - interval '3 minutes') RETURNING id`, [t.org, m.id])).rows[0].id;
      await expect(claim(stale)).rejects.toThrow(/no recent allow decision/);
      const other = await msg(t, a, p.id);
      const forOther = (await sql(t.org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'allow', 'allowed', 'sandbox') RETURNING id`, [t.org, other.id])).rows[0].id;
      await expect(claim(forOther)).rejects.toThrow(/no recent allow decision/);
      const t2 = await tenant();
      const m2 = await msg(t2, await account(t2), (await profile(t2)).id);
      const foreign = (await sql(t2.org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'allow', 'allowed', 'sandbox') RETURNING id`, [t2.org, m2.id])).rows[0].id;
      await expect(claim(foreign)).rejects.toThrow(/no recent allow decision/);
      expect(await status(t, m.id)).toBe('queued');
      await expect(sql(t.org, `UPDATE engage.send_decisions SET decision = 'allow' WHERE id = $1`, [deny])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.send_decisions WHERE id = $1`, [deny])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, send_mode) VALUES ($1, $2, 'allow', 'suppressed', 'sandbox')`, [t.org, m.id])).rejects.toThrow(/check constraint/);
    });

    it('freezes a cost reservation once the gate has made it', async () => {
      setMode('sandbox');
      const { t, m } = await ready();
      expect((await M.evaluateGate(t.org, m.id)).kind).toBe('allow');
      await expect(sql(t.org, `UPDATE engage.messages SET cost_estimate_minor = 0 WHERE id = $1`, [m.id])).rejects.toThrow(/cost reservation cannot be changed/);
      await expect(sql(t.org, `UPDATE engage.messages SET gate_allowed_at = now() - interval '40 days' WHERE id = $1`, [m.id])).rejects.toThrow(/cost reservation cannot be changed/);
      await expect(sql(t.org, `UPDATE engage.messages SET status = 'queued' WHERE id = $1`, [m.id])).rejects.toThrow(/permission denied/);
    });

    it('fails closed: a broken setting records a gate_error denial and nothing is sent', async () => {
      setMode('sandbox');
      const send = spySend();
      const { t, m } = await ready();
      await f.admin.query(`UPDATE engage.tenant_settings SET timezone = 'Mars/Olympus_Mons' WHERE organization_id = $1`, [t.org]);
      expect(await M.dispatchMessage(t.org, m.id)).toEqual({ outcome: 'blocked', code: 'gate_error' });
      expect(send).not.toHaveBeenCalled();
      expect(await decisions(t, m.id)).toMatchObject([{ decision: 'deny', code: 'gate_error' }]);
    });
  });

  describe('consent and suppression', () => {
    it('denies marketing without consent, and when consent is revoked after the message was created', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      const none = await profile(t);
      expect(await M.dispatchMessage(t.org, (await msg(t, a, none.id, { purpose: 'marketing' })).id)).toEqual({ outcome: 'blocked', code: 'no_consent' });
      const revoked = await profile(t, { consent: ['email'] });
      const m = await msg(t, a, revoked.id, { purpose: 'marketing' });
      await P.recordConsent(t.org, revoked.id, { channel: 'email', status: 'revoked', source: 'api' });
      expect(await M.dispatchMessage(t.org, m.id)).toEqual({ outcome: 'blocked', code: 'no_consent' });
      const smsOnly = await profile(t, { consent: ['sms'] });
      expect(await M.dispatchMessage(t.org, (await msg(t, a, smsOnly.id, { purpose: 'marketing' })).id)).toEqual({ outcome: 'blocked', code: 'no_consent' });
      const granted = await profile(t, { consent: ['email'] });
      expect((await M.dispatchMessage(t.org, (await msg(t, a, granted.id, { purpose: 'marketing' })).id)).outcome).toBe('sent');
    });

    it('denies a retry after consent is revoked between attempts', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t, { config: { transient_failures: 1 } });
      const p = await profile(t, { consent: ['email'] });
      const m = await msg(t, a, p.id, { purpose: 'marketing' });
      expect((await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('retry_scheduled');
      await P.recordConsent(t.org, p.id, { channel: 'email', status: 'revoked', source: 'api' });
      expect(await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).toEqual({ outcome: 'blocked', code: 'no_consent' });
    });

    it('denies a suppressed address even when it now belongs to a new profile, for every purpose', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      const old = await profile(t, { consent: ['email'] });
      await P.addSuppression(t.org, 'email', old.email!, 'hard_bounce');
      await sql(t.org, `UPDATE engage.identifiers SET is_active = false, deactivated_at = now() WHERE profile_id = $1 AND type = 'email'`, [old.id]);
      const fresh = await P.upsertProfile(t.org, { externalId: `new-${u()}`, email: old.email!.toUpperCase() });
      await P.recordConsent(t.org, fresh.id, { channel: 'email', status: 'granted', source: 'api', evidence: { test: 'wp11' } });
      for (const purpose of ['transactional', 'marketing'] as const) {
        expect(await M.dispatchMessage(t.org, (await msg(t, a, fresh.id, { purpose })).id)).toEqual({ outcome: 'blocked', code: 'suppressed' });
      }
    });
  });

  describe('sandbox allow-list', () => {
    it('denies a recipient who is not allow-listed, removed, listed on another channel, or listed by another tenant', async () => {
      setMode('sandbox');
      const send = spySend();
      const t = await tenant();
      const a = await account(t);
      const unlisted = await profile(t, { list: false });
      expect(await M.dispatchMessage(t.org, (await msg(t, a, unlisted.id)).id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });

      const removed = await profile(t, { list: false });
      const entry = await M.addAllowlistEntry(t.org, 'email', removed.email!);
      expect(await M.removeAllowlistEntry(t.org, entry.id)).toBe(true);
      expect(await M.dispatchMessage(t.org, (await msg(t, a, removed.id)).id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });

      const smsListed = await profile(t, { list: false });
      await M.addAllowlistEntry(t.org, 'sms', smsListed.phone);
      expect(await M.dispatchMessage(t.org, (await msg(t, a, smsListed.id)).id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });

      const other = await tenant();
      const listedElsewhere = await profile(t, { list: false });
      await M.addAllowlistEntry(other.org, 'email', listedElsewhere.email!);
      expect(await M.dispatchMessage(t.org, (await msg(t, a, listedElsewhere.id)).id)).toEqual({ outcome: 'blocked', code: 'not_allowlisted' });
      expect(send).not.toHaveBeenCalled();

      const listed = await profile(t, { list: false });
      await M.addAllowlistEntry(t.org, 'email', `  ${listed.email!.toUpperCase()} `); // normalised the same way as identifiers
      expect((await M.dispatchMessage(t.org, (await msg(t, a, listed.id)).id)).outcome).toBe('sent');
    });

    it('does not apply in live mode, where readiness and a live account are required instead', async () => {
      setMode('live');
      const t = await tenant();
      const live = await account(t, { mode: 'live' });
      const p = await profile(t, { list: false });
      const m = await msg(t, live, p.id);
      const first = await M.evaluateGate(t.org, m.id);
      expect(first).toMatchObject({ kind: 'deny', code: 'readiness_missing' });
      expect(first.kind === 'deny' && first.reasons[0]).toEqual({ rule: 'readiness', code: 'readiness_missing', missing: ['dpa_signed', 'email_domain_authenticated'] });
      expect(first.kind === 'deny' && codes(first.reasons)).not.toContain('not_allowlisted');
      for (const item of ['dpa_signed', 'email_domain_authenticated']) {
        await sql(t.org, `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'email', $2, 'yes')`, [t.org, item]);
      }
      await sql(t.org, `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'sms', 'dpa_signed', 'yes')`, [t.org]);
      const m2 = await msg(t, live, p.id);
      expect((await M.evaluateGate(t.org, m2.id)).kind).toBe('allow');
      // readiness is per channel: email readiness does not make sms ready
      const smsLive = await account(t, { channel: 'sms', mode: 'live', config: { sender_id: 'KITAPCI' } });
      const m3 = await msg(t, smsLive, p.id, { channel: 'sms' });
      const r3 = await M.evaluateGate(t.org, m3.id);
      expect(r3.kind === 'deny' && r3.reasons[0]).toEqual({ rule: 'readiness', code: 'readiness_missing', missing: ['btk_sender_id', 'iys_brand_code'] });
      for (const item of ['btk_sender_id', 'iys_brand_code']) {
        await sql(t.org, `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'whatsapp', $2, 'yes')`, [t.org, item]);
      }
      const r4 = await M.evaluateGate(t.org, (await msg(t, smsLive, p.id, { channel: 'sms' })).id);
      expect(r4.kind === 'deny' && r4.reasons[0]).toEqual({ rule: 'readiness', code: 'readiness_missing', missing: ['btk_sender_id', 'iys_brand_code'] });
    });
  });

  describe('budget and rate cards', () => {
    it('allows exactly up to the monthly cap and denies the next message', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.setBudgetCap(t.org, 'email', 3, 'TRY');
      const a = await account(t);
      for (let i = 0; i < 3; i++) expect((await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t)).id)).id)).outcome).toBe('sent');
      const fourth = await msg(t, a, (await profile(t)).id);
      expect(await M.dispatchMessage(t.org, fourth.id)).toEqual({ outcome: 'blocked', code: 'budget_exceeded' });
      expect((await decisions(t, fourth.id))[0].reasons).toEqual([{ rule: 'budget', code: 'budget_exceeded', spent_minor: '3', estimate_minor: '1', cap_minor: '3' }]);
      // other channels have their own cap
      await M.setBudgetCap(t.org, 'sms', 1, 'TRY'); // email has spent 3; sms spend is counted separately
      const smsAcct = await account(t, { channel: 'sms' });
      expect((await M.dispatchMessage(t.org, (await msg(t, smsAcct, (await profile(t)).id, { channel: 'sms' })).id)).outcome).toBe('sent');
      expect(await M.dispatchMessage(t.org, (await msg(t, smsAcct, (await profile(t)).id, { channel: 'sms' })).id)).toEqual({ outcome: 'blocked', code: 'budget_exceeded' });
    });

    it('never overshoots the cap under concurrency', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.setBudgetCap(t.org, 'email', 5, 'TRY');
      const a = await account(t);
      const ms = await Promise.all(Array.from({ length: 15 }, async () => msg(t, a, (await profile(t)).id)));
      const out = await Promise.all(ms.map((m) => M.dispatchMessage(t.org, m.id)));
      expect(out.filter((o) => o.outcome === 'sent')).toHaveLength(5);
      expect(out.filter((o) => o.outcome === 'blocked' && o.code === 'budget_exceeded')).toHaveLength(10);
    });

    it('counts a retried message once, and does not count blocked or never-sent failed messages', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.setBudgetCap(t.org, 'email', 2, 'TRY');
      const hard = await account(t, { config: { permanent_failure: true } });
      expect((await M.dispatchMessage(t.org, (await msg(t, hard, (await profile(t)).id)).id)).outcome).toBe('failed');
      const a = await account(t);
      expect((await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t, { list: false })).id)).id)).outcome).toBe('blocked');
      const flaky = await account(t, { config: { transient_failures: 2 } });
      const m = await msg(t, flaky, (await profile(t)).id);
      for (let i = 0; i < 2; i++) expect((await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('retry_scheduled');
      expect((await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('sent');
      expect((await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t)).id)).id)).outcome).toBe('sent'); // 2 of 2
      expect(await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t)).id)).id)).toEqual({ outcome: 'blocked', code: 'budget_exceeded' });
    });

    it('a retry keeps its first reservation: allowed under a cap of 1, and at the old price after a rate change', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.setBudgetCap(t.org, 'email', 1, 'TRY');
      const flaky = await account(t, { config: { transient_failures: 1 } });
      const m = await msg(t, flaky, (await profile(t)).id);
      expect((await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('retry_scheduled');
      await M.addRateCard(t.org, { channel: 'email', category: 'transactional', unitCostMinor: 50, currency: 'TRY' });
      await M.setBudgetCap(t.org, 'email', 1, 'TRY');
      expect((await M.dispatchMessage(t.org, m.id, { backoffBaseSeconds: 0 })).outcome).toBe('sent');
      expect((await decisions(t, m.id)).map((d) => d.cost)).toEqual([1, 1]);
    });

    it('starts a new budget each month in the tenant time zone', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.setBudgetCap(t.org, 'email', 1, 'TRY');
      const a = await account(t);
      const lastMonth = await msg(t, a, (await profile(t)).id);
      await sql(t.org, `UPDATE engage.messages SET gate_allowed_at = date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul' - interval '1 second',
        cost_estimate_minor = 1, currency = 'TRY' WHERE id = $1`, [lastMonth.id]);
      expect((await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t)).id)).id)).outcome).toBe('sent');
      expect(await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t)).id)).id)).toEqual({ outcome: 'blocked', code: 'budget_exceeded' });
    });

    it('fails closed without a rate card, without a cap, or with mismatched currencies; uses the latest card in effect', async () => {
      setMode('sandbox');
      const t = await tenant({ ready: false });
      await sql(t.org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [t.org]);
      const a = await account(t);
      const r1 = await M.evaluateGate(t.org, (await msg(t, a, (await profile(t)).id)).id);
      expect(r1.kind === 'deny' && codes(r1.reasons)).toEqual(['no_rate_card', 'no_budget_cap']);
      await M.addRateCard(t.org, { channel: 'email', category: 'transactional', unitCostMinor: 5, currency: 'EUR' });
      await M.setBudgetCap(t.org, 'email', 100, 'TRY');
      expect(await M.evaluateGate(t.org, (await msg(t, a, (await profile(t)).id)).id)).toMatchObject({ kind: 'deny', code: 'currency_mismatch' });
      await M.addRateCard(t.org, { channel: 'email', category: 'transactional', unitCostMinor: 7, currency: 'TRY' });
      await M.addRateCard(t.org, { channel: 'email', category: 'transactional', unitCostMinor: 999, currency: 'TRY', effectiveFrom: new Date(Date.now() + 86_400_000) });
      const m = await msg(t, a, (await profile(t)).id);
      expect((await M.evaluateGate(t.org, m.id)).kind).toBe('allow');
      expect((await decisions(t, m.id))[0].cost).toBe(7);
      // the marketing rate is separate from the transactional one
      const mk = await msg(t, a, (await profile(t, { consent: ['email'] })).id, { purpose: 'marketing' });
      expect(await M.evaluateGate(t.org, mk.id)).toMatchObject({ kind: 'deny', code: 'no_rate_card' });
    });
  });

  describe('quiet hours and frequency cap (marketing only)', () => {
    // Instants are built on tomorrow's date, so they are always after the rate cards' creation and never go stale.
    const tomorrow = (() => { const d = new Date(Date.now() + 86_400_000); return d.toISOString().slice(0, 10); })();
    const dayAfter = new Date(Date.parse(`${tomorrow}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00Z`);

    it('defers marketing inside quiet hours to the end of the window, and lets transactional through', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.updateGateSettings(t.org, { timezone: 'Europe/Istanbul', quietHoursStart: '21:00', quietHoursEnd: '09:00' });
      const a = await account(t);
      const p = await profile(t, { consent: ['email'] });
      const mk = await msg(t, a, p.id, { purpose: 'marketing', ttlSeconds: 4 * 86400 });
      const night = await M.evaluateGate(t.org, mk.id, { now: at(tomorrow, '20:30') }); // 23:30 in Istanbul (UTC+3, no DST)
      expect(night).toMatchObject({ kind: 'defer', code: 'quiet_hours' });
      expect(night.kind === 'defer' && night.retryAt.toISOString()).toBe(at(dayAfter, '06:00').toISOString());
      expect((await M.evaluateGate(t.org, mk.id, { now: at(dayAfter, '05:30') })).kind).toBe('defer'); // 08:30
      expect((await M.evaluateGate(t.org, mk.id, { now: at(dayAfter, '06:00') })).kind).toBe('allow'); // 09:00
      const tx = await msg(t, a, p.id, { ttlSeconds: 4 * 86400 });
      expect((await M.evaluateGate(t.org, tx.id, { now: at(tomorrow, '20:30') })).kind).toBe('allow');
    });

    it('a deferred message stays queued, untouched by the adapter, until the window ends', async () => {
      setMode('sandbox');
      const send = spySend();
      const t = await tenant();
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      const pad = (n: number) => String(n % 24).padStart(2, '0');
      await M.updateGateSettings(t.org, { quietHoursStart: `${pad(h)}:00`, quietHoursEnd: `${pad(h + 2)}:00` });
      const a = await account(t);
      const m = await msg(t, a, (await profile(t, { consent: ['email'] })).id, { purpose: 'marketing' });
      const res = await M.dispatchMessage(t.org, m.id);
      expect(res.outcome).toBe('deferred');
      expect(send).not.toHaveBeenCalled();
      const got = (await M.getMessage(t.org, m.id)).message;
      expect(got.status).toBe('queued');
      expect(new Date(got.nextAttemptAt).getTime()).toBe(res.outcome === 'deferred' ? res.retryAt.getTime() : 0);
      expect(await M.listDueMessageIds(t.org)).not.toContain(m.id);
    });

    it('denies (does not defer) when quiet hours coincide with a final reason', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.updateGateSettings(t.org, { quietHoursStart: '00:00', quietHoursEnd: '23:59' });
      const a = await account(t);
      const m = await msg(t, a, (await profile(t)).id, { purpose: 'marketing' }); // no consent
      const r = await M.evaluateGate(t.org, m.id, { now: at(tomorrow, '09:00') });
      expect(r).toMatchObject({ kind: 'deny', code: 'no_consent' });
      expect(r.kind === 'deny' && codes(r.reasons)).toEqual(['no_consent', 'quiet_hours']);
    });

    it('treats the end of a same-day window as outside it', async () => {
      const t = await tenant({ ready: false });
      const q = async (iso: string) => (await sql(t.org, `SELECT engage.quiet_hours_end($1, 'UTC', '10:00', '12:00') AS e`, [iso])).rows[0].e;
      expect(await q('2026-06-01T09:59:59Z')).toBeNull();
      expect((await q('2026-06-01T10:00:00Z')).toISOString()).toBe('2026-06-01T12:00:00.000Z');
      expect((await q('2026-06-01T11:59:59Z')).toISOString()).toBe('2026-06-01T12:00:00.000Z');
      expect(await q('2026-06-01T12:00:00Z')).toBeNull();
    });

    it('matches a reference implementation for random instants, windows and time zones (property test)', async () => {
      let seed = 12345;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const tzs = ['Europe/Istanbul', 'America/New_York', 'Europe/London', 'Asia/Kolkata'];
      const localMinutes = (d: Date, tz: string) => {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
        return Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
      };
      const t = await tenant({ ready: false });
      for (let i = 0; i < 300; i++) {
        const tz = tzs[Math.floor(rnd() * tzs.length)]!;
        const s = Math.floor(rnd() * 24 * 4) * 15;
        let e = Math.floor(rnd() * 24 * 4) * 15;
        if (e === s) e = (s + 60) % 1440;
        const instant = new Date(Date.UTC(2026, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60)));
        const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const r = (await sql(t.org, 'SELECT engage.quiet_hours_end($1, $2, $3::time, $4::time) AS e', [instant, tz, hm(s), hm(e)])).rows[0].e as Date | null;
        const lm = localMinutes(instant, tz);
        const inside = s < e ? lm >= s && lm < e : lm >= s || lm < e;
        expect(r !== null, `${instant.toISOString()} ${tz} ${hm(s)}-${hm(e)}`).toBe(inside);
        if (r) {
          expect(r.getTime()).toBeGreaterThan(instant.getTime());
          expect(r.getTime() - instant.getTime()).toBeLessThanOrEqual(25 * 3600_000); // a DST day can be 25 h
          expect(localMinutes(r, tz)).toBe(e);
        }
      }
    });

    it('caps marketing per profile and channel in the rolling window; transactional is not capped', async () => {
      setMode('sandbox');
      const t = await tenant();
      await M.updateGateSettings(t.org, { frequencyCapMax: 2, frequencyCapWindowHours: 24 });
      const a = await account(t);
      const p = await profile(t, { consent: ['email', 'sms'] });
      expect((await M.dispatchMessage(t.org, (await msg(t, a, p.id)).id)).outcome).toBe('sent'); // transactional does not count
      const hard = await account(t, { config: { permanent_failure: true } });
      expect((await M.dispatchMessage(t.org, (await msg(t, hard, p.id, { purpose: 'marketing' })).id)).outcome).toBe('failed'); // never accepted: does not count
      for (let i = 0; i < 2; i++) expect((await M.dispatchMessage(t.org, (await msg(t, a, p.id, { purpose: 'marketing' })).id)).outcome).toBe('sent');
      const third = await msg(t, a, p.id, { purpose: 'marketing' });
      expect(await M.dispatchMessage(t.org, third.id)).toEqual({ outcome: 'blocked', code: 'frequency_cap' });
      expect((await decisions(t, third.id))[0].reasons).toEqual([{ rule: 'frequency', code: 'frequency_cap', recent: 2, max: 2 }]);
      expect((await M.dispatchMessage(t.org, (await msg(t, a, p.id)).id)).outcome).toBe('sent'); // transactional
      const smsAcct = await account(t, { channel: 'sms' });
      expect((await M.dispatchMessage(t.org, (await msg(t, smsAcct, p.id, { channel: 'sms', purpose: 'marketing' })).id)).outcome).toBe('sent'); // other channel
      expect((await M.dispatchMessage(t.org, (await msg(t, a, (await profile(t, { consent: ['email'] })).id, { purpose: 'marketing' })).id)).outcome).toBe('sent'); // other profile
      // 25 hours later the earlier messages are outside the window (reservations are frozen, so move the clock instead)
      const later = await msg(t, a, p.id, { purpose: 'marketing', ttlSeconds: 2 * 86400 });
      expect((await M.evaluateGate(t.org, later.id, { now: new Date(Date.now() + 25 * 3600_000) })).kind).toBe('allow');
    });
  });

  describe('content checks', () => {
    it('denies marketing email without a visible unsubscribe link, and SMS without a valid sender or opt-out text', async () => {
      setMode('sandbox');
      const t = await tenant();
      const a = await account(t);
      const smsAcct = await account(t, { channel: 'sms' });
      const p = await profile(t, { consent: ['email', 'sms'] });
      const deny = async (over: Partial<import('../../engage/messaging/messages.js').CreateMessageInput>) => {
        const r = await M.evaluateGate(t.org, (await msg(t, over.channel === 'sms' ? smsAcct : a, p.id, over)).id);
        return r.kind === 'deny' ? codes(r.reasons) : [];
      };
      expect(await deny({ purpose: 'marketing', content: { subject: 's', html: '<p>hi</p>', unsubscribe_url: UNSUB } })).toEqual(['content_no_unsubscribe']);
      expect(await deny({ purpose: 'marketing', content: { subject: 's', html: `<a href="${UNSUB.replace('https', 'http')}">x</a>`, unsubscribe_url: UNSUB.replace('https', 'http') } })).toEqual(['content_no_unsubscribe']);
      expect(await deny({ content: { html: '<p>hi</p>' } })).toEqual(['content_missing_subject']);
      expect(await deny({ channel: 'sms', purpose: 'marketing', content: { text: 'Kampanya basladi', sender_id: 'KITAPCI' } })).toEqual(['content_no_opt_out']);
      expect(await deny({ channel: 'sms', content: { text: 'Siparisiniz kargoda' } })).toEqual(['sender_id_invalid']);
      expect(await deny({ channel: 'sms', content: { text: 'Siparisiniz kargoda', sender_id: 'AB' } })).toEqual(['sender_id_invalid']);
      expect(await deny({ channel: 'sms', content: { text: 'Siparisiniz kargoda', sender_id: 'TOOLONGSENDER' } })).toEqual(['sender_id_invalid']);
      const ok = await account(t, { channel: 'sms', config: { sender_id: 'KITAPCI' } });
      expect((await M.evaluateGate(t.org, (await msg(t, ok, p.id, { channel: 'sms', content: { text: 'Siparisiniz kargoda' } })).id)).kind).toBe('allow');
    });
  });

  it('keeps addresses out of logs', async () => {
    setMode('sandbox');
    const { t, p, m } = await ready({}, { list: false });
    await M.dispatchMessage(t.org, m.id);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toContain(p.email!);
  });
});
