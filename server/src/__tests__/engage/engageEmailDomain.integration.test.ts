/**
 * The email domain authentication check (migration 131, WP-39) on real Postgres and the real HTTP stack, with a fake DNS
 * resolver. Acceptance: a domain with SPF, a named DKIM selector and DMARC marks the readiness item and records the
 * evidence; a domain missing any of them clears the item; the item cannot be recorded by hand; a pass that is too old
 * does not count in live mode; only an admin runs it; one tenant's check never reaches another; the evidence is
 * append-only; and no record text reaches the logs.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageEmailDomain.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const TXT_SECRET = 'v=spf1 include:records-that-must-not-be-logged.example ~all';
const GOOD: Record<string, string[][]> = {
  'shop.example': [[TXT_SECRET]],
  '_dmarc.shop.example': [['v=DMARC1; p=none; rua=mailto:reports@shop.example']],
};
const CNAMES: Record<string, string[]> = { 's1._domainkey.shop.example': ['s1.dkim.provider.example'] };

describe.skipIf(!adminUrl)('email domain check (real Postgres, HTTP, fake DNS)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let D: typeof import('../../engage/settings/emailDomain.js');
  let C: typeof import('../../engage/campaigns/campaigns.js');
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  const realResolver = () => D.emailDomainDeps.resolver;
  let original: ReturnType<typeof realResolver>;
  const u = () => Math.random().toString(36).slice(2, 10);
  /** The JSON of a response is untyped; these read the parts the tests assert on. */
  interface Res { json: Record<string, unknown> }
  const lastCheck = (r: Res) => r.json.lastCheck as { passed: boolean; dkim: Array<{ selector: string; ok: boolean; code: string }> };
  const firstIssuePath = (r: Res) => (r.json.issues as Array<{ path: string }>)[0]?.path;
  const accountDomain = (r: Res) => (r.json.account as { domain: string | null }).domain;
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  const dnsError = (code: string) => Object.assign(new Error(code), { code });
  /** A resolver over fixed answers; `onFirstLookup` runs once, before the first answer. */
  function fake(txt: Record<string, string[][]>, cname: Record<string, string[]> = {}, onFirstLookup?: () => Promise<void>) {
    let first = true;
    const once = async () => { if (first && onFirstLookup) { first = false; await onFirstLookup(); } };
    return {
      resolveTxt: async (n: string) => { await once(); const v = txt[n]; if (!v) throw dnsError('ENODATA'); return v; },
      resolveCname: async (n: string) => { await once(); const v = cname[n]; if (!v) throw dnsError('ENODATA'); return v; },
    };
  }
  const useDns = (txt: Record<string, string[][]>, cname: Record<string, string[]> = CNAMES, onFirst?: () => Promise<void>) => { D.emailDomainDeps.resolver = fake(txt, cname, onFirst); };

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(o: { account?: string | null } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Domain ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    const tn = { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
    if (o.account !== null) await account(tn, o.account ?? 'news@shop.example');
    return tn;
  }
  const account = async (t: Tn, fromAddress: string) =>
    (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: { from_address: fromAddress }, secrets: { webhook_secret: `whsec_${u()}` } })).id;
  const check = (t: Tn, body?: unknown, who: 'admin' | 'member' = 'admin') => app.http('/settings/email-domain/check', { method: 'POST', token: t[who], body: body ?? {} });
  /** The throttle is per tenant; evidence rows are append-only, so the test pool ages them the way a wait would. */
  const age = (t: Tn) => f.admin.query(`UPDATE engage.email_domain_checks SET checked_at = checked_at - interval '1 minute' WHERE organization_id = $1`, [t.org]);
  const item = async (t: Tn) => (await sql(t.org, `SELECT value, recorded_at FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = 'email_domain_authenticated'`, [t.org])).rows[0];
  const checkRows = async (t: Tn) => (await sql(t.org, `SELECT passed, domain, dkim_selectors FROM engage.email_domain_checks WHERE organization_id = $1 ORDER BY checked_at`, [t.org])).rows;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); }));
    }
    creds = await import('../../engage/credentials.js');
    D = await import('../../engage/settings/emailDomain.js');
    C = await import('../../engage/campaigns/campaigns.js');
    original = D.emailDomainDeps.resolver;
    app = await startEngageApp();
  }, 90_000);
  beforeEach(() => { logs.length = 0; });
  afterEach(() => { D.emailDomainDeps.resolver = original; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('shows the account domain, with no check yet; only an admin may read or run it', async () => {
    const t = await tenant();
    const r = await app.http('/settings/email-domain', { token: t.admin });
    expect(r.status).toBe(200);
    expect(r.json.account).toMatchObject({ domain: 'shop.example' });
    expect(r.json.accountProblem).toBeNull();
    expect(r.json.lastCheck).toBeNull();
    expect((await app.http('/settings/email-domain', { token: t.member })).status).toBe(403);
    expect((await check(t, {}, 'member')).status).toBe(403);
    expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.email_domain_checks WHERE organization_id = $1`, [t.org])).rows[0]!.n).toBe(0);
  });

  it('a domain with SPF, a named DKIM selector and DMARC passes: evidence recorded, readiness item set, no record text logged', async () => {
    const t = await tenant();
    useDns(GOOD);
    const r = await check(t, { dkimSelectors: ['S1'] });
    expect(r.status).toBe(200);
    expect(r.json.lastCheck).toMatchObject({ domain: 'shop.example', passed: true, dkimSelectors: ['s1'], spf: { ok: true }, dmarc: { ok: true, policy: 'none' } });
    expect(lastCheck(r).dkim).toEqual([{ selector: 's1', ok: true, code: 'found' }]);
    expect((await checkRows(t))).toEqual([{ passed: true, domain: 'shop.example', dkim_selectors: ['s1'] }]);
    expect((await item(t))!.value).toContain('shop.example');
    const text = logs.join('\n');
    expect(text).toContain('email domain checked');
    expect(text).toContain('shop.example');
    expect(text).not.toContain('records-that-must-not-be-logged');
    expect(text).not.toContain('reports@shop.example');
  });

  it('a failing check clears the item, and the reasons say what is missing', async () => {
    const t = await tenant();
    useDns(GOOD);
    expect(lastCheck(await check(t, { dkimSelectors: ['s1'] })).passed).toBe(true);
    expect(await item(t)).toBeDefined();
    await age(t);
    useDns({ 'shop.example': GOOD['shop.example']! }, {}); // DMARC gone, DKIM gone
    const r = await check(t, {});
    expect(r.json.lastCheck).toMatchObject({ passed: false, dmarc: { ok: false, code: 'dmarc_missing' }, dkim: [{ selector: 's1', ok: false, code: 'dkim_missing' }] });
    expect(await item(t)).toBeUndefined();
    expect((await checkRows(t)).map((x) => x.passed)).toEqual([true, false]);
  });

  it('reuses the last selectors when none are given, and without any selectors it does not pass', async () => {
    const t = await tenant();
    useDns(GOOD);
    const none = await check(t, {});
    expect(none.json.lastCheck).toMatchObject({ passed: false, dkim: [], dkimSelectors: [] });
    expect(await item(t)).toBeUndefined();
    await age(t);
    expect(lastCheck(await check(t, { dkimSelectors: ['s1'] })).passed).toBe(true);
    await age(t);
    const again = await check(t, {});
    expect(again.json.lastCheck).toMatchObject({ passed: true, dkimSelectors: ['s1'] });
  });

  it('refuses invalid selectors with the field named, and stores nothing', async () => {
    const t = await tenant();
    useDns(GOOD);
    for (const bad of ['s1', ['a b'], ['x'.repeat(64)], ['a', 'b', 'c', 'd', 'e', 'f']]) {
      const r = await check(t, { dkimSelectors: bad });
      expect(r.status).toBe(400);
      expect(firstIssuePath(r)).toBe('dkimSelectors');
    }
    expect(await checkRows(t)).toEqual([]);
  });

  it('refuses a second check inside ten seconds', async () => {
    const t = await tenant();
    useDns(GOOD);
    expect((await check(t, { dkimSelectors: ['s1'] })).status).toBe(200);
    const again = await check(t, {});
    expect(again.status).toBe(429);
    expect(again.json.code).toBe('too_soon');
    expect(await checkRows(t)).toHaveLength(1);
  });

  it('cannot be recorded by hand, though the other readiness items still can', async () => {
    const t = await tenant();
    const hand = await app.http('/settings/readiness/email/email_domain_authenticated', { method: 'PUT', token: t.admin, body: { value: 'spf and dkim pass' } });
    expect(hand.status).toBe(400);
    expect(firstIssuePath(hand)).toBe('item');
    expect(await item(t)).toBeUndefined();
    const other = await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.admin, body: { value: 'signed 2026-11-01' } });
    expect(other.status).toBe(200);
  });

  it('needs exactly one active email account with a usable From domain', async () => {
    const none = await tenant({ account: null });
    useDns(GOOD);
    const r0 = await check(none, {});
    expect(r0.status).toBe(409);
    expect(r0.json.code).toBe('no_email_account');
    expect((await app.http('/settings/email-domain', { token: none.admin })).json.accountProblem).toBe('no_email_account');

    const two = await tenant();
    await account(two, 'other@shop.example');
    expect((await check(two, {})).json.code).toBe('email_account_ambiguous');

    const bad = await tenant({ account: 'news@localhost' });
    expect((await check(bad, {})).json.code).toBe('domain_invalid');
    expect(accountDomain(await app.http('/settings/email-domain', { token: bad.admin }))).toBeNull();
    for (const t of [none, two, bad]) expect(await checkRows(t)).toEqual([]);
  });

  it('records nothing when the account is replaced while the lookups run', async () => {
    const t = await tenant();
    useDns(GOOD, CNAMES, async () => { await f.admin.query(`UPDATE engage.channel_accounts SET status = 'disabled', disabled_at = now() WHERE organization_id = $1`, [t.org]); });
    const r = await check(t, { dkimSelectors: ['s1'] });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('account_changed');
    expect(await checkRows(t)).toEqual([]);
    expect(await item(t)).toBeUndefined();
  });

  it('a failed lookup (timeout) is a failure, not a pass', async () => {
    const t = await tenant();
    D.emailDomainDeps.resolver = {
      resolveTxt: async () => { throw dnsError('ETIMEOUT'); },
      resolveCname: async () => { throw dnsError('ETIMEOUT'); },
    };
    const r = await check(t, { dkimSelectors: ['s1'] });
    expect(r.json.lastCheck).toMatchObject({ passed: false, spf: { ok: false, code: 'lookup_failed' }, dmarc: { ok: false, code: 'lookup_failed' } });
    expect(await item(t)).toBeUndefined();
  });

  it("one tenant's check never reaches another tenant", async () => {
    const a = await tenant();
    const b = await tenant();
    useDns(GOOD);
    await check(a, { dkimSelectors: ['s1'] });
    const seenByB = await app.http('/settings/email-domain', { token: b.admin });
    expect(seenByB.json.lastCheck).toBeNull();
    expect(await item(b)).toBeUndefined();
    expect(await checkRows(b)).toEqual([]);
    expect((await sql(b.org, `SELECT count(*)::int AS n FROM engage.email_domain_checks`)).rows[0]!.n).toBe(0);
  });

  it('keeps the evidence append-only for the engage role', async () => {
    const t = await tenant();
    useDns(GOOD);
    await check(t, { dkimSelectors: ['s1'] });
    await expect(sql(t.org, `UPDATE engage.email_domain_checks SET passed = false WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
    await expect(sql(t.org, `DELETE FROM engage.email_domain_checks WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
    expect(await checkRows(t)).toHaveLength(1);
  });

  it('a pass older than 30 days does not count in live mode, a recent one does', async () => {
    const t = await tenant();
    useDns(GOOD);
    await check(t, { dkimSelectors: ['s1'] });
    const missing = async () => (await C.getSendReadiness(t.org, 'live')).problems.filter((p) => p.code === 'readiness_missing').map((p) => p.message).join(' ');
    expect(await missing()).not.toContain('email_domain_authenticated');
    const backdate = (days: number) => f.admin.query(
      `UPDATE engage.tenant_readiness SET recorded_at = now() - make_interval(days => $2) WHERE organization_id = $1 AND item = 'email_domain_authenticated'`, [t.org, days]);
    await backdate(29);
    expect(await missing()).not.toContain('email_domain_authenticated');
    await backdate(31);
    expect(await missing()).toContain('email_domain_authenticated');
    // Checking again renews it.
    await age(t);
    await check(t, {});
    expect(await missing()).not.toContain('email_domain_authenticated');
  });
});
