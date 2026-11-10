/**
 * Tenant settings (WP-22) on real Postgres and the real HTTP stack.
 * Acceptance: send_enabled cannot be turned on without readiness (the refusal names every missing item and the flag stays
 * off); turning it off is always allowed; in live mode the legal readiness items are required; only a tenant admin reads
 * or changes the settings; quiet hours, caps and rates validate and persist.
 * ENGAGE_TEST_ADMIN_URL=postgresql://postgres@localhost:5433/engage_scratch npx vitest run src/__tests__/engage/engageSettings.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('tenant settings and send_enabled readiness (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const enabledInDb = async (org: string) => (await sql(org, 'SELECT send_enabled FROM engage.tenant_settings')).rows[0].send_enabled as boolean;

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Settings ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }

  /** Everything the email gate needs in sandbox: a rate card, a budget cap and one active test account. */
  async function makeSandboxReady(t: Tn): Promise<void> {
    await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `mock-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    await f.admin.query(`INSERT INTO engage.rate_cards (organization_id, channel, category, route, unit_cost_minor, currency) VALUES ($1, 'email', 'marketing', 'default', 1, 'TRY')`, [t.org]);
    await f.admin.query(`INSERT INTO engage.budget_caps (organization_id, channel, monthly_cap_minor, currency) VALUES ($1, 'email', 1000000, 'TRY')`, [t.org]);
  }

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    process.env.SEND_MODE = 'sandbox';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    creds = await import('../../engage/credentials.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  const withMode = async <T>(mode: string, fn: () => Promise<T>): Promise<T> => {
    const before = process.env.SEND_MODE;
    process.env.SEND_MODE = mode;
    try { return await fn(); } finally { if (before === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = before; }
  };

  // ---------------------------------------------------------------------------------------------------------------
  it('send_enabled is refused without readiness, names what is missing, and the flag stays off', async () => {
    const t = await tenant();
    const r = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
    expect(r.status).toBe(409);
    const codes = (r.json.problems as Array<{ code: string }>).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['no_email_account', 'no_rate_card', 'no_budget_cap']));
    expect(codes).not.toContain('tenant_send_disabled');
    expect(await enabledInDb(t.org)).toBe(false);
  });

  it('send_enabled turns on once readiness is complete, and off again at any time', async () => {
    const t = await tenant();
    await makeSandboxReady(t);
    const on = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
    expect(on.status).toBe(200);
    expect(on.json).toMatchObject({ sendEnabled: true, readiness: { ready: true, problems: [] } });
    expect(await enabledInDb(t.org)).toBe(true);
    const off = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: false } });
    expect(off.status).toBe(200);
    expect(await enabledInDb(t.org)).toBe(false);
  });

  it('turning it on again is checked again: a readiness item lost since then refuses the change', async () => {
    const t = await tenant();
    await makeSandboxReady(t);
    expect((await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } })).status).toBe(200);
    await f.admin.query(`DELETE FROM engage.budget_caps WHERE organization_id = $1`, [t.org]);
    await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: false } });
    const again = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
    expect(again.status).toBe(409);
    expect((again.json.problems as Array<{ code: string }>).map((p) => p.code)).toContain('no_budget_cap');
    expect(await enabledInDb(t.org)).toBe(false);
  });

  it('live mode also needs the legal readiness items recorded, and recording them is what unlocks it', async () => {
    const t = await tenant();
    await makeSandboxReady(t);
    // A live account and the live check: the sandbox account is in test mode, so live needs its own.
    await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'live', label: `live-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    await f.admin.query(`UPDATE engage.channel_accounts SET status = 'disabled', disabled_at = now() WHERE organization_id = $1 AND mode = 'test'`, [t.org]);
    await withMode('live', async () => {
      const refused = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
      expect(refused.status).toBe(409);
      expect((refused.json.problems as Array<{ code: string }>).map((p) => p.code)).toContain('readiness_missing');
      expect(await enabledInDb(t.org)).toBe(false);

      const dpa = await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.admin, body: { value: 'signed 2026-11-01', evidenceUrl: 'https://evidence.example.com/dpa.pdf' } });
      expect(dpa.status).toBe(200);
      expect(dpa.json.readinessItems).toEqual(expect.arrayContaining([expect.objectContaining({ channel: 'email', item: 'dpa_signed', value: 'signed 2026-11-01' })]));
      await app.http('/settings/readiness/email/email_domain_authenticated', { method: 'PUT', token: t.admin, body: { value: 'spf and dkim pass' } });
      const ok = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
      expect(ok.status).toBe(200);
      expect(await enabledInDb(t.org)).toBe(true);
    });
  });

  it('only a tenant admin can read or change the settings', async () => {
    const t = await tenant();
    expect((await app.http('/settings', { token: t.member })).status).toBe(403);
    expect((await app.http('/settings/send-enabled', { method: 'PUT', token: t.member, body: { enabled: false } })).status).toBe(403);
    expect((await app.http('/settings/gate', { method: 'PUT', token: t.member, body: { timezone: 'Europe/Istanbul' } })).status).toBe(403);
    expect((await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.member, body: { monthlyCapMinor: 1, currency: 'TRY' } })).status).toBe(403);
    expect((await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.member, body: { value: 'x' } })).status).toBe(403);
  });

  it('a body that is not a boolean is refused before anything is read or written', async () => {
    const t = await tenant();
    const r = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: 'yes' } });
    expect(r.status).toBe(400);
    expect(await enabledInDb(t.org)).toBe(false);
  });

  it('quiet hours, frequency cap and time zone validate and persist; the view shows them back', async () => {
    const t = await tenant();
    const bad = await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { quietHours: { start: '22:00', end: '22:00' } } });
    expect(bad.status).toBe(400);
    expect((bad.json.issues as Array<{ path: string }>).map((i) => i.path)).toContain('quietHours');
    expect((await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 0, windowHours: 24 } } })).status).toBe(400);
    expect((await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { timezone: 'Mars/Olympus' } })).status).toBe(400);

    const ok = await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { timezone: 'Europe/Istanbul', quietHours: { start: '21:00', end: '09:00' }, frequencyCap: { max: 2, windowHours: 72 } } });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ timezone: 'Europe/Istanbul', quietHours: { start: '21:00', end: '09:00' }, frequencyCap: { max: 2, windowHours: 72 } });

    const off = await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { quietHours: null } });
    expect(off.json.quietHours).toBeNull();
  });

  it('budget caps and rate cards validate, and a new rate is a new row the view reads as the one in effect', async () => {
    const t = await tenant();
    expect((await app.http('/settings/budget-caps/fax', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: 1, currency: 'TRY' } })).status).toBe(400);
    expect((await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: -5, currency: 'TRY' } })).status).toBe(400);
    expect((await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: 500000, currency: 'try' } })).status).toBe(400);
    const cap = await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: 500000, currency: 'TRY' } });
    expect(cap.status).toBe(200);
    expect(cap.json.budgetCaps).toEqual([expect.objectContaining({ channel: 'email', monthlyCapMinor: 500000, currency: 'TRY' })]);

    expect((await app.http('/settings/rate-cards', { method: 'POST', token: t.admin, body: { channel: 'email', category: 'promo', unitCostMinor: 1, currency: 'TRY' } })).status).toBe(400);
    expect((await app.http('/settings/rate-cards', { method: 'POST', token: t.admin, body: { channel: 'email', category: 'marketing', unitCostMinor: 1.5, currency: 'TRY' } })).status).toBe(400);
    await app.http('/settings/rate-cards', { method: 'POST', token: t.admin, body: { channel: 'email', category: 'marketing', unitCostMinor: 10, currency: 'TRY' } });
    const second = await app.http('/settings/rate-cards', { method: 'POST', token: t.admin, body: { channel: 'email', category: 'marketing', unitCostMinor: 12, currency: 'TRY' } });
    expect(second.status).toBe(201);
    expect(second.json.rateCards).toEqual([expect.objectContaining({ channel: 'email', category: 'marketing', route: 'default', unitCostMinor: 12 })]);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.rate_cards')).rows[0].n).toBe(2);
  });

  it('readiness items are only the ones the gate checks, for their own channel, with https evidence', async () => {
    const t = await tenant();
    expect((await app.http('/settings/readiness/email/btk_sender_id', { method: 'PUT', token: t.admin, body: { value: 'x' } })).status).toBe(400);
    expect((await app.http('/settings/readiness/sms/dpa_signed', { method: 'PUT', token: t.admin, body: { value: 'x' } })).status).toBe(200);
    expect((await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.admin, body: { value: 'x', evidenceUrl: 'http://insecure.example.com' } })).status).toBe(400);
    expect((await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.admin, body: { value: '' } })).status).toBe(400);
  });

  it('the view is the tenant\'s own: another tenant\'s readiness and caps are not in it', async () => {
    const a = await tenant();
    const b = await tenant();
    await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: a.admin, body: { value: 'signed' } });
    await app.http('/settings/budget-caps/email', { method: 'PUT', token: a.admin, body: { monthlyCapMinor: 777, currency: 'TRY' } });
    const view = (await app.http('/settings', { token: b.admin })).json;
    expect(view.readinessItems).toEqual([]);
    expect(view.budgetCaps).toEqual([]);
    expect(view.channelAccounts).toEqual([]);
  });
});
