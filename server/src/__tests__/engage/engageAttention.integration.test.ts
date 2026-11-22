/**
 * What needs a tenant admin's attention (engage settings, GET /settings/attention) on real Postgres and the real HTTP stack:
 * the email domain lost by the scheduled re-check, and the İYS sync late or stale. Derived from state the server already
 * keeps; an item goes away when its cause does; admin only; one tenant never sees another's.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageAttention.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const GOOD: Record<string, string[][]> = {
  'shop.example': [['v=spf1 include:mail.example ~all']],
  '_dmarc.shop.example': [['v=DMARC1; p=none']],
};
const CNAMES: Record<string, string[]> = { 's1._domainkey.shop.example': ['s1.dkim.provider.example'] };

describe.skipIf(!adminUrl)('attention (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let D: typeof import('../../engage/settings/emailDomain.js');
  let A: typeof import('../../engage/settings/attention.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  let original: typeof import('../../engage/settings/emailDomain.js')['emailDomainDeps']['resolver'];
  const u = () => Math.random().toString(36).slice(2, 10);
  const dnsError = (code: string) => Object.assign(new Error(code), { code });
  const useDns = (txt: Record<string, string[][]>, cname: Record<string, string[]> = CNAMES, timeout = false) => {
    D.emailDomainDeps.resolver = {
      resolveTxt: async (n: string) => { if (timeout) throw dnsError('ETIMEOUT'); const v = txt[n]; if (!v) throw dnsError('ENODATA'); return v; },
      resolveCname: async (n: string) => { if (timeout) throw dnsError('ETIMEOUT'); const v = cname[n]; if (!v) throw dnsError('ENODATA'); return v; },
    };
  };

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(o: { email?: boolean; iys?: boolean } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Attn ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    if (o.email !== false) await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: { from_address: 'news@shop.example' }, secrets: { webhook_secret: `whsec_${u()}` } });
    if (o.iys) await creds.createAccount(org, t.admin.userId, { channel: 'iys', provider: 'mock', mode: 'test', label: 'iys', config: { iys_code: 100001, brand_code: 100001 }, secrets: { username: 'mock-user', password: 'mock-password' } });
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }
  /** A passing check made `ageHours` ago (evidence is append-only for the engage role; the test pool moves the clock). */
  async function passed(t: Tn, ageHours = 48) {
    useDns(GOOD);
    await D.runEmailDomainCheck(t.org, t.userId, { dkimSelectors: ['s1'] });
    for (const table of ['engage.email_domain_checks', 'engage.tenant_readiness']) {
      await f.admin.query(`UPDATE ${table} SET ${table.endsWith('checks') ? 'checked_at = checked_at' : 'recorded_at = recorded_at'} - make_interval(hours => $2) WHERE organization_id = $1`, [t.org, ageHours]);
    }
  }
  const items = (t: Tn, now?: Date) => A.getAttention(t.org, now);

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    creds = await import('../../engage/credentials.js');
    D = await import('../../engage/settings/emailDomain.js');
    A = await import('../../engage/settings/attention.js');
    original = D.emailDomainDeps.resolver;
    app = await startEngageApp();
  }, 90_000);
  afterEach(() => { D.emailDomainDeps.resolver = original; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('the email domain', () => {
    it('is quiet for a tenant that has nothing to report', async () => {
      expect(await items(await tenant())).toEqual([]);
      const ok = await tenant();
      await passed(ok, 1);
      expect(await items(ok)).toEqual([]);
    });
    it('is critical when the scheduled re-check found a record gone, says which, and goes when the records are back', async () => {
      const t = await tenant();
      await passed(t);
      useDns({ 'shop.example': GOOD['shop.example']! }); // the DMARC record was removed
      expect(await D.recheckEmailDomain(t.org)).toBe('failed');
      const [item, ...rest] = await items(t);
      expect(rest).toEqual([]);
      expect(item).toMatchObject({ code: 'email_domain_lost', severity: 'critical', data: { domain: 'shop.example', reasons: ['dmarc_missing'] } });
      expect(Date.now() - new Date(item!.since!).getTime()).toBeLessThan(60_000);
      // An admin sets the record again and checks: the cause is gone, so is the item.
      await f.admin.query(`UPDATE engage.email_domain_checks SET checked_at = checked_at - interval '1 minute' WHERE organization_id = $1`, [t.org]);
      useDns(GOOD);
      await D.runEmailDomainCheck(t.org, t.userId, {});
      expect(await items(t)).toEqual([]);
    });
    it('names every failed part once', async () => {
      const t = await tenant();
      await passed(t);
      useDns({}, {});
      await D.recheckEmailDomain(t.org);
      expect((await items(t))[0]!.data.reasons).toEqual(['spf_missing', 'dkim_missing', 'dmarc_missing']);
    });
    it('does not call a failed check an admin ran themselves "lost": they are looking at it', async () => {
      const t = await tenant();
      useDns({});
      await D.runEmailDomainCheck(t.org, t.userId, { dkimSelectors: ['s1'] });
      expect(await items(t)).toEqual([]);
    });
    it('says nothing when the scheduled check only could not reach DNS (the item is kept)', async () => {
      const t = await tenant();
      await passed(t);
      useDns(GOOD, CNAMES, true);
      expect(await D.recheckEmailDomain(t.org)).toBe('inconclusive');
      expect(await items(t)).toEqual([]);
    });
  });

  describe('the İYS sync', () => {
    const outbox = async (t: Tn, consentAt: number) => {
      const p = (await f.admin.query(`INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, $2) RETURNING id`, [t.org, `p-${u()}`])).rows[0]!.id as string;
      const c = (await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source) VALUES ($1, $2, 'email', 'revoked', 'unsubscribe_link') RETURNING id`, [t.org, p])).rows[0]!.id as string;
      await f.admin.query(`INSERT INTO engage.iys_outbox (organization_id, profile_id, consent_id, channel, consent_source, recipient, consent_at, created_at) VALUES ($1, $2, $3, 'email', 'unsubscribe_link', 'a@example.com', $4, $4)`, [t.org, p, c, new Date(consentAt)]);
    };
    const pulledAt = (t: Tn, at: number) => f.admin.query(
      `INSERT INTO engage.iys_sync_state (organization_id, last_pull_at, last_pull_attempt_at, last_pull_outcome) VALUES ($1, $2, $2, 'ok')
       ON CONFLICT (organization_id) DO UPDATE SET last_pull_at = $2, last_pull_attempt_at = $2, last_pull_outcome = 'ok'`, [t.org, new Date(at)]);

    it('has no item for a tenant without an İYS account', async () => {
      expect(await items(await tenant({ iys: false }))).toEqual([]);
    });
    it('warns until the first pull has happened, then is quiet', async () => {
      const t = await tenant({ iys: true });
      expect(await items(t)).toMatchObject([{ code: 'iys_sync', severity: 'warning', data: { pullStatus: 'never' } }]);
      await pulledAt(t, Date.now());
      expect(await items(t)).toEqual([]);
    });
    it('warns for a late report and is critical for a breached one, with the numbers and no address', async () => {
      const t = await tenant({ iys: true });
      const now = Date.now();
      await pulledAt(t, now);
      await outbox(t, now - 30 * HOUR);
      const late = await items(t, new Date(now));
      expect(late).toMatchObject([{ code: 'iys_sync', severity: 'warning', data: { late: 1, breached: 0, failed: 0 } }]);
      const breached = await items(t, new Date(now + 30 * DAY));
      expect(breached[0]).toMatchObject({ severity: 'critical', data: { breached: 1 } });
      expect(JSON.stringify(breached)).not.toMatch(/example\.com|mock-password|mock-user/);
    });
    it('is critical when the pull has not succeeded for days', async () => {
      const t = await tenant({ iys: true });
      await pulledAt(t, Date.now() - 4 * DAY);
      expect(await items(t)).toMatchObject([{ code: 'iys_sync', severity: 'critical', data: { pullStatus: 'critical' } }]);
    });
  });

  describe('the API', () => {
    it('lists the items for a tenant admin only, most serious first, and never another tenant\'s', async () => {
      const t = await tenant({ iys: true });
      await passed(t);
      useDns({});
      await D.recheckEmailDomain(t.org);
      const r = await app.http('/settings/attention', { token: t.admin });
      expect(r.status).toBe(200);
      expect((r.json.items as Array<{ code: string; severity: string }>).map((i) => [i.code, i.severity])).toEqual([['email_domain_lost', 'critical'], ['iys_sync', 'warning']]);
      expect((await app.http('/settings/attention', { token: t.member })).status).toBe(403);
      expect((await app.http('/settings/attention', {})).status).toBe(401);
      const other = await tenant();
      expect((await app.http('/settings/attention', { token: other.admin })).json).toEqual({ items: [] });
    });
  });
});
