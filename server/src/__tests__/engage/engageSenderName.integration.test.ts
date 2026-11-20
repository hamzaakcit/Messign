/**
 * The sender name (migration 130) on real Postgres and the real HTTP stack. Acceptance: only a tenant admin sets it; the
 * database refuses markup in it; a message or preview that uses {{sender_name}} carries the tenant's name, and a tenant
 * without one gets a refused render, never a made-up or blank name; one tenant's name never reaches another.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageSenderName.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const HTML = '<p>Teşekkürler.</p><p>{{sender_name}}</p>';

describe.skipIf(!adminUrl)('sender name (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let T: typeof import('../../engage/templates/templates.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Sender ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    T = await import('../../engage/templates/templates.js');
    app = await startEngageApp();
  }, 90_000);
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('only a tenant admin sets it, and the response shows it; another tenant still has none', async () => {
    const a = await tenant();
    const b = await tenant();
    const denied = await app.http('/settings/sender', { method: 'PUT', token: a.member, body: { senderName: 'Kitapyurdu' } });
    expect(denied.status).toBe(403);
    const set = await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: '  Kitapyurdu  ' } });
    expect(set.status).toBe(200);
    expect(set.json.senderName).toBe('Kitapyurdu');
    const otherTenant = await app.http('/settings', { token: b.admin });
    expect(otherTenant.json.senderName).toBeNull();
  });

  it('refuses markup, braces and too-long names with the field named, and stores nothing', async () => {
    const a = await tenant();
    await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: 'Kitapyurdu' } });
    for (const bad of ['<b>Kitap</b>', 'Kitap {{x}}', 'a'.repeat(81), 42]) {
      const r = await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: bad } });
      expect(r.status, String(bad)).toBe(400);
      expect(r.json.issues).toEqual([expect.objectContaining({ path: 'senderName' })]);
    }
    expect((await app.http('/settings', { token: a.admin })).json.senderName).toBe('Kitapyurdu');
  });

  it('the database refuses markup in the name even when the application is bypassed', async () => {
    const a = await tenant();
    await expect(sql(a.org, `UPDATE engage.tenant_settings SET sender_name = '<script>x</script>' WHERE organization_id = $1`, [a.org])).rejects.toThrow(/check|violates/i);
  });

  const contentOf = async (org: string, id: string) =>
    (await sql(org, `SELECT content FROM engage.messages WHERE id = $1`, [id])).rows[0].content as Record<string, unknown>;

  it('a message that uses {{sender_name}} carries the tenant name; without one, the render is refused, not sent blank', async () => {
    const a = await tenant();
    const acct = await creds.createAccount(a.org, a.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    const profile = await P.upsertProfile(a.org, { externalId: `s-${u()}`, email: `${u()}@example.com`, attributes: { first_name: 'Ayşe' } });
    const tpl = await T.createTemplate(a.org, a.userId, { key: `sig-${u()}`, name: 'İmza', subject: 'Konu', html: HTML });
    const made = (key: string) => T.createTemplatedMessage(a.org, {
      profileId: profile.id, templateId: tpl.template.id, purpose: 'transactional', channelAccountId: acct.id, idempotencyKey: `k-${key}-${u()}`,
    });

    await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: 'Kitapyurdu' } });
    const withName = await made('set');
    const withContent = await contentOf(a.org, withName.message.id);
    expect(withContent).toMatchObject({ html: expect.stringContaining('<p>Kitapyurdu</p>') });
    expect(withContent).not.toHaveProperty('render_error');

    await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: null } });
    const withoutName = await made('clear');
    const withoutContent = await contentOf(a.org, withoutName.message.id);
    expect(withoutContent).toHaveProperty('render_error');
    expect(withoutContent).not.toHaveProperty('html');
  });

  it('the template preview shows the name when set, and names the missing variable when not', async () => {
    const a = await tenant();
    const tpl = await T.createTemplate(a.org, a.userId, { key: `pv-${u()}`, name: 'Önizleme', subject: 'Konu', html: HTML });
    const none = await T.previewTemplate(a.org, tpl.template.id, {});
    expect(none.errors.map((e) => e.variable)).toEqual(['sender_name']);
    await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: 'Kitapyurdu' } });
    const set = await T.previewTemplate(a.org, tpl.template.id, {});
    expect(set.errors).toEqual([]);
    expect(set.html).toContain('Kitapyurdu');
  });
});
