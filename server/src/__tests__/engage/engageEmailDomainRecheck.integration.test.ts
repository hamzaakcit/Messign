/**
 * The scheduled email domain re-check (migration 132, ADR-020) on real Postgres with a fake DNS resolver. Acceptance:
 * only a tenant whose readiness item is set and whose latest check is old enough is listed; a pass renews the item and
 * is marked automatic; a record that is really gone clears the item; a DNS lookup that failed keeps it and is tried
 * again within the hour; an account that is gone, or on another domain whose records are missing, clears it; the
 * scheduler sees tenant ids only; one tenant's re-check never touches another; and no record text reaches the logs.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageEmailDomainRecheck.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

const TXT_SECRET = 'v=spf1 include:records-that-must-not-be-logged.example ~all';
const GOOD: Record<string, string[][]> = {
  'shop.example': [[TXT_SECRET]],
  '_dmarc.shop.example': [['v=DMARC1; p=none; rua=mailto:reports@shop.example']],
};
const CNAMES: Record<string, string[]> = { 's1._domainkey.shop.example': ['s1.dkim.provider.example'] };

describe.skipIf(!adminUrl)('scheduled email domain re-check (real Postgres, fake DNS)', () => {
  let f: TenancyFixture;
  let creds: typeof import('../../engage/credentials.js');
  let D: typeof import('../../engage/settings/emailDomain.js');
  const logs: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];
  let original: typeof import('../../engage/settings/emailDomain.js')['emailDomainDeps']['resolver'];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  const dnsError = (code: string) => Object.assign(new Error(code), { code });
  /** A resolver over fixed answers; with `timeout` every lookup fails the way a dead resolver does. */
  function useDns(txt: Record<string, string[][]>, cname: Record<string, string[]> = CNAMES, timeout = false) {
    D.emailDomainDeps.resolver = {
      resolveTxt: async (n: string) => { if (timeout) throw dnsError('ETIMEOUT'); const v = txt[n]; if (!v) throw dnsError('ENODATA'); return v; },
      resolveCname: async (n: string) => { if (timeout) throw dnsError('ETIMEOUT'); const v = cname[n]; if (!v) throw dnsError('ENODATA'); return v; },
    };
  }

  interface Tn { org: string; userId: string; account: string }
  const accountOn = async (org: string, userId: string, fromAddress: string) =>
    (await creds.createAccount(org, userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: { from_address: fromAddress }, secrets: { webhook_secret: `whsec_${u()}` } })).id;
  /** A tenant whose domain check passed `ageHours` ago. */
  async function passingTenant(ageHours = 48): Promise<Tn> {
    const t = await f.provisionTenant(`Recheck ${u()}`);
    const org = t.organization.id;
    const account = await accountOn(org, t.admin.userId, 'news@shop.example');
    useDns(GOOD);
    await D.runEmailDomainCheck(org, t.admin.userId, { dkimSelectors: ['s1'] });
    await age(org, ageHours);
    return { org, userId: t.admin.userId, account };
  }
  /** Evidence is append-only for the engage role; the test pool moves the clock the way waiting would. */
  const age = async (org: string, hours: number) => {
    await f.admin.query(`UPDATE engage.email_domain_checks SET checked_at = checked_at - make_interval(hours => $2) WHERE organization_id = $1`, [org, hours]);
    await f.admin.query(`UPDATE engage.tenant_readiness SET recorded_at = recorded_at - make_interval(hours => $2) WHERE organization_id = $1`, [org, hours]);
  };
  const item = async (org: string) => (await sql(org, `SELECT value, recorded_by, recorded_at > now() - interval '5 minutes' AS fresh FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = 'email_domain_authenticated'`, [org])).rows[0];
  const rows = async (org: string) => (await sql(org, `SELECT passed, domain, checked_by, spf, dmarc FROM engage.email_domain_checks WHERE organization_id = $1 ORDER BY checked_at, id`, [org])).rows;
  const work = async (orgs: string[]) => (await f.engage.withEngageScheduler((c) => c.query<{ organization_id: string }>('SELECT organization_id FROM engage.email_domain_recheck_work(100, $1::uuid[])', [orgs]))).rows.map((r) => r.organization_id);

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); }));
    }
    creds = await import('../../engage/credentials.js');
    D = await import('../../engage/settings/emailDomain.js');
    original = D.emailDomainDeps.resolver;
  }, 90_000);
  beforeEach(() => { logs.length = 0; });
  afterEach(() => { D.emailDomainDeps.resolver = original; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  it('lists only a tenant with the item set whose latest passing check is more than 23 hours old', async () => {
    const stale = await passingTenant(24);
    const fresh = await passingTenant(2);
    const none = await f.provisionTenant(`No item ${u()}`);
    expect(await work([stale.org, fresh.org, none.organization.id])).toEqual([stale.org]);
  });

  it('a pass renews the item and records an automatic check', async () => {
    const t = await passingTenant(48);
    useDns(GOOD);
    expect(await D.recheckEmailDomain(t.org)).toBe('passed');
    const checks = await rows(t.org);
    expect(checks).toHaveLength(2);
    expect(checks[1]).toMatchObject({ passed: true, domain: 'shop.example', checked_by: null });
    expect(await item(t.org)).toMatchObject({ fresh: true, recorded_by: null });
    expect((await D.getEmailDomain(t.org)).lastCheck).toMatchObject({ passed: true, automatic: true });
    expect(await work([t.org])).toEqual([]);
  });

  it('a record that is really gone clears the item, and the reason is recorded', async () => {
    const t = await passingTenant(48);
    useDns({ 'shop.example': GOOD['shop.example']! }); // the DMARC record was removed
    expect(await D.recheckEmailDomain(t.org)).toBe('failed');
    expect(await item(t.org)).toBeUndefined();
    const last = (await rows(t.org)).at(-1)!;
    expect(last).toMatchObject({ passed: false, checked_by: null });
    expect(last.dmarc).toMatchObject({ ok: false, code: 'dmarc_missing' });
    expect(logs.join('\n')).toContain('did not pass');
    expect(await work([t.org])).toEqual([]); // no item, nothing to protect
  });

  it('DNS that cannot be reached keeps the item, records the attempt, and is tried again after an hour, not before', async () => {
    const t = await passingTenant(48);
    useDns(GOOD, CNAMES, true);
    expect(await D.recheckEmailDomain(t.org)).toBe('inconclusive');
    expect(await item(t.org)).toBeDefined();
    const last = (await rows(t.org)).at(-1)!;
    expect(last).toMatchObject({ passed: false, checked_by: null });
    expect(last.spf).toMatchObject({ ok: false, code: 'lookup_failed' });
    expect(await work([t.org])).toEqual([]);
    await age(t.org, 2);
    expect(await work([t.org])).toEqual([t.org]);
    useDns(GOOD);
    expect(await D.recheckEmailDomain(t.org)).toBe('passed');
    expect(await work([t.org])).toEqual([]);
  });

  it('a mix of a missing record and a failed lookup is a failure, not an inconclusive check', async () => {
    const t = await passingTenant(48);
    D.emailDomainDeps.resolver = {
      resolveTxt: async (n: string) => { if (n === 'shop.example') throw dnsError('ENODATA'); throw dnsError('ETIMEOUT'); },
      resolveCname: async () => { throw dnsError('ETIMEOUT'); },
    };
    expect(await D.recheckEmailDomain(t.org)).toBe('failed');
    expect(await item(t.org)).toBeUndefined();
  });

  it('an email account moved to another domain is checked on that domain with the old selectors, and fails there', async () => {
    const t = await passingTenant(48);
    await creds.disableAccount(t.org, t.account);
    await accountOn(t.org, t.userId, 'news@other.example');
    useDns(GOOD); // shop.example is fine, other.example has nothing
    expect(await D.recheckEmailDomain(t.org)).toBe('failed');
    expect(await item(t.org)).toBeUndefined();
    expect((await rows(t.org)).at(-1)).toMatchObject({ passed: false, domain: 'other.example' });
  });

  it('with no active email account the item is cleared and no evidence row is added', async () => {
    const t = await passingTenant(48);
    await creds.disableAccount(t.org, t.account);
    expect(await D.recheckEmailDomain(t.org)).toBe('no_account');
    expect(await item(t.org)).toBeUndefined();
    expect(await rows(t.org)).toHaveLength(1);
  });

  it('does nothing for a tenant that is not due, so a doubled run adds no second row', async () => {
    const t = await passingTenant(2);
    useDns(GOOD);
    expect(await D.recheckEmailDomain(t.org)).toBe('skipped');
    expect(await rows(t.org)).toHaveLength(1);
  });

  it('one run re-checks every due tenant, each on its own, and tallies the outcomes', async () => {
    const ok = await passingTenant(48);
    const gone = await passingTenant(48);
    await creds.disableAccount(gone.org, gone.account);
    const fresh = await passingTenant(1);
    useDns(GOOD);
    const s = await D.recheckDueEmailDomains({ onlyOrganizations: [ok.org, gone.org, fresh.org] });
    expect(s).toMatchObject({ due: 2, passed: 1, no_account: 1, failed: 0, inconclusive: 0, skipped: 0, error: 0 });
    expect(await item(ok.org)).toBeDefined();
    expect(await item(gone.org)).toBeUndefined();
    expect(await item(fresh.org)).toBeDefined();
    expect(await rows(fresh.org)).toHaveLength(1);
  });

  it('the scheduler role sees ids only and cannot read or change the evidence of a tenant', async () => {
    const t = await passingTenant(48);
    const direct = await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.email_domain_checks'));
    expect(direct.rows).toEqual([]);
    const listed = await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.email_domain_recheck_work(100, $1::uuid[])', [[t.org]]));
    expect(listed.fields.map((x) => x.name)).toEqual(['organization_id']);
  });

  it('logs carry ids, the domain and codes, never record text or addresses', async () => {
    const t = await passingTenant(48);
    useDns(GOOD);
    await D.recheckEmailDomain(t.org);
    useDns({});
    await age(t.org, 48);
    await D.recheckEmailDomain(t.org);
    const text = logs.join('\n');
    expect(text).toContain('shop.example');
    expect(text).not.toContain('records-that-must-not-be-logged');
    expect(text).not.toContain('reports@shop.example');
    expect(text).not.toContain('news@shop.example');
  });
});
