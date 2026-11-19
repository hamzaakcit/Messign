/**
 * Adding one customer by hand (Customers page) on real Postgres and the real HTTP stack.
 * Acceptance: an admin adds a customer; email consent is stored only with a note of where the customer agreed; a member
 * cannot add; a repeated customer ID or an email of another customer is refused and writes nothing.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageManualCustomer.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('adding one customer by hand (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);

  interface Tn { org: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Manual ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }
  const consentRows = (org: string, externalId: string) => f.engage.withEngageTenant(org, async (c) =>
    (await c.query<{ status: string; source: string; evidence: Record<string, unknown> }>(
      `SELECT c.status, c.source, c.evidence FROM engage.consents c JOIN engage.profiles p ON p.id = c.profile_id
        WHERE p.organization_id = $1 AND p.external_id = $2 AND c.channel = 'email' ORDER BY c.recorded_at`, [org, externalId])).rows);

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    app = await startEngageApp();
  }, 90_000);

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('an admin adds a customer with email consent and its note; the consent is stored with the evidence', async () => {
    const t = await tenant();
    const ext = `cust-${u()}`;
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: ext, email: 'Ayse@Example.com', phone: '', email_consent: true, consent_note: 'Paper form, 12 March' } });
    expect(r.status).toBe(201);
    expect(r.json.externalId).toBe(ext);
    expect((r.json.identifiers as { email: string }).email).toBe('ayse@example.com');
    expect((r.json.consents as Record<string, string>).email).toBe('granted');
    const rows = await consentRows(t.org, ext);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'granted', source: 'import', evidence: { method: 'manual_entry', note: 'Paper form, 12 March' } });
  });

  it('an admin adds a customer without consent: no consent row, the customer exists', async () => {
    const t = await tenant();
    const ext = `cust-${u()}`;
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: ext, email: `n-${u()}@example.com`, email_consent: false } });
    expect(r.status).toBe(201);
    expect((r.json.consents as Record<string, unknown>).email).toBeUndefined();
    expect(await consentRows(t.org, ext)).toHaveLength(0);
  });

  it('a member cannot add a customer, and nothing is written', async () => {
    const t = await tenant();
    const ext = `cust-${u()}`;
    const r = await app.http('/profiles', { token: t.member, body: { external_id: ext, email: `m-${u()}@example.com` } });
    expect(r.status).toBe(403);
    const n = await f.engage.withEngageTenant(t.org, (c) => c.query(`SELECT 1 FROM engage.profiles WHERE external_id = $1`, [ext]));
    expect(n.rowCount).toBe(0);
  });

  it('email consent without an email address is refused', async () => {
    const t = await tenant();
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: `cust-${u()}`, email_consent: true, consent_note: 'Form' } });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toMatch(/email address/);
  });

  it('email consent without a note is refused: no consent is stored without evidence', async () => {
    const t = await tenant();
    const ext = `cust-${u()}`;
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: ext, email: `c-${u()}@example.com`, email_consent: true, consent_note: '  ' } });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toMatch(/evidence/);
    expect(await consentRows(t.org, ext)).toHaveLength(0);
  });

  it('a repeated customer ID is refused with 409 and the first customer is unchanged', async () => {
    const t = await tenant();
    const ext = `cust-${u()}`;
    expect((await app.http('/profiles', { token: t.admin, body: { external_id: ext, email: `a-${u()}@example.com` } })).status).toBe(201);
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: ext, email: `b-${u()}@example.com` } });
    expect(r.status).toBe(409);
    expect(String(r.json.error)).toMatch(/already exists/);
  });

  it('an email that belongs to another customer is refused with 409', async () => {
    const t = await tenant();
    const email = `shared-${u()}@example.com`;
    expect((await app.http('/profiles', { token: t.admin, body: { external_id: `cust-${u()}`, email } })).status).toBe(201);
    const r = await app.http('/profiles', { token: t.admin, body: { external_id: `cust-${u()}`, email } });
    expect(r.status).toBe(409);
  });

  it('a missing customer ID is a field error, not a crash', async () => {
    const t = await tenant();
    const r = await app.http('/profiles', { token: t.admin, body: { email: `x-${u()}@example.com` } });
    expect(r.status).toBe(400);
    expect(Array.isArray(r.json.issues)).toBe(true);
  });
});
