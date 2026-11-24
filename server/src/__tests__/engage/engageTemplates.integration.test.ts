/**
 * Email templates (WP-14) on real Postgres and the real HTTP stack: storage and immutability, roles, tenant isolation,
 * preview, and sending from a template, where a failed render is denied by the gate instead of sent blank.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const HTML = `<html><body><h1>Merhaba {{first_name | default: "okurumuz"}}</h1><p>{{payload.book}} sepetinizde.</p>
<a href="{{payload.cart_url}}">Sepete dön</a><p><a href="{{unsubscribe_url}}">Abonelikten çık</a></p></body></html>`;
const TX_HTML = `<p>Merhaba {{first_name}}, {{payload.order_id}} numaralı siparişiniz kargoda.</p>`;

describe.skipIf(!adminUrl)('email templates (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let T: typeof import('../../engage/templates/templates.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface T0 { org: string; adminToken: string; memberToken: string; userId: string }
  const tenant = async (): Promise<T0> => {
    const t = await f.provisionTenant(`Tpl ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'email', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, adminToken: token(t.admin.authUserId, org), memberToken: token(member, org), userId: t.admin.userId };
  };
  const account = async (t: T0) =>
    (await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } })).id;
  const recipient = async (t: T0, attributes: Record<string, unknown> = {}, consent = false) => {
    const email = `${u()}@example.com`;
    const p = await P.upsertProfile(t.org, { externalId: `tp-${u()}`, email, attributes });
    if (consent) await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'web', evidence: { test: 'wp14' } });
    await M.addAllowlistEntry(t.org, 'email', email);
    return { id: p.id, email };
  };
  const create = (t: T0, body: Record<string, unknown>) => app.http('/templates', { token: t.adminToken, body });
  const template = async (t: T0, html = HTML, key = `k-${u()}`) => {
    const r = await create(t, { key, name: 'Sepet hatırlatma', subject: '{{first_name | default: "Merhaba"}}, sepetiniz bekliyor', html });
    expect(r.status).toBe(201);
    return (r.json.template as { id: string }).id;
  };
  const content = async (t: T0, messageId: string) =>
    (await sql(t.org, `SELECT content FROM engage.messages WHERE id = $1`, [messageId])).rows[0].content as Record<string, unknown>;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    T = await import('../../engage/templates/templates.js');
    mock = await import('../../engage/messaging/mockAdapter.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    app = await startEngageApp();
  }, 90_000);
  afterEach(() => { delete process.env.SEND_MODE; mock.resetMockAdapter(); vi.restoreAllMocks(); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('storage, roles and isolation', () => {
    it('an admin creates a template; the version lists what it uses', async () => {
      const t = await tenant();
      const r = await create(t, { key: 'cart-reminder', name: 'Sepet', subject: 'Merhaba {{first_name}}', html: HTML });
      expect(r.status).toBe(201);
      expect(r.json.template).toMatchObject({ key: 'cart-reminder', channel: 'email', latestVersion: 1 });
      expect((r.json.version as { variables: Array<{ name: string; source: string }> }).variables.map((v) => `${v.source}:${v.name}`).sort())
        .toEqual(['attribute:first_name', 'payload:book', 'payload:cart_url', 'system:unsubscribe_url']);
      expect((await create(t, { key: 'cart-reminder', name: 'x', subject: 's', html: '<p>x</p>' })).status).toBe(409);
    });

    it('a member can read and preview, but not create or change templates', async () => {
      const t = await tenant(); const id = await template(t);
      expect((await app.http('/templates', { token: t.memberToken })).status).toBe(200);
      expect((await app.http(`/templates/${id}`, { token: t.memberToken })).status).toBe(200);
      expect((await app.http(`/templates/${id}/preview`, { token: t.memberToken, body: { attributes: {}, payload: { book: 'x', cart_url: 'https://s.example.com' } } })).status).toBe(200);
      expect((await app.http('/templates', { token: t.memberToken, body: { key: 'm', name: 'm', subject: 's', html: '<p>x</p>' } })).status).toBe(403);
      expect((await app.http(`/templates/${id}/versions`, { token: t.memberToken, body: { subject: 's', html: '<p>x</p>' } })).status).toBe(403);
      expect((await app.http('/templates')).status).toBe(401);
    });

    it('rejects unsafe or invalid templates with the reason, and stores nothing', async () => {
      const t = await tenant();
      for (const [html, code] of [['<script>x</script>', 'forbidden_tag'], ['<p>{{#if a}}x{{/if}}</p>', 'invalid_variable'], ['<a href="javascript:x">x</a>', 'forbidden_url'], ['<p onclick="x">x</p>', 'forbidden_attribute']] as const) {
        const r = await create(t, { key: `bad-${u()}`, name: 'x', subject: 's', html });
        expect(r.status).toBe(400);
        expect(String(r.json.error)).toContain(code);
      }
      expect((await create(t, { key: 'Bad Key', name: 'x', subject: 's', html: '<p>x</p>' })).status).toBe(400);
      expect((await app.http('/templates', { token: t.adminToken })).json.templates).toEqual([]);
    });

    it('a change is a new version; old versions stay exactly as they were, and cannot be edited or deleted', async () => {
      const t = await tenant(); const id = await template(t);
      const v2 = await app.http(`/templates/${id}/versions`, { token: t.adminToken, body: { subject: 'Yeni {{first_name | default: "x"}}', html: '<p>v2 {{unsubscribe_url}}</p>' } });
      expect(v2).toMatchObject({ status: 201, json: { version: { version: 2 } } });
      const got = await app.http(`/templates/${id}`, { token: t.adminToken });
      expect((got.json.versions as Array<{ version: number; html: string }>).map((v) => v.version)).toEqual([2, 1]);
      expect((got.json.versions as Array<{ html: string }>)[1]!.html).toBe(HTML);
      await expect(sql(t.org, `UPDATE engage.template_versions SET html = '<p>edited</p>' WHERE template_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.template_versions WHERE template_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `UPDATE engage.templates SET name = 'x' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('two saves at once get two different version numbers', async () => {
      const t = await tenant(); const id = await template(t);
      const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => T.addTemplateVersion(t.org, null, id, { subject: `s${i}`, html: '<p>x</p>' })));
      expect(rs.map((r) => r.version).sort()).toEqual([2, 3, 4, 5, 6]);
    });

    it('another tenant sees nothing and can do nothing with it', async () => {
      const a = await tenant(); const b = await tenant(); const id = await template(a);
      expect((await app.http('/templates', { token: b.adminToken })).json.templates).toEqual([]);
      expect((await app.http(`/templates/${id}`, { token: b.adminToken })).status).toBe(404);
      expect((await app.http(`/templates/${id}/versions`, { token: b.adminToken, body: { subject: 's', html: '<p>x</p>' } })).status).toBe(404);
      expect((await app.http(`/templates/${id}/preview`, { token: b.adminToken, body: {} })).status).toBe(404);
      const accB = await account(b); const rb = await recipient(b);
      await expect(T.createTemplatedMessage(b.org, { profileId: rb.id, templateId: id, purpose: 'transactional', channelAccountId: accB, idempotencyKey: `k-${u()}` }))
        .rejects.toThrow(/Template not found/);
      // A's profile cannot be previewed through A's template by B either.
      const ra = await recipient(a);
      expect((await app.http(`/templates/${id}/preview`, { token: b.adminToken, body: { profileId: ra.id } })).status).toBe(404);
    });
  });

  describe('preview', () => {
    it('renders with a real profile or sample attributes, shows a placeholder unsubscribe link, and stores nothing', async () => {
      const t = await tenant(); const id = await template(t); const r = await recipient(t, { first_name: 'Ayşe' });
      const before = (await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n;
      const p = await app.http(`/templates/${id}/preview`, { token: t.adminToken, body: { profileId: r.id, payload: { book: 'Tutunamayanlar', cart_url: 'https://s.example.com/c/1' } } });
      expect(p.status).toBe(200);
      expect(p.json).toMatchObject({ version: 1, subject: 'Ayşe, sepetiniz bekliyor', errors: [] });
      expect(p.json.html).toContain('Merhaba Ayşe');
      expect(p.json.html).toContain(`href="${T.PREVIEW_UNSUBSCRIBE_URL}"`);
      expect(p.headers.get('cache-control')).toBe('no-store');
      const sample = await app.http(`/templates/${id}/preview`, { token: t.adminToken, body: { attributes: {}, payload: { book: 'x', cart_url: 'https://s.example.com' } } });
      expect(sample.json.subject).toBe('Merhaba, sepetiniz bekliyor');
      const missing = await app.http(`/templates/${id}/preview`, { token: t.adminToken, body: { attributes: {} } });
      expect(missing.json).toMatchObject({ subject: null, html: null, errors: [{ code: 'missing_variable', variable: 'payload.book' }, { code: 'missing_variable', variable: 'payload.cart_url' }] });
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(before);
    });
  });

  describe('sending from a template', () => {
    it('renders from the profile and payload, records which version, and sends', async () => {
      process.env.SEND_MODE = 'sandbox';
      const send = vi.spyOn(mock.mockAdapter, 'send');
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'Mehmet' });
      const id = (await create(t, { key: `tx-${u()}`, name: 'Kargo', subject: 'Siparişiniz {{payload.order_id}} kargoda', html: TX_HTML })).json.template as { id: string };
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id.id, purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { order_id: 'KY-1001' } });
      expect(await M.dispatchMessage(t.org, message.id)).toMatchObject({ outcome: 'sent' });
      expect(send.mock.calls[0]![0].content).toMatchObject({ subject: 'Siparişiniz KY-1001 kargoda', html: '<p>Merhaba Mehmet, KY-1001 numaralı siparişiniz kargoda.</p>', template_id: id.id, template_version: 1 });
      expect(send.mock.calls[0]![0].content).not.toHaveProperty('unsubscribe_url'); // transactional: no list links
    });

    it('acceptance: a missing variable is denied by the gate, never sent blank', async () => {
      process.env.SEND_MODE = 'sandbox';
      const send = vi.spyOn(mock.mockAdapter, 'send');
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, {}); // no first_name
      const id = (await create(t, { key: `tx-${u()}`, name: 'Kargo', subject: 'Sipariş', html: TX_HTML })).json.template as { id: string };
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id.id, purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { order_id: 'KY-1' } });
      expect(await content(t, message.id)).toEqual({ template_id: id.id, template_version: 1, render_error: { code: 'missing_variable', variables: ['first_name'] } });
      expect(await M.dispatchMessage(t.org, message.id)).toEqual({ outcome: 'blocked', code: 'render_missing_variable' });
      expect(send).not.toHaveBeenCalled();
      const d = (await sql(t.org, `SELECT decision, code FROM engage.send_decisions WHERE message_id = $1`, [message.id])).rows;
      expect(d).toEqual([{ decision: 'deny', code: 'render_missing_variable' }]);
    });

    it('an unsafe link value in the payload is denied too', async () => {
      process.env.SEND_MODE = 'sandbox';
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'A' }, true);
      const id = await template(t);
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id, purpose: 'marketing', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { book: 'x', cart_url: 'javascript:alert(1)' } });
      expect(await M.dispatchMessage(t.org, message.id)).toEqual({ outcome: 'blocked', code: 'render_unsafe_url' });
    });

    it('marketing: the recipient\'s own unsubscribe links are rendered in and attached, and the message passes the gate', async () => {
      process.env.SEND_MODE = 'sandbox';
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'Zeynep' }, true);
      const id = await template(t);
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id, purpose: 'marketing', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { book: 'Saatleri Ayarlama Enstitüsü', cart_url: 'https://s.example.com/c/9' } });
      const c = await content(t, message.id);
      expect(String(c.unsubscribe_url)).toMatch(/^https:\/\/app\.example\.com\/u\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(String(c.unsubscribe_one_click_url)).toMatch(/^https:\/\/api\.example\.com\/api\/engage\/unsubscribe\//);
      expect(String(c.html)).toContain(`href="${c.unsubscribe_url}"`);
      expect(await M.dispatchMessage(t.org, message.id)).toMatchObject({ outcome: 'sent' });
    });

    it('marketing from a template without {{unsubscribe_url}} is denied by the existing content rule', async () => {
      process.env.SEND_MODE = 'sandbox';
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'A' }, true);
      const id = (await create(t, { key: `m-${u()}`, name: 'x', subject: 'Kampanya', html: '<p>İndirim {{first_name}}</p>' })).json.template as { id: string };
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id.id, purpose: 'marketing', channelAccountId: acct, idempotencyKey: `k-${u()}` });
      expect(await M.dispatchMessage(t.org, message.id)).toEqual({ outcome: 'blocked', code: 'content_no_unsubscribe' });
    });

    it('a marketing message is not created at all when the public URLs for unsubscribe links are not configured', async () => {
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'A' }, true);
      const id = await template(t);
      const saved = process.env.ENGAGE_PUBLIC_API_URL;
      delete process.env.ENGAGE_PUBLIC_API_URL;
      try {
        await expect(T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id, purpose: 'marketing', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { book: 'x', cart_url: 'https://s.example.com' } }))
          .rejects.toThrow(/ENGAGE_PUBLIC_API_URL/);
      } finally { process.env.ENGAGE_PUBLIC_API_URL = saved; }
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(0);
    });

    it('a retry with the same idempotency key is the same message, even after the profile or the template changed', async () => {
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'Can' });
      const id = (await create(t, { key: `tx-${u()}`, name: 'Kargo', subject: 'Sipariş', html: TX_HTML })).json.template as { id: string };
      const key = `k-${u()}`;
      const input = { profileId: r.id, templateId: id.id, purpose: 'transactional' as const, channelAccountId: acct, idempotencyKey: key, payload: { order_id: 'X' } };
      const first = await T.createTemplatedMessage(t.org, input);
      await P.upsertProfile(t.org, { externalId: (await P.getProfile(t.org, r.id)).externalId, attributes: { first_name: 'Cem' } });
      await T.addTemplateVersion(t.org, null, id.id, { subject: 'Sipariş v2', html: TX_HTML });
      const again = await T.createTemplatedMessage(t.org, input);
      expect(again).toMatchObject({ created: false, message: { id: first.message.id } });
      expect((await content(t, first.message.id)).template_version).toBe(1);
      // A different request under the same key is still a conflict.
      await expect(T.createTemplatedMessage(t.org, { ...input, payload: { order_id: 'Y' } })).rejects.toThrow(/idempotency key/);
    });

    it('a pinned version is used even after newer ones exist', async () => {
      const t = await tenant(); const acct = await account(t); const r = await recipient(t, { first_name: 'Ece' });
      const id = (await create(t, { key: `tx-${u()}`, name: 'Kargo', subject: 'v1', html: TX_HTML })).json.template as { id: string };
      await T.addTemplateVersion(t.org, null, id.id, { subject: 'v2', html: TX_HTML });
      const { message } = await T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id.id, version: 1, purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}`, payload: { order_id: 'Z' } });
      expect(await content(t, message.id)).toMatchObject({ subject: 'v1', template_version: 1 });
      await expect(T.createTemplatedMessage(t.org, { profileId: r.id, templateId: id.id, version: 9, purpose: 'transactional', channelAccountId: acct, idempotencyKey: `k-${u()}` }))
        .rejects.toThrow(/version not found/);
    });
  });

  it('rendering never reaches an AI model: nothing the template code imports leads to the AI services', () => {
    const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        const spec = (m[1] ?? m[2])!;
        visit(resolve(dirname(file), spec.replace(/\.js$/, '.ts')));
      }
    };
    const dir = join(SRC, 'engage', 'templates');
    for (const name of readdirSync(dir)) if (name.endsWith('.ts')) visit(join(dir, name));
    const reached = [...seen].map((p) => p.slice(SRC.length + 1));
    expect(reached).toContain('engage/templates/render.ts');
    expect(reached.filter((p) => /services\/ai|gateway|llm|anthropic|openai|groq|gemini/i.test(p))).toEqual([]);
    // And the renderer itself imports nothing at all.
    expect(readFileSync(join(dir, 'render.ts'), 'utf8')).not.toMatch(/^\s*import\s/m);
  });
});
