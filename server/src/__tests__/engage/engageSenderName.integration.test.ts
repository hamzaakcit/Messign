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

  describe('one sender identity through the whole path (WP-33): Settings API -> account -> send gate -> dispatch', () => {
    let M: typeof import('../../engage/messaging/index.js');
    const savedMode = process.env.SEND_MODE;
    beforeAll(async () => { M = await import('../../engage/messaging/index.js'); process.env.SEND_MODE = 'sandbox'; });
    afterAll(() => { if (savedMode === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = savedMode; });

    /** A tenant set up only through the API a tenant admin has: sender name, mock email account with a From name, rate card, cap, switch on. */
    async function onboarded(senderName: string, fromName: string) {
      const a = await tenant();
      const set = (path: string, method: string, body: unknown) => app.http(path, { method, token: a.admin, body });
      expect((await set('/settings/sender', 'PUT', { senderName })).status).toBe(200);
      const acct = await set('/channel-accounts', 'POST', { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: { from_name: fromName }, secrets: { webhook_secret: `whsec_${u()}` } });
      expect(acct.status).toBe(201);
      expect((await set('/settings/rate-cards', 'POST', { channel: 'email', category: 'transactional', unitCostMinor: 1, currency: 'TRY' })).status).toBe(201);
      expect((await set('/settings/rate-cards', 'POST', { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' })).status).toBe(201);
      expect((await set('/settings/budget-caps/email', 'PUT', { monthlyCapMinor: 100000, currency: 'TRY' })).status).toBe(200);
      const on = await set('/settings/send-enabled', 'PUT', { enabled: true });
      expect(on.status, JSON.stringify(on.json)).toBe(200); // a name mismatch does not stop the switch: the readiness check does not look at it
      return { ...a, account: acct.json.id as string };
    }
    async function send(a: Tn, account: string): Promise<{ outcome: string; code?: string; decision: string }> {
      const email = `${u()}@example.com`;
      const profile = await P.upsertProfile(a.org, { externalId: `i-${u()}`, email });
      await M.addAllowlistEntry(a.org, 'email', email);
      const { message } = await M.createMessage(a.org, {
        profileId: profile.id, channel: 'email', purpose: 'transactional', channelAccountId: account, idempotencyKey: `id-${u()}`,
        content: { subject: 'Hello', text: 'Hello', html: '<p>Hello</p>' },
      });
      const r = await M.dispatchMessage(a.org, message.id);
      const decision = (await sql(a.org, `SELECT decision, code, reasons FROM engage.send_decisions WHERE message_id = $1 ORDER BY id DESC LIMIT 1`, [message.id])).rows[0];
      return { outcome: r.outcome, code: 'code' in r ? r.code : undefined, decision: `${decision.decision}:${decision.code}:${JSON.stringify((decision.reasons as Array<{ code: string }>).map((x) => x.code))}` };
    }

    it('matching sender name and From name: the message is sent', async () => {
      const a = await onboarded('Kitapyurdu', 'Kitapyurdu');
      expect(await send(a, a.account)).toEqual({ outcome: 'sent', code: undefined, decision: 'allow:allowed:[]' });
    });

    it('a difference in spaces only is not a difference; a difference in letters or case is', async () => {
      const spaced = await onboarded('Lilyana  Flowers', ' Lilyana Flowers ');
      expect((await send(spaced, spaced.account)).outcome).toBe('sent');
      const cased = await onboarded('Kitapyurdu', 'kitapyurdu');
      expect((await send(cased, cased.account)).outcome).toBe('blocked');
    });

    it('differing names: the message is denied with sender_identity_mismatch, nothing is handed to the adapter, and rotating the account with the matching From name fixes it', async () => {
      const a = await onboarded('Kitapyurdu', 'Başka Mağaza');
      const adapterCalls = vi.spyOn(M.getAdapter('mock')!, 'send');
      try {
        const denied = await send(a, a.account);
        expect(denied).toEqual({ outcome: 'blocked', code: 'sender_identity_mismatch', decision: 'deny:sender_identity_mismatch:["sender_identity_mismatch"]' });
        expect(adapterCalls).not.toHaveBeenCalled();
        // the fix the checklist names: rotate the account with the matching From name; the next message is sent
        const rotated = await app.http(`/channel-accounts/${a.account}/rotate`, { method: 'POST', token: a.admin, body: { secrets: { webhook_secret: `whsec_${u()}` }, config: { from_name: 'Kitapyurdu' } } });
        expect(rotated.status).toBe(201);
        expect(await send(a, rotated.json.id as string)).toMatchObject({ outcome: 'sent' });
        expect(adapterCalls).toHaveBeenCalledTimes(1);
      } finally { adapterCalls.mockRestore(); }
    });

    it('a tenant that changes the sender name afterwards is denied until the From name follows', async () => {
      const a = await onboarded('Kitapyurdu', 'Kitapyurdu');
      expect((await send(a, a.account)).outcome).toBe('sent');
      await app.http('/settings/sender', { method: 'PUT', token: a.admin, body: { senderName: 'Kitapyurdu Yayın' } });
      expect(await send(a, a.account)).toMatchObject({ outcome: 'blocked', code: 'sender_identity_mismatch' });
    });
  });
});
