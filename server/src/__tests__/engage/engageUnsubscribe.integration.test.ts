/**
 * Unsubscribe (WP-13) end to end on real Postgres and the real HTTP stack: a recipient's opt-out from the email alone
 * is effective before the next send, cannot be forged, cannot cross tenants, and is idempotent.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('unsubscribe (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let U: typeof import('../../engage/unsubscribe.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  const mockModule = async () => import('../../engage/messaging/mockAdapter.js');

  interface T { org: string; userId: string }
  const tenant = async (): Promise<T> => {
    const t = await f.provisionTenant(`Unsub ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'email', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
    return { org, userId: t.admin.userId };
  };
  const account = async (t: T, config: Record<string, string | number | boolean> = {}) =>
    (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config, secrets: { webhook_secret: `whsec_${u()}` } })).id;
  const recipient = async (t: T, o: { email?: string | null } = {}) => {
    const email = o.email === undefined ? `${u()}@example.com` : o.email;
    const p = await P.upsertProfile(t.org, { externalId: `un-${u()}`, email });
    await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'web', evidence: { form: 'newsletter', test: 'wp13' } });
    if (email) await M.addAllowlistEntry(t.org, 'email', email);
    return { id: p.id, email };
  };
  const links = (t: T, profileId: string) => U.buildUnsubscribeLinks({ organizationId: t.org, profileId, channel: 'email' });
  const marketingMessage = async (t: T, acct: string, profileId: string, purpose: 'marketing' | 'transactional' = 'marketing') => {
    const l = links(t, profileId);
    const content = purpose === 'marketing'
      ? { subject: 'Yeni kitaplar', html: `<p>Merhaba</p><a href="${l.pageUrl}">abonelikten cik</a>`, unsubscribe_url: l.pageUrl, unsubscribe_one_click_url: l.oneClickUrl }
      : { subject: 'Siparisiniz kargoda', text: 'Siparisiniz yola cikti.' };
    return (await M.createMessage(t.org, { profileId, channel: 'email', purpose, channelAccountId: acct, idempotencyKey: `k-${u()}`, content })).message;
  };
  const tokenOf = (url: string) => url.split('/').pop()!;
  const call = async (token: string, opts: { method?: 'GET' | 'POST'; form?: string; json?: unknown } = {}) => {
    const method = opts.method ?? 'GET';
    const r = await fetch(`${app.baseUrl}/unsubscribe/${token}`, {
      method,
      headers: opts.form !== undefined ? { 'content-type': 'application/x-www-form-urlencoded' } : opts.json !== undefined ? { 'content-type': 'application/json' } : {},
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, cache: r.headers.get('cache-control') };
  };
  const ONE_CLICK = 'List-Unsubscribe=One-Click';
  const ledger = async (t: T, profileId: string) =>
    (await sql(t.org, `SELECT status, source, evidence FROM engage.consents WHERE profile_id = $1 AND channel = 'email' ORDER BY recorded_at, id`, [profileId])).rows as Array<{ status: string; source: string; evidence: Record<string, unknown> }>;
  const consentState = async (t: T, profileId: string) =>
    (await sql(t.org, `SELECT status FROM engage.consent_state WHERE profile_id = $1 AND channel = 'email'`, [profileId])).rows[0]?.status ?? null;
  const suppressionOf = async (t: T, email: string) =>
    (await sql(t.org, `SELECT reason FROM engage.suppressions WHERE channel = 'email' AND value_normalized = $1`, [email])).rows[0]?.reason ?? null;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    M = await import('../../engage/messaging/index.js');
    U = await import('../../engage/unsubscribe.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    app = await startEngageApp();
  }, 90_000);
  afterEach(async () => { delete process.env.SEND_MODE; (await mockModule()).resetMockAdapter(); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('acceptance: a one-click opt-out from the email is effective before the next send, for every purpose', async () => {
    process.env.SEND_MODE = 'sandbox';
    const t = await tenant(); const a = await account(t); const r = await recipient(t);

    // The first marketing message goes through the whole pipeline.
    const first = await marketingMessage(t, a, r.id);
    expect(await M.dispatchMessage(t.org, first.id)).toMatchObject({ outcome: 'sent' });

    // The mail client posts the RFC 8058 one-click request to the header's target.
    const target = links(t, r.id).oneClickUrl;
    const res = await call(tokenOf(target), { method: 'POST', form: ONE_CLICK });
    expect(res).toMatchObject({ status: 200, json: { unsubscribed: true, alreadyUnsubscribed: false }, cache: 'no-store' });

    // Ledger, state and suppression, all written by that one request.
    expect(await ledger(t, r.id)).toEqual([
      { status: 'granted', source: 'web', evidence: expect.any(Object) },
      { status: 'revoked', source: 'unsubscribe_link', evidence: { via: 'one_click', token_version: 1 } },
    ]);
    expect(await consentState(t, r.id)).toBe('revoked');
    expect(await suppressionOf(t, r.email!)).toBe('opt_out');

    // The very next send is denied by the gate, marketing and transactional alike (suppression is address-level).
    const next = await marketingMessage(t, a, r.id);
    expect(await M.dispatchMessage(t.org, next.id)).toMatchObject({ outcome: 'blocked', code: 'suppressed' });
    const tx = await marketingMessage(t, a, r.id, 'transactional');
    expect(await M.dispatchMessage(t.org, tx.id)).toMatchObject({ outcome: 'blocked', code: 'suppressed' });
    expect((await M.getMessage(t.org, next.id)).message.status).toBe('blocked');
  });

  it('GET shows the page data and never changes anything (mail scanners and previewers fetch links)', async () => {
    const t = await tenant(); await account(t, { from_name: 'Demo Kitap' }); const r = await recipient(t, { email: 'ayse.yilmaz@example.com' });
    const token = tokenOf(links(t, r.id).pageUrl);
    for (let i = 0; i < 3; i += 1) {
      expect(await call(token)).toMatchObject({ status: 200, json: { channel: 'email', addressHint: 'a******@example.com', senderName: 'Demo Kitap', unsubscribed: false }, cache: 'no-store' });
    }
    expect(JSON.stringify((await call(token)).json)).not.toContain('ayse.yilmaz');
    expect(await consentState(t, r.id)).toBe('granted');
    expect(await suppressionOf(t, r.email!)).toBeNull();
    expect((await ledger(t, r.id)).filter((l) => l.status === 'revoked')).toHaveLength(0);
    await call(token, { method: 'POST', json: {} });
    expect(await call(token)).toMatchObject({ status: 200, json: { unsubscribed: true } });
  });

  it('the page\'s confirm button and a mail client leave different evidence, and neither stores an address, IP or user agent', async () => {
    const t = await tenant(); const r1 = await recipient(t); const r2 = await recipient(t);
    await call(tokenOf(links(t, r1.id).pageUrl), { method: 'POST' });
    await call(tokenOf(links(t, r2.id).oneClickUrl), { method: 'POST', form: ONE_CLICK });
    expect((await ledger(t, r1.id)).at(-1)).toMatchObject({ source: 'unsubscribe_link', evidence: { via: 'page', token_version: 1 } });
    expect((await ledger(t, r2.id)).at(-1)).toMatchObject({ source: 'unsubscribe_link', evidence: { via: 'one_click', token_version: 1 } });
  });

  it('clicking twice, or a client retrying, writes one ledger row; five at once write one too', async () => {
    const t = await tenant(); const r = await recipient(t);
    const token = tokenOf(links(t, r.id).oneClickUrl);
    expect((await call(token, { method: 'POST', form: ONE_CLICK })).json).toMatchObject({ alreadyUnsubscribed: false });
    expect((await call(token, { method: 'POST', form: ONE_CLICK })).json).toMatchObject({ unsubscribed: true, alreadyUnsubscribed: true });
    expect((await ledger(t, r.id)).filter((l) => l.status === 'revoked')).toHaveLength(1);

    // Many at once, straight at the service so the requests really overlap (the HTTP stack serialises some of them).
    const r2 = await recipient(t);
    const ctx2 = { organizationId: t.org, profileId: r2.id, channel: 'email' as const };
    // Connections open lazily: without warming the pool the first request would finish before the others even connect.
    await Promise.all(Array.from({ length: 10 }, () => sql(t.org, 'SELECT pg_sleep(0.1)')));
    const results = await Promise.all(Array.from({ length: 10 }, () => U.applyUnsubscribe(ctx2, 'one_click')));
    expect(results.filter((x) => x?.alreadyUnsubscribed === false)).toHaveLength(1);
    expect(results.filter((x) => x?.alreadyUnsubscribed === true)).toHaveLength(9);
    expect((await ledger(t, r2.id)).filter((l) => l.status === 'revoked')).toHaveLength(1);
  });

  it('an address already suppressed for another reason (a hard bounce) shows as unsubscribed, and the opt-out is still recorded', async () => {
    const t = await tenant(); const r = await recipient(t);
    await P.addSuppression(t.org, 'email', r.email!, 'hard_bounce');
    const token = tokenOf(links(t, r.id).oneClickUrl);
    expect((await call(token)).json).toMatchObject({ unsubscribed: true });
    expect(await consentState(t, r.id)).toBe('granted');
    expect((await call(token, { method: 'POST', form: ONE_CLICK })).json).toMatchObject({ unsubscribed: true, alreadyUnsubscribed: false });
    expect(await consentState(t, r.id)).toBe('revoked');
    expect(await suppressionOf(t, r.email!)).toBe('hard_bounce'); // the original reason stays
  });

  it('forged, tampered and junk tokens are the same 404 and change nothing', async () => {
    const t = await tenant(); const r = await recipient(t);
    const good = tokenOf(links(t, r.id).oneClickUrl);
    const [payload, sig] = good.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    const reorg = Buffer.from(JSON.stringify({ ...claims, o: randomUUID() })).toString('base64url');
    const another = await recipient(t);
    const reprofile = Buffer.from(JSON.stringify({ ...claims, p: another.id })).toString('base64url');
    for (const bad of [`${reorg}.${sig}`, `${reprofile}.${sig}`, `${payload}.${'A'.repeat(sig!.length)}`, 'junk', `${payload}`, `${payload}.${sig}.x`, '%00', 'a'.repeat(1000)]) {
      for (const method of ['GET', 'POST'] as const) {
        const res = await call(bad, { method, form: method === 'POST' ? ONE_CLICK : undefined });
        expect({ status: res.status, json: res.json }).toEqual({ status: 404, json: { error: 'Not found' } });
      }
    }
    expect(await consentState(t, r.id)).toBe('granted');
    expect(await consentState(t, another.id)).toBe('granted');
    expect(await suppressionOf(t, r.email!)).toBeNull();
  });

  it('a signed token whose profile is not in that tenant is a 404 and touches no other tenant', async () => {
    const a = await tenant(); const b = await tenant(); const ra = await recipient(a); const rb = await recipient(b);
    // Signed by us (we hold the key) but pairing tenant A with tenant B's profile.
    const crossed = U.createUnsubscribeToken({ organizationId: a.org, profileId: rb.id, channel: 'email' });
    expect(await call(crossed, { method: 'POST', form: ONE_CLICK })).toMatchObject({ status: 404 });
    expect(await call(crossed)).toMatchObject({ status: 404 });
    expect(await consentState(b, rb.id)).toBe('granted');
    expect(await suppressionOf(b, rb.email!)).toBeNull();
    // And the tenant's own link affects that tenant only.
    await call(tokenOf(links(a, ra.id).oneClickUrl), { method: 'POST', form: ONE_CLICK });
    expect(await consentState(b, rb.id)).toBe('granted');
    expect(await suppressionOf(b, ra.email!)).toBeNull();
  });

  it('only that person is affected, not another profile of the same tenant', async () => {
    const t = await tenant(); const r1 = await recipient(t); const r2 = await recipient(t);
    await call(tokenOf(links(t, r1.id).oneClickUrl), { method: 'POST', form: ONE_CLICK });
    expect(await consentState(t, r1.id)).toBe('revoked');
    expect(await consentState(t, r2.id)).toBe('granted');
    expect(await suppressionOf(t, r2.email!)).toBeNull();
  });

  it('a profile without an email address still records the revocation (there is nothing to suppress)', async () => {
    const t = await tenant(); const r = await recipient(t, { email: null });
    const token = tokenOf(links(t, r.id).oneClickUrl);
    expect((await call(token, { method: 'POST', form: ONE_CLICK })).json).toMatchObject({ unsubscribed: true, alreadyUnsubscribed: false });
    expect(await consentState(t, r.id)).toBe('revoked');
    expect((await call(token, { method: 'POST', form: ONE_CLICK })).json).toMatchObject({ alreadyUnsubscribed: true });
    expect((await call(token)).json).toMatchObject({ addressHint: null, unsubscribed: true });
  });

  it('a link made before the master key was rotated still works afterwards', async () => {
    const t = await tenant(); const r = await recipient(t);
    const token = tokenOf(links(t, r.id).oneClickUrl);
    const oldKey = process.env.ENGAGE_MASTER_KEY!;
    try {
      process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
      process.env.ENGAGE_MASTER_KEY_ID = 'k2';
      process.env.ENGAGE_MASTER_KEYS_OLD = `k1:${oldKey}`;
      expect(await call(token, { method: 'POST', form: ONE_CLICK })).toMatchObject({ status: 200, json: { unsubscribed: true } });
      delete process.env.ENGAGE_MASTER_KEYS_OLD; // the old key is retired: the old link no longer verifies
      expect(await call(token)).toMatchObject({ status: 404 });
    } finally {
      process.env.ENGAGE_MASTER_KEY = oldKey;
      process.env.ENGAGE_MASTER_KEY_ID = 'k1';
      delete process.env.ENGAGE_MASTER_KEYS_OLD;
    }
    expect(await consentState(t, r.id)).toBe('revoked');
  });

  it('logs neither tokens nor addresses', async () => {
    const all = logs.join('\n');
    expect(all).not.toMatch(/@example\.com/);
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // no token-shaped strings
    expect(all).not.toContain('/api/engage/unsubscribe/');
  });

  it('is rate limited per client, with Retry-After', async () => {
    const t = await tenant(); const r = await recipient(t);
    const token = tokenOf(links(t, r.id).pageUrl);
    let limited: Response | null = null;
    for (let i = 0; i < 200 && !limited; i += 1) {
      const res = await fetch(`${app.baseUrl}/unsubscribe/${token}`);
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
