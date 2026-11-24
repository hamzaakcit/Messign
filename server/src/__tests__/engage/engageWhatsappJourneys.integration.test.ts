/**
 * WhatsApp in journeys, segments, campaigns and customer entry (WP-40b, ADR-025) on real Postgres and the real HTTP stack:
 * email through the mock channel, WhatsApp through the mock Graph API. Acceptance: a journey sends WhatsApp to a customer who
 * can get it and email to one who cannot (consent, number, suppression), once each; a WhatsApp campaign reaches only customers
 * with WhatsApp consent and a number; a template Meta would not take blocks activation and campaigns before anything is written.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageWhatsappJourneys.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { startMockGraph, type MockGraph } from '../../engage/whatsapp/mock/mockGraphServer.js';

const WABA = '102290129340398';

describe.skipIf(!adminUrl)('WhatsApp in journeys, segments and campaigns (real Postgres, HTTP, mock channels)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  let P: typeof import('../../engage/profiles.js');
  let T: typeof import('../../engage/templates/templates.js');
  let W: typeof import('../../engage/whatsapp/templates.js');
  let C: typeof import('../../engage/whatsapp/templateCheck.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let S: typeof import('../../engage/segments/segments.js');
  let K: typeof import('../../engage/campaigns/campaigns.js');
  let CD: typeof import('../../engage/copy/copyDraft.js');
  let graph: MockGraph;
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const phoneN = (() => { let n = 100000 + Math.floor(Math.random() * 800000); return () => `+905002${n++}`; })();

  interface Tn { org: string; userId: string; admin: string; waTemplate: string; waKey: string; emailKey: string }
  /** A tenant ready to send both channels in sandbox, with one email template and one WhatsApp template approved at Meta. */
  async function tenant(o: { metaStatus?: string | null } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`WaJ ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true, sender_name = 'Kitap Evi', frequency_cap_max = 1000 WHERE organization_id = $1`, [org]);
    for (const channel of ['email', 'whatsapp'] as const) {
      for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel, category, unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, channel, 1_000_000, 'TRY');
    }
    await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `mock-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    await creds.createAccount(org, t.admin.userId, {
      channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', label: `wa-${u()}`,
      config: { phone_number_id: graph.o.phoneNumberId, default_language: 'tr', waba_id: WABA },
      secrets: { access_token: graph.o.accessToken, app_secret: 'app-secret', verify_token: 'v' },
    });
    const emailKey = `promo-${u()}`;
    await T.createTemplate(org, t.admin.userId, { key: emailKey, name: 'Promo', subject: 'Merhaba', html: '<p>Merhaba</p><a href="{{unsubscribe_url}}">unsubscribe</a>' });
    if (o.metaStatus !== null) graph.setTemplate({ name: 'autumn_books', language: 'tr', status: o.metaStatus ?? 'APPROVED', category: 'MARKETING', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.', buttons: [{ type: 'QUICK_REPLY', text: 'Durdur' }] });
    await C.runTemplateCheck(org);
    const waKey = `autumn-wa-${u()}`;
    const wa = await W.createWhatsappTemplate(org, t.admin.userId, {
      key: waKey, name: 'Autumn on WhatsApp',
      content: { metaName: 'autumn_books', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply', bodyText: 'Merhaba {{1}}, yeni kitaplar geldi.', variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }] },
    });
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), waTemplate: wa.template.id, waKey, emailKey };
  }

  interface Who { email?: boolean; phone?: boolean; emailConsent?: boolean; waConsent?: boolean; waSuppressed?: boolean }
  /** A customer in group A with what the case needs; every address and number is on the sandbox allow-list. */
  async function customer(t: Tn, w: Who) {
    const email = w.email === false ? undefined : `${u()}@example.com`;
    const phone = w.phone === false ? undefined : phoneN();
    const p = await P.upsertProfile(t.org, { externalId: `c-${u()}`, email, phone, attributes: { group: 'A', first_name: 'Ayşe' } });
    const at = new Date(Date.now() - 60_000);
    if (w.emailConsent) await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'api', evidence: { test: 'wp40b' }, recordedAt: at });
    if (w.waConsent) await P.recordConsent(t.org, p.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { test: 'wp40b' }, recordedAt: at });
    if (email) await M.addAllowlistEntry(t.org, 'email', email);
    if (phone) await M.addAllowlistEntry(t.org, 'whatsapp', phone);
    if (w.waSuppressed && phone) await f.admin.query(`INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'whatsapp', $2, 'manual')`, [t.org, phone]);
    return { id: p.id, externalId: p.externalId, phone, email };
  }
  /** Runs the executor and the dispatcher once, like the scheduled jobs do. */
  async function run(org: string): Promise<void> {
    await E.runTenantTick(org, new Date());
    await M.dispatchDue(org, 5000);
  }
  const messages = async (t: Tn) => (await sql(t.org, `SELECT profile_id, channel, status FROM engage.messages ORDER BY created_at, id`)).rows as Array<{ profile_id: string; channel: string; status: string }>;
  const fallbackDefinition = (t: Tn) => ({
    trigger: { type: 'api' }, holdout_percent: 0,
    steps: [
      { id: 'choose', type: 'branch', branches: [{ when: { field: 'reachable.whatsapp', op: 'eq', value: true }, next: 'wa' }], otherwise: 'mail' },
      { id: 'wa', type: 'message', channel: 'whatsapp', template: t.waKey, purpose: 'marketing', next: 'done' },
      { id: 'mail', type: 'message', channel: 'email', template: t.emailKey, purpose: 'marketing', next: 'done' },
      { id: 'done', type: 'exit' },
    ],
  });
  async function activeJourney(t: Tn, definition: unknown): Promise<{ id: string; key: string }> {
    const key = `j-${u()}`;
    const { journey } = await J.createJourney(t.org, t.userId, { key, name: 'Autumn', definition });
    await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
    await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
    return { id: journey.id, key };
  }
  const withMode = async <R>(mode: string, fn: () => Promise<R>): Promise<R> => {
    const before = process.env.SEND_MODE;
    process.env.SEND_MODE = mode;
    try { return await fn(); } finally { if (before === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = before; }
  };

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    P = await import('../../engage/profiles.js');
    T = await import('../../engage/templates/templates.js');
    W = await import('../../engage/whatsapp/templates.js');
    C = await import('../../engage/whatsapp/templateCheck.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    S = await import('../../engage/segments/segments.js');
    K = await import('../../engage/campaigns/campaigns.js');
    CD = await import('../../engage/copy/copyDraft.js');
    app = await startEngageApp();
  }, 90_000);
  beforeEach(async () => {
    graph = await startMockGraph({ wabaId: WABA });
    process.env.ENGAGE_WHATSAPP_GRAPH_URL = graph.url;
    process.env.SEND_MODE = 'sandbox';
  });
  afterEach(async () => { await graph.stop(); delete process.env.SEND_MODE; delete process.env.ENGAGE_WHATSAPP_GRAPH_URL; });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('journeys', () => {
    it('acceptance: WhatsApp to a customer who can get it, email to one who cannot, once each however often the executor runs', async () => {
      const t = await tenant();
      const j = await activeJourney(t, fallbackDefinition(t));
      const reachable = await customer(t, { emailConsent: true, waConsent: true });
      const emailOnly = await customer(t, { emailConsent: true });
      const stopped = await customer(t, { emailConsent: true, waConsent: true, waSuppressed: true });
      const noPhone = await customer(t, { phone: false, emailConsent: true, waConsent: true });
      for (const c of [reachable, emailOnly, stopped, noPhone]) await E.triggerApiJourney(t.org, j.key, { externalId: c.externalId, idempotencyKey: `k-${c.id}`, payload: {} });
      await run(t.org);
      await run(t.org);
      const sent = await messages(t);
      const of = (id: string) => sent.filter((m) => m.profile_id === id).map((m) => `${m.channel}:${m.status}`);
      expect(of(reachable.id)).toEqual(['whatsapp:sent']);
      expect(of(emailOnly.id)).toEqual(['email:sent']);
      expect(of(stopped.id)).toEqual(['email:sent']);
      expect(of(noPhone.id)).toEqual(['email:sent']);
      expect(graph.sent).toHaveLength(1);
      expect(graph.sent[0]).toMatchObject({ template: 'autumn_books', params: ['Ayşe'], to: reachable.phone!.slice(1) });
    });

    it('a step must use a template of its own channel', async () => {
      const t = await tenant();
      const wrong = await app.http('/journeys/validate', {
        token: t.admin, body: { definition: { trigger: { type: 'api' }, steps: [
          { id: 'a', type: 'message', channel: 'whatsapp', template: t.emailKey, purpose: 'marketing' },
          { id: 'b', type: 'message', channel: 'email', template: t.waKey, purpose: 'marketing' },
        ] } },
      });
      expect(wrong.json).toMatchObject({ ok: false, errors: [
        { path: 'steps.a.template', message: `"${t.emailKey}" is an email template; this step sends WhatsApp` },
        { path: 'steps.b.template', message: `"${t.waKey}" is a WhatsApp template; this step sends email` },
      ] });
    });

    it('activation is refused while Meta would not take the template, and allowed once it is approved', async () => {
      const t = await tenant({ metaStatus: 'PAUSED' });
      const { journey } = await J.createJourney(t.org, t.userId, { key: `j-${u()}`, name: 'Paused', definition: fallbackDefinition(t) });
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      await expect(J.activateJourneyVersion(t.org, t.userId, journey.id, 1)).rejects.toMatchObject({ issues: [{ path: 'steps.wa.template', message: expect.stringContaining('not_approved') }] });
      graph.setTemplateStatus('autumn_books', 'tr', 'APPROVED');
      await C.runTemplateCheck(t.org);
      expect((await J.activateJourneyVersion(t.org, t.userId, journey.id, 1)).status).toBe('active');
    });

    it('a template Meta never confirmed may be activated in sandbox but not in live mode; a marketing template is never a transactional step', async () => {
      const t = await tenant({ metaStatus: null });
      const { journey } = await J.createJourney(t.org, t.userId, { key: `j-${u()}`, name: 'Unknown', definition: fallbackDefinition(t) });
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      await withMode('live', () => expect(J.activateJourneyVersion(t.org, t.userId, journey.id, 1)).rejects.toMatchObject({ issues: [{ message: expect.stringContaining('status_unknown') }] }));
      expect((await J.activateJourneyVersion(t.org, t.userId, journey.id, 1)).status).toBe('active');

      const t2 = await tenant();
      const def = { trigger: { type: 'api' }, steps: [{ id: 'wa', type: 'message', channel: 'whatsapp', template: t2.waKey, purpose: 'transactional' }] };
      const { journey: j2 } = await J.createJourney(t2.org, t2.userId, { key: `j-${u()}`, name: 'Wrong purpose', definition: def });
      await J.approveJourneyVersion(t2.org, t2.userId, j2.id, 1);
      await expect(J.activateJourneyVersion(t2.org, t2.userId, j2.id, 1)).rejects.toMatchObject({ issues: [{ path: 'steps.wa.purpose' }] });
    });

    it('AI copy drafts stay with email steps', async () => {
      const t = await tenant();
      const j = await activeJourney(t, fallbackDefinition(t));
      await expect(CD.createCopyDraft(t.org, t.userId, { journeyId: j.id, stepId: 'wa', language: 'tr', brief: 'A friendly note about new autumn books for regular readers.' }))
        .rejects.toThrow('Copy drafts are for email steps');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('segments', () => {
    it('count customers by WhatsApp consent and by whether they have a number', async () => {
      const t = await tenant();
      await customer(t, { waConsent: true });
      await customer(t, { waConsent: true, phone: false });
      await customer(t, { emailConsent: true });
      const count = async (where: unknown) => (await app.http('/segments/preview', { token: t.admin, body: { definition: { where } } })).json.count;
      expect(await count({ field: 'consent.whatsapp', op: 'eq', value: 'granted' })).toBe(2);
      expect(await count({ all: [{ field: 'consent.whatsapp', op: 'eq', value: 'granted' }, { field: 'contact.phone', op: 'exists' }] })).toBe(1);
      expect(await count({ field: 'contact.phone', op: 'not_exists' })).toBe(1);
      expect(await count({ field: 'consent.email', op: 'eq', value: 'granted' })).toBe(1);
      const bad = await app.http('/segments/preview', { token: t.admin, body: { definition: { where: { field: 'contact.phone', op: 'eq', value: 'x' } } } });
      expect(bad.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('campaigns', () => {
    async function segment(t: Tn) {
      return (await S.createSegment(t.org, t.userId, { key: `group-a-${u()}`, name: 'Group A', definition: { where: { field: 'attributes.group', op: 'eq', value: 'A' } } })).segment.id;
    }
    it('acceptance: a WhatsApp template sends WhatsApp to the segment\'s customers with WhatsApp consent and a number, once', async () => {
      const t = await tenant();
      const segmentId = await segment(t);
      const ok1 = await customer(t, { waConsent: true });
      const ok2 = await customer(t, { waConsent: true, emailConsent: true });
      await customer(t, { waConsent: true, phone: false });
      await customer(t, { emailConsent: true });
      const preview = (await app.http('/campaigns/preview', { token: t.admin, body: { templateId: t.waTemplate, segmentId } })).json;
      expect(preview).toMatchObject({
        template: { channel: 'whatsapp', subject: null, whatsapp: { metaName: 'autumn_books', category: 'marketing', sendable: true, problems: [] } },
        audience: { inSegment: 4, withConsent: 2 }, readiness: { ready: true, problems: [] },
      });
      const key = `wa-${u()}${u()}`;
      const started = await app.http('/campaigns', { token: t.admin, body: { name: 'Autumn', templateId: t.waTemplate, segmentId, holdoutPercent: 0, idempotencyKey: key } });
      expect(started.status).toBe(201);
      expect(started.json.campaign).toMatchObject({ channel: 'whatsapp', enrolled: 2 });
      await run(t.org);
      await run(t.org);
      expect(graph.sent.map((s) => s.to).sort()).toEqual([ok1.phone!.slice(1), ok2.phone!.slice(1)].sort());
      const again = await app.http('/campaigns', { token: t.admin, body: { name: 'Autumn', templateId: t.waTemplate, segmentId, holdoutPercent: 0, idempotencyKey: key } });
      expect(again.json).toMatchObject({ replayed: true });
      await run(t.org);
      expect(graph.sent).toHaveLength(2);
      const id = (started.json.campaign as { id: string }).id;
      const got = (await app.http(`/campaigns/${id}`, { token: t.admin })).json;
      expect(got).toMatchObject({ campaign: { channel: 'whatsapp' }, outcome: { byStatus: { sent: 2 }, blockedBecause: {}, waitingBecause: {} } });
    });

    it('does not need the public unsubscribe links that an email campaign needs', async () => {
      const t = await tenant();
      const segmentId = await segment(t);
      await customer(t, { waConsent: true, emailConsent: true });
      const emailTemplate = (await sql(t.org, `SELECT id FROM engage.templates WHERE key = $1`, [t.emailKey])).rows[0].id as string;
      const before = process.env.ENGAGE_PUBLIC_API_URL;
      delete process.env.ENGAGE_PUBLIC_API_URL;
      try {
        const wa = (await K.previewCampaign(t.org, { templateId: t.waTemplate, segmentId })).readiness;
        const mail = (await K.previewCampaign(t.org, { templateId: emailTemplate, segmentId })).readiness;
        expect(wa.problems.map((p) => p.code)).not.toContain('public_links_missing');
        expect(mail.problems.map((p) => p.code)).toContain('public_links_missing');
      } finally { process.env.ENGAGE_PUBLIC_API_URL = before; }
    });

    it('a template Meta would not take refuses the campaign with the reason, and writes nothing', async () => {
      const t = await tenant({ metaStatus: 'PAUSED' });
      const segmentId = await segment(t);
      await customer(t, { waConsent: true });
      const r = await app.http('/campaigns', { token: t.admin, body: { name: 'Paused', templateId: t.waTemplate, segmentId, holdoutPercent: 0, idempotencyKey: `p-${u()}${u()}` } });
      expect(r.status).toBe(409);
      expect(r.json.problems).toEqual([expect.objectContaining({ code: 'template_not_sendable', message: expect.stringContaining('not_approved') })]);
      expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.campaigns')).rows[0].n).toBe(0);
    });

    it('a campaign larger than the account\'s daily limit sends up to it and says the rest are waiting for the window', async () => {
      const t = await tenant();
      await f.admin.query(`UPDATE engage.channel_accounts SET config = config || '{"daily_recipient_limit": 2}'::jsonb WHERE organization_id = $1 AND channel = 'whatsapp'`, [t.org]);
      const segmentId = await segment(t);
      for (let i = 0; i < 3; i++) await customer(t, { waConsent: true });
      const started = await app.http('/campaigns', { token: t.admin, body: { name: 'Big', templateId: t.waTemplate, segmentId, holdoutPercent: 0, idempotencyKey: `b-${u()}${u()}` } });
      await run(t.org);
      expect(graph.sent).toHaveLength(2);
      const id = (started.json.campaign as { id: string }).id;
      expect((await app.http(`/campaigns/${id}`, { token: t.admin })).json.outcome).toMatchObject({ byStatus: { sent: 2, queued: 1 }, waitingBecause: { account_pacing: 1 }, inFlight: true });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('adding a customer by hand', () => {
    it('records WhatsApp consent with the note as evidence, and needs the number and the note', async () => {
      const t = await tenant();
      const noPhone = await app.http('/profiles', { token: t.admin, body: { external_id: `m-${u()}`, whatsapp_consent: true, consent_note: 'Store checkout' } });
      expect(noPhone).toMatchObject({ status: 400, json: { error: expect.stringContaining('phone number') } });
      const noNote = await app.http('/profiles', { token: t.admin, body: { external_id: `m-${u()}`, phone: '+905001234567', whatsapp_consent: true } });
      expect(noNote).toMatchObject({ status: 400, json: { error: expect.stringContaining('WhatsApp') } });
      const ok = await app.http('/profiles', { token: t.admin, body: { external_id: `m-${u()}`, phone: '+905001234568', whatsapp_consent: true, consent_note: 'Store checkout, 20 November' } });
      expect(ok.status).toBe(201);
      const rows = (await sql(t.org, `SELECT channel, status, evidence FROM engage.consents WHERE profile_id = $1`, [(ok.json as { id: string }).id])).rows;
      expect(rows).toEqual([expect.objectContaining({ channel: 'whatsapp', status: 'granted', evidence: expect.objectContaining({ method: 'manual_entry', note: 'Store checkout, 20 November' }) })]);
    });
  });
});
