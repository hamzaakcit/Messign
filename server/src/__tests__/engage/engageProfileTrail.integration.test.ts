/**
 * Customer list and audit trail (WP-19) on real Postgres and the real HTTP stack.
 * Acceptance: a message is traceable to its send-gate decision and to the consent record in force at that decision.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('customer list and audit trail (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let P: typeof import('../../engage/profiles.js');
  let T: typeof import('../../engage/templates/templates.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let I: typeof import('../../engage/ingest.js');
  let creds: typeof import('../../engage/credentials.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string; token: string; account: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Trail ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
    await M.addRateCard(org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
    const a = await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    await T.createTemplate(org, t.admin.userId, { key: 'news', name: 'News', subject: 'Yeni kitaplar', html: '<p>Merhaba</p><a href="{{unsubscribe_url}}">Abonelikten çık</a>' });
    return { org, userId: t.admin.userId, token: token(t.admin.authUserId, org), account: a.id };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (t: Tn, path: string) => app.http(path, { token: t.token }) as Promise<{ status: number; json: any }>;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    P = await import('../../engage/profiles.js');
    T = await import('../../engage/templates/templates.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    I = await import('../../engage/ingest.js');
    creds = await import('../../engage/credentials.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('list', () => {
    it('newest first, page by page with a cursor, with email, consent and suppression at a glance', async () => {
      const t = await tenant();
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push((await P.upsertProfile(t.org, { externalId: `c-${i}`, email: `c${i}-${u()}@example.com` })).id);
      await P.recordConsent(t.org, ids[4]!, { channel: 'email', status: 'granted', source: 'api', evidence: { test: 'wp19' } });
      const p4 = await P.getProfile(t.org, ids[4]!);
      await P.addSuppression(t.org, 'email', p4.identifiers.email!, 'hard_bounce');
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 4; page++) {
        const r = await get(t, `/profiles?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        expect(r.status).toBe(200);
        seen.push(...(r.json.profiles as Array<{ id: string }>).map((p) => p.id));
        cursor = r.json.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen).toEqual([...ids].reverse());
      const first = (await get(t, '/profiles?limit=1')).json.profiles[0];
      expect(first).toMatchObject({ id: ids[4], externalId: 'c-4', email: p4.identifiers.email, emailConsent: 'granted', suppressed: true, erased: false });
      expect((await get(t, '/profiles?cursor=not-a-cursor')).status).toBe(400);
    });

    it('searches by any email the customer ever had, or by the start of an external id (wildcards are literal)', async () => {
      const t = await tenant();
      const old = `old-${u()}@example.com`;
      const p = await P.upsertProfile(t.org, { externalId: 'kitap-100', email: old });
      await P.upsertProfile(t.org, { externalId: 'kitap-100', email: `new-${u()}@example.com` });
      await P.upsertProfile(t.org, { externalId: 'kalem-1' });
      await P.upsertProfile(t.org, { externalId: '50%_off' });
      const ids = async (q: string) => ((await get(t, `/profiles?q=${encodeURIComponent(q)}`)).json.profiles as Array<{ id: string; externalId: string }>).map((x) => x.externalId);
      expect(await ids(old.toUpperCase())).toEqual(['kitap-100']);
      expect(await ids('kitap')).toEqual(['kitap-100']);
      expect(await ids('k')).toEqual(expect.arrayContaining(['kitap-100', 'kalem-1']));
      expect(await ids('%')).toEqual([]);
      expect(await ids('50%_')).toEqual(['50%_off']);
      expect(await ids('nobody@example.com')).toEqual([]);
      expect(p.id).toBeTruthy();
    });

    it('a tenant sees only its own customers, in the list and the trail', async () => {
      const a = await tenant();
      const b = await tenant();
      const pa = await P.upsertProfile(a.org, { externalId: 'shared-id', email: `x-${u()}@example.com` });
      await P.upsertProfile(b.org, { externalId: 'shared-id' });
      expect((await get(b, '/profiles?q=shared')).json.profiles.map((p: { id: string }) => p.id)).not.toContain(pa.id);
      expect((await get(b, `/profiles/${pa.id}/trail`)).status).toBe(404);
      expect((await get(b, `/profiles/not-a-uuid/trail`)).status).toBe(404);
      expect((await app.http(`/profiles/${pa.id}/trail`, {})).status).toBe(401);
    });
  });

  describe('trail', () => {
    it('acceptance: each message shows its gate decisions, each with the consent record in force when it was taken', async () => {
      const t = await tenant();
      const email = `trace-${u()}@example.com`;
      const p = await P.upsertProfile(t.org, { externalId: 'trace-1', email });
      await M.addAllowlistEntry(t.org, 'email', email);
      await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'web', evidence: { form: 'signup' } });
      const grant = (await sql(t.org, `SELECT id FROM engage.consents WHERE profile_id = $1`, [p.id])).rows[0].id;
      const tpl = (await T.listTemplates(t.org))[0]!;
      // Another customer's revocation, recorded after this customer's grant and before the decision, is not theirs.
      const other = await P.upsertProfile(t.org, { externalId: 'trace-other', email: `other-${u()}@example.com` });
      await new Promise((r) => setTimeout(r, 20));
      await P.recordConsent(t.org, other.id, { channel: 'email', status: 'revoked', source: 'web' });
      process.env.SEND_MODE = 'sandbox';
      try {
        const first = (await T.createTemplatedMessage(t.org, { profileId: p.id, templateId: tpl.id, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `m-${u()}` })).message;
        expect(await M.dispatchMessage(t.org, first.id)).toMatchObject({ outcome: 'sent' });
        await new Promise((r) => setTimeout(r, 20));
        // Revoked through the tenant's own site (an unsubscribe link would also suppress the address, R-3).
        await P.recordConsent(t.org, p.id, { channel: 'email', status: 'revoked', source: 'web' });
        const revoke = (await sql(t.org, `SELECT id FROM engage.consents WHERE profile_id = $1 AND status = 'revoked'`, [p.id])).rows[0].id;
        const second = (await T.createTemplatedMessage(t.org, { profileId: p.id, templateId: tpl.id, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `m-${u()}` })).message;
        expect(await M.dispatchMessage(t.org, second.id)).toMatchObject({ outcome: 'blocked', code: 'no_consent' });

        const r = await get(t, `/profiles/${p.id}/trail`);
        expect(r.status).toBe(200);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byId = new Map<string, any>((r.json.messages as Array<{ id: string }>).map((m) => [m.id, m]));
        expect(byId.get(first.id)).toMatchObject({
          status: 'sent', purpose: 'marketing', subject: 'Yeni kitaplar', template: { id: tpl.id, version: 1 }, journey: null,
          events: [{ type: 'sending', source: 'system' }, { type: 'sent', source: 'system' }],
          decisions: [{ decision: 'allow', code: 'allowed', sendMode: 'sandbox', consentInForce: { id: grant, status: 'granted', source: 'web' } }],
        });
        expect(byId.get(second.id)).toMatchObject({
          status: 'blocked',
          events: [{ type: 'blocked', errorCode: 'no_consent' }],
          decisions: [{ decision: 'deny', code: 'no_consent', consentInForce: { id: revoke, status: 'revoked', source: 'web' } }],
        });
        expect(byId.get(second.id).decisions[0].reasons.map((x: { code: string }) => x.code)).toContain('no_consent');
        expect(r.json.consents.map((c: { status: string }) => c.status)).toEqual(['revoked', 'granted']);
        expect(r.json.consents[1]).toMatchObject({ source: 'web', evidence: { form: 'signup' } });
      } finally { delete process.env.SEND_MODE; }
    });

    it('a decision taken before any consent record shows none in force', async () => {
      const t = await tenant();
      const email = `none-${u()}@example.com`;
      const p = await P.upsertProfile(t.org, { externalId: 'none-1', email });
      await M.addAllowlistEntry(t.org, 'email', email);
      const tpl = (await T.listTemplates(t.org))[0]!;
      process.env.SEND_MODE = 'sandbox';
      try {
        const m = (await T.createTemplatedMessage(t.org, { profileId: p.id, templateId: tpl.id, purpose: 'marketing', channelAccountId: t.account, idempotencyKey: `m-${u()}` })).message;
        await M.dispatchMessage(t.org, m.id);
        await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'api', evidence: { later: true } });
      } finally { delete process.env.SEND_MODE; }
      const trail = (await get(t, `/profiles/${p.id}/trail`)).json;
      expect(trail.messages[0].decisions[0]).toMatchObject({ decision: 'deny', code: 'no_consent', consentInForce: null });
    });

    it('shows journeys step by step, links a journey message to its enrollment and step, and lists events, identifiers and suppressions', async () => {
      const t = await tenant();
      const oldEmail = `j-old-${u()}@example.com`;
      const p = await P.upsertProfile(t.org, { externalId: 'journey-1', email: oldEmail });
      await P.addSuppression(t.org, 'email', oldEmail, 'hard_bounce');
      await P.upsertProfile(t.org, { externalId: 'journey-1', email: `j-new-${u()}@example.com` });
      const { journey } = await J.createJourney(t.org, t.userId, { key: 'welcome', name: 'Hoş geldin', definition: {
        trigger: { type: 'event', event: 'signed_up' }, holdout_percent: 0,
        steps: [{ id: 'hello', type: 'message', channel: 'email', template: 'news', purpose: 'marketing' }, { id: 'pause', type: 'delay', minutes: 60 }],
      } });
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
      const now = new Date();
      await I.trackEvents(t.org, [{ client_event_id: `ev-${u()}`, external_id: 'journey-1', name: 'signed_up', occurred_at: now.toISOString(), properties: { plan: 'free' } }]);
      await E.runTenantTick(t.org, now);

      const trail = (await get(t, `/profiles/${p.id}/trail`)).json;
      expect(trail.profile).toMatchObject({ id: p.id, externalId: 'journey-1' });
      expect(trail.enrollments).toHaveLength(1);
      const en = trail.enrollments[0];
      expect(en).toMatchObject({ journeyKey: 'welcome', journeyName: 'Hoş geldin', version: 1, status: 'active', cohort: 'treatment', triggerKind: 'event', currentStep: 'pause' });
      expect(en.steps).toMatchObject([{ stepId: 'hello', stepType: 'message', status: 'done', outcome: 'queued' }, { stepId: 'pause', stepType: 'delay', status: 'started' }]);
      expect(trail.messages[0]).toMatchObject({ id: en.steps[0].messageId, journey: { enrollmentId: en.id, journeyKey: 'welcome', stepId: 'hello' }, status: 'queued', decisions: [] });
      expect(trail.events).toMatchObject([{ name: 'signed_up', properties: { plan: 'free' } }]);
      expect(trail.identifiers.map((i: { value: string; active: boolean }) => [i.value, i.active])).toEqual(expect.arrayContaining([[oldEmail, false]]));
      expect(trail.identifiers.filter((i: { active: boolean }) => i.active)).toHaveLength(1);
      // A suppression of an address the customer used to have is still shown.
      expect(trail.suppressions).toEqual([{ channel: 'email', value: oldEmail, reason: 'hard_bounce', createdAt: expect.any(String) }]);
    });
  });
});
