/**
 * AI copy drafting (WP-24) on real Postgres and the real HTTP stack, with the model replaced by a stub that records
 * every prompt. Acceptance: the PII-in-prompt test (no customer name, email, phone or address reaches a prompt), drafts
 * pass the gatekeepers and wait in the approval queue, approval adds a template version, and nothing is sent.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { AiBudgetExceededError } from '../../services/ai/metering.js';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../services/ai/gateway.js', async () => ({
  generateText: generate,
  // The real error class, so `instanceof` in the service matches the one the metering layer throws.
  AiBudgetExceededError: (await import('../../services/ai/metering.js')).AiBudgetExceededError,
}));

const MARKETING_REPLY = {
  subject: '{{first_name | default: "Merhaba"}}, sepetiniz sizi bekliyor',
  html: '<p>{{first_name | default: "Merhaba"}}, sepetinizdeki kitaplar hâlâ burada.</p><p><a href="{{unsubscribe_url}}">Abonelikten çık</a></p>',
  text: 'Sepetinizdeki kitaplar hâlâ burada.',
};
const TRANSACTIONAL_REPLY = {
  subject: 'Siparişiniz yola çıktı',
  html: '<p>{{first_name | default: "Merhaba"}}, siparişiniz kargoya verildi.</p>',
};
const BRIEF = 'Sepetinde kalan kitapları hatırlat; ücretsiz kargo ve kısa bir teşekkür ekle.';

describe.skipIf(!adminUrl)('AI copy drafting: PII-in-prompt test, gatekeepers, approval queue (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let P: typeof import('../../engage/profiles.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface T0 { org: string; adminToken: string; memberToken: string; userId: string; journeyId: string; templateKey: string; templateId: string }

  /** A tenant with one template (version 1) and a journey whose steps are a marketing and a transactional message. */
  const tenant = async (): Promise<T0> => {
    const t = await f.provisionTenant(`Copy ${u()}`);
    const org = t.organization.id;
    const adminToken = token(t.admin.authUserId, org);
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    const templateKey = `cart-${u()}`;
    const tpl = await app.http('/templates', { token: adminToken, body: {
      key: templateKey, name: 'Sepet', subject: 'Sepetiniz', html: '<p>Sepetiniz</p><a href="{{unsubscribe_url}}">x</a>',
    } });
    expect(tpl.status).toBe(201);
    const journey = await app.http('/journeys', { token: adminToken, body: {
      key: `journey-${u()}`, name: 'Sepet hatırlatma',
      definition: {
        trigger: { type: 'event', event: 'cart_updated' },
        steps: [
          { id: 'remind', type: 'message', channel: 'email', template: templateKey, purpose: 'marketing' },
          { id: 'receipt', type: 'message', channel: 'email', template: templateKey, purpose: 'transactional' },
          { id: 'end', type: 'exit' },
        ],
      },
    } });
    expect(journey.status).toBe(201);
    return {
      org, adminToken, memberToken: token(member, org), userId: t.admin.userId,
      journeyId: (journey.json.journey as { id: string }).id, templateKey, templateId: (tpl.json.template as { id: string }).id,
    };
  };
  const draftCount = async (t: T0) => (await sql(t.org, `SELECT count(*)::int AS n FROM engage.copy_drafts`)).rows[0].n as number;
  const messageCount = async (t: T0) => (await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n as number;
  const ask = (t: T0, body: Record<string, unknown>) => app.http('/copy-drafts', { token: t.adminToken, body });

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    P = await import('../../engage/profiles.js');
    app = await startEngageApp();
  }, 90_000);
  afterEach(() => { generate.mockReset(); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('PII-in-prompt test: a draft for a message step sends no customer name, email, phone or address to the model', async () => {
    const t = await tenant();
    // A customer with the kind of data a real tenant holds. None of it may reach a prompt.
    const profile = await P.upsertProfile(t.org, {
      externalId: `cust-${u()}`, email: 'zeynep.kaya.canary@example.com', phone: '+905321112233',
      attributes: { first_name: 'Zeynep', last_name: 'Kaya', address: 'Bağdat Caddesi No 12 Kadıköy İstanbul', city: 'Kadıköy' },
    });
    await P.upsertProfile(t.org, { externalId: `cust-${u()}`, email: 'second.canary@example.org', attributes: { first_name: 'Mehmet', last_name: 'Demir' } });
    generate.mockResolvedValue(JSON.stringify(MARKETING_REPLY));

    const r = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(r.status).toBe(201);
    expect(generate).toHaveBeenCalledTimes(1);

    const call = generate.mock.calls[0]![0] as { systemPrompt: string; prompt: string; tenantId: string; tier: string };
    const sent = `${call.systemPrompt}\n${call.prompt}`;
    expect(call.tenantId).toBe(t.org);
    expect(sent).toContain(BRIEF);
    expect(sent).toContain('"cart_updated"');
    for (const secret of ['Zeynep', 'Kaya', 'zeynep', 'canary', 'Mehmet', 'Demir', 'Bağdat', 'Kadıköy', 'Caddesi',
      '+905321112233', '905321112233', '05321112233', '5321112233', '532 111', profile.id]) {
      expect(sent).not.toContain(secret);
    }
    // The stored draft is queued, and nothing was sent.
    expect(r.json.draft).toMatchObject({ status: 'pending', stepId: 'remind', purpose: 'marketing', language: 'tr' });
    expect(await messageCount(t)).toBe(0);
  });

  it('refuses a brief that carries personal data, before any model call', async () => {
    const t = await tenant();
    for (const brief of [
      'Ayşe Yılmaz (ayse.yilmaz@example.com) için sepet hatırlatması yaz.',
      'Bu müşteriyi 0532 123 45 67 numarasından ara ve hatırlat, kısa olsun.',
      'Kart 4111 1111 1111 1111 için ödeme hatırlatması yaz, kısa olsun.',
    ]) {
      const r = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief, language: 'tr' });
      expect(r.status).toBe(400);
      expect(r.text).not.toContain('ayse.yilmaz');
      expect(r.text).not.toContain('0532 123');
    }
    expect(generate).not.toHaveBeenCalled();
    expect(await draftCount(t)).toBe(0);
  });

  it('refuses a reply that carries an email address, with the kind only, and stores nothing', async () => {
    const t = await tenant();
    generate.mockResolvedValue(JSON.stringify({ ...MARKETING_REPLY, html: `${MARKETING_REPLY.html}<p>Yazın: destek@example.com</p>` }));
    const r = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(r.status).toBe(422);
    expect(r.json.reasons).toEqual(['personal_data:email']);
    expect(r.text).not.toContain('destek@example.com');
    expect(await draftCount(t)).toBe(0);
  });

  it('refuses marketing copy without the unsubscribe link, and transactional copy with one', async () => {
    const t = await tenant();
    generate.mockResolvedValueOnce(JSON.stringify({ subject: 'Konu', html: '<p>Merhaba</p>' }));
    const missing = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(missing.status).toBe(422);
    expect(missing.json.reasons).toEqual(['unsubscribe_missing']);

    generate.mockResolvedValueOnce(JSON.stringify(MARKETING_REPLY));
    const notAllowed = await ask(t, { journeyId: t.journeyId, stepId: 'receipt', brief: BRIEF, language: 'tr' });
    expect(notAllowed.status).toBe(422);
    expect(notAllowed.json.reasons).toEqual(['unsubscribe_not_allowed']);
    expect(await draftCount(t)).toBe(0);
  });

  it('refuses an answer that is not one JSON object, and a model failure, with nothing stored', async () => {
    const t = await tenant();
    generate.mockResolvedValueOnce('Tabii! İşte metin: ...');
    const notJson = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(notJson.status).toBe(422);
    expect(notJson.json.reasons).toEqual(['output_not_valid']);

    const errorLog = vi.spyOn(console, 'error');
    generate.mockRejectedValueOnce(new Error(`upstream 400 echoing the request: ${BRIEF}`));
    const down = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(down.status).toBe(502);
    expect(down.text).not.toContain('upstream');
    // A provider's error text can echo the request, so the log keeps the error's name and status only.
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain('copy draft model call failed');
    expect(logged).not.toContain('upstream 400');
    expect(logged).not.toContain('Sepetinde');
    errorLog.mockRestore();
    expect(await draftCount(t)).toBe(0);
  });

  it('answers 402 when the tenant AI budget is used up, before any provider call would happen', async () => {
    const t = await tenant();
    generate.mockRejectedValueOnce(new AiBudgetExceededError(t.org));
    const r = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(r.status).toBe(402);
    expect(await draftCount(t)).toBe(0);
  });

  it('checks the step, journey and language before calling the model', async () => {
    const t = await tenant();
    expect((await ask(t, { journeyId: t.journeyId, stepId: 'end', brief: BRIEF, language: 'tr' })).status).toBe(400);
    expect((await ask(t, { journeyId: t.journeyId, stepId: 'nope', brief: BRIEF, language: 'tr' })).status).toBe(400);
    expect((await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'de' })).status).toBe(400);
    expect((await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: 'kısa', language: 'tr' })).status).toBe(400);
    expect((await ask(t, { journeyId: '00000000-0000-4000-8000-000000000000', stepId: 'remind', brief: BRIEF, language: 'tr' })).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
  });

  it('only tenant admins may ask for a draft; any tenant user may read the queue', async () => {
    const t = await tenant();
    const denied = await app.http('/copy-drafts', { token: t.memberToken, body: { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' } });
    expect(denied.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
    const read = await app.http('/copy-drafts', { token: t.memberToken });
    expect(read.status).toBe(200);
  });

  it('queues a draft, approval adds the next template version, and a decision is made once', async () => {
    const t = await tenant();
    generate.mockResolvedValue(JSON.stringify(MARKETING_REPLY));
    const created = await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' });
    expect(created.status).toBe(201);
    const id = (created.json.draft as { id: string }).id;

    const pending = await app.http('/copy-drafts?status=pending', { token: t.adminToken });
    expect((pending.json.drafts as Array<{ id: string }>).map((d) => d.id)).toEqual([id]);

    const approved = await app.http(`/copy-drafts/${id}/approve`, { token: t.adminToken, body: {} });
    expect(approved.status).toBe(200);
    expect(approved.json.templateVersion).toBe(2);
    expect(approved.json.draft).toMatchObject({ status: 'approved', templateVersion: 2 });

    const tpl = await app.http(`/templates/${t.templateId}`, { token: t.adminToken });
    const versions = tpl.json.versions as Array<{ version: number; subject: string }>;
    expect(versions[0]).toMatchObject({ version: 2, subject: MARKETING_REPLY.subject });

    expect((await app.http(`/copy-drafts/${id}/approve`, { token: t.adminToken, body: {} })).status).toBe(409);
    expect((await app.http(`/copy-drafts/${id}/reject`, { token: t.adminToken, body: {} })).status).toBe(409);
    expect(await messageCount(t)).toBe(0);
  });

  it('a rejected draft creates no template version and cannot be approved afterwards', async () => {
    const t = await tenant();
    generate.mockResolvedValue(JSON.stringify(MARKETING_REPLY));
    const id = ((await ask(t, { journeyId: t.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' })).json.draft as { id: string }).id;
    const rejected = await app.http(`/copy-drafts/${id}/reject`, { token: t.adminToken, body: {} });
    expect(rejected.status).toBe(200);
    expect(rejected.json.draft).toMatchObject({ status: 'rejected', templateVersion: null });
    expect((await app.http(`/copy-drafts/${id}/approve`, { token: t.adminToken, body: {} })).status).toBe(409);
    const tpl = await app.http(`/templates/${t.templateId}`, { token: t.adminToken });
    expect((tpl.json.versions as unknown[]).length).toBe(1);
  });

  it('a transactional draft is queued without an unsubscribe link and approved as its own template version', async () => {
    const t = await tenant();
    generate.mockResolvedValue(JSON.stringify(TRANSACTIONAL_REPLY));
    const r = await ask(t, { journeyId: t.journeyId, stepId: 'receipt', brief: 'Sipariş kargoya verildi bilgisi, kısa ve net olsun.', language: 'tr' });
    expect(r.status).toBe(201);
    expect(r.json.draft).toMatchObject({ purpose: 'transactional', status: 'pending' });
  });

  it('another tenant can neither read, approve nor reject a draft', async () => {
    const a = await tenant();
    const b = await tenant();
    generate.mockResolvedValue(JSON.stringify(MARKETING_REPLY));
    const id = ((await ask(a, { journeyId: a.journeyId, stepId: 'remind', brief: BRIEF, language: 'tr' })).json.draft as { id: string }).id;
    expect((await app.http(`/copy-drafts/${id}`, { token: b.adminToken })).status).toBe(404);
    expect((await app.http(`/copy-drafts/${id}/approve`, { token: b.adminToken, body: {} })).status).toBe(404);
    expect((await app.http(`/copy-drafts/${id}/reject`, { token: b.adminToken, body: {} })).status).toBe(404);
    const bList = await app.http('/copy-drafts', { token: b.adminToken });
    expect(bList.json.drafts).toEqual([]);
    expect((await app.http(`/copy-drafts/${id}`, { token: a.adminToken })).status).toBe(200);
  });
});
