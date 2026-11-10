/**
 * One-off campaigns (WP-38, ADR-018) on real Postgres, the real HTTP stack and the mock channel.
 * Acceptance: a template is sent to a segment once; only customers with email consent are enrolled; the send gate decides
 * every message (suppression, sandbox allow-list); a repeated request sends nothing twice; an interrupted send resumes
 * with exact counts; a tenant that cannot send gets a refusal that names the reasons and nothing is written.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageCampaigns.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('one-off campaigns (real Postgres, HTTP, mock channel)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let K: typeof import('../../engage/campaigns/campaigns.js');
  let T: typeof import('../../engage/templates/templates.js');
  let S: typeof import('../../engage/segments/segments.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let D: typeof import('../../engage/messaging/dispatch.js');
  let M: typeof import('../../engage/messaging/index.js');
  let P: typeof import('../../engage/profiles.js');
  let creds: typeof import('../../engage/credentials.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string; admin: string; member: string }

  /** A tenant that can send in sandbox: send_enabled, rate card, budget, one mock email account; an admin and a member. */
  async function tenant(over: { send?: boolean; account?: boolean; billing?: boolean } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Camp ${u()}`);
    const org = t.organization.id;
    if (over.send !== false) await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
    if (over.billing !== false) {
      await M.addRateCard(org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, 'email', 1_000_000_000, 'TRY');
    }
    if (over.account !== false) await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `mock-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }

  type Kind = 'ok' | 'suppressed' | 'unlisted' | 'noconsent';
  /** Customers of group A. ok: consent + allow-listed; suppressed: consent + allow-listed + suppressed address; unlisted: consent, not allow-listed; noconsent: allow-listed, no consent record. */
  async function customers(org: string, plan: Partial<Record<Kind, number>>): Promise<Record<Kind, string[]>> {
    const out: Record<Kind, string[]> = { ok: [], suppressed: [], unlisted: [], noconsent: [] };
    for (const kind of Object.keys(plan) as Kind[]) {
      for (let i = 0; i < (plan[kind] ?? 0); i++) {
        const email = `${kind}-${i}-${u()}@example.com`;
        const p = await P.upsertProfile(org, { externalId: `${kind}-${i}-${u()}`, email });
        await f.admin.query(`UPDATE engage.profiles SET attributes = '{"group":"A"}'::jsonb WHERE organization_id = $1 AND id = $2`, [org, p.id]);
        if (kind !== 'noconsent') await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence) VALUES ($1, $2, 'email', 'granted', 'import', '{"f":"t"}'::jsonb)`, [org, p.id]);
        if (kind !== 'unlisted') await f.admin.query(`INSERT INTO engage.send_allowlist (organization_id, channel, value_normalized) VALUES ($1, 'email', $2)`, [org, email.toLowerCase()]);
        if (kind === 'suppressed') await f.admin.query(`INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, 'manual')`, [org, email.toLowerCase()]);
        out[kind].push(p.id);
      }
    }
    return out;
  }
  async function content(t: Tn): Promise<{ templateId: string; segmentId: string }> {
    const tpl = await T.createTemplate(t.org, t.userId, { key: `promo-${u()}`, name: 'Promo', subject: 'Hello', html: '<p>Hi</p><a href="{{unsubscribe_url}}">unsubscribe</a>' });
    const seg = await S.createSegment(t.org, t.userId, { key: `group-a-${u()}`, name: 'Group A', definition: { where: { field: 'attributes.group', op: 'eq', value: 'A' } } });
    return { templateId: tpl.template.id, segmentId: seg.segment.id };
  }
  const body = (c: { templateId: string; segmentId: string }, over: Record<string, unknown> = {}) => ({ name: 'Autumn books', ...c, holdoutPercent: 0, idempotencyKey: `key-${u()}${u()}`, ...over });
  const campaignRows = async (org: string) => (await sql(org, 'SELECT count(*)::int AS n FROM engage.campaigns')).rows[0].n as number;
  /** The tick that turns enrollments into messages, and the dispatcher that sends them through the gate. */
  async function run(org: string): Promise<void> {
    await E.runTenantTick(org, new Date());
    await D.dispatchDue(org, 5000);
  }
  const withMode = async <T>(mode: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const before = process.env.SEND_MODE;
    if (mode === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = mode;
    try { return await fn(); } finally { if (before === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = before; }
  };

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    process.env.SEND_MODE = 'sandbox'; // every test sends in sandbox unless it says otherwise (withMode)
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    K = await import('../../engage/campaigns/campaigns.js');
    T = await import('../../engage/templates/templates.js');
    S = await import('../../engage/segments/segments.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    D = await import('../../engage/messaging/dispatch.js');
    M = await import('../../engage/messaging/index.js');
    P = await import('../../engage/profiles.js');
    creds = await import('../../engage/credentials.js');
    mock = await import('../../engage/messaging/mockAdapter.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  it('acceptance: sends a template to a segment once; only customers with consent are enrolled and the gate decides each message', async () => {
    const t = await tenant();
    const c = await customers(t.org, { ok: 10, suppressed: 3, unlisted: 4, noconsent: 3 });
    const ids = await content(t);
    const send = vi.spyOn(mock.mockAdapter, 'send');
    try {
      const r = await app.http('/campaigns', { token: t.admin, body: body(ids) });
      expect(r.status).toBe(201);
      expect(r.json.campaign).toMatchObject({ status: 'sent', matched: 17, enrolled: 17, skipped: 0, truncated: false, holdoutPercent: 0 });
      const enrolled = (await sql(t.org, `SELECT profile_id FROM engage.enrollments`)).rows.map((x) => x.profile_id as string);
      expect(new Set(enrolled)).toEqual(new Set([...c.ok, ...c.suppressed, ...c.unlisted]));
      const id = (r.json.campaign as { id: string }).id;
      // Before the executor has run, nothing is created yet and the numbers can still change.
      expect((await app.http(`/campaigns/${id}`, { token: t.member })).json.outcome).toEqual({ messages: 0, byStatus: {}, heldOut: 0, blockedBecause: {}, inFlight: true });
      await run(t.org);
      const outcome = (await app.http(`/campaigns/${id}`, { token: t.member })).json.outcome as { messages: number; byStatus: Record<string, number>; blockedBecause: Record<string, number>; inFlight: boolean; heldOut: number };
      expect(outcome).toMatchObject({ messages: 17, heldOut: 0, inFlight: false, blockedBecause: { suppressed: 3, not_allowlisted: 4 } });
      expect(outcome.byStatus.blocked).toBe(7);
      // 10 reach the adapter; 3 suppressed and 4 not allow-listed (sandbox) are blocked by the gate; nobody without consent is messaged.
      expect(send).toHaveBeenCalledTimes(10);
      const byStatus = Object.fromEntries((await sql(t.org, `SELECT status, count(*)::int AS n FROM engage.messages GROUP BY status`)).rows.map((x) => [x.status, x.n]));
      expect(byStatus.blocked).toBe(7);
      expect(Object.values(byStatus).reduce((a: number, b) => a + (b as number), 0)).toBe(17);
      const noMessage = (await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages WHERE profile_id = ANY($1::uuid[])`, [c.noconsent])).rows[0].n;
      expect(noMessage).toBe(0);
    } finally { send.mockRestore(); }
  });

  it('the campaign is a one-step journey that was approved and activated by the admin, with the template version pinned', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 2 });
    const ids = await content(t);
    const { campaign } = (await app.http('/campaigns', { token: t.admin, body: body(ids) })).json as { campaign: import('../../engage/campaigns/campaigns.js').CampaignView };
    const j = await J.getJourney(t.org, campaign.journeyId);
    expect(j.journey.key).toMatch(/^campaign-[0-9a-f]{16}$/);
    expect(j.versions).toHaveLength(1);
    const v = j.versions[0]!;
    expect(v).toMatchObject({ status: 'active', approvedBy: t.userId, activatedBy: t.userId, createdBy: t.userId });
    expect(v.definition).toMatchObject({ trigger: { type: 'api' }, re_entry: 'never', holdout_percent: 0, steps: [{ id: 'send', type: 'message', channel: 'email', purpose: 'marketing', template_version: 1 }] });
    expect(campaign).toMatchObject({ templateVersion: 1, segmentVersion: 1, createdBy: t.userId });
  });

  it('a repeated request with the same idempotency key returns the same campaign and sends nothing twice, also when two arrive together', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 6 });
    const ids = await content(t);
    const b = body(ids);
    const [x, y] = await Promise.all([app.http('/campaigns', { token: t.admin, body: b }), app.http('/campaigns', { token: t.admin, body: b })]);
    expect([x.status, y.status].sort()).toEqual([200, 201]);
    expect((x.json.campaign as { id: string }).id).toBe((y.json.campaign as { id: string }).id);
    const again = await app.http('/campaigns', { token: t.admin, body: b });
    expect(again).toMatchObject({ status: 200, json: { replayed: true } });
    expect(await campaignRows(t.org)).toBe(1);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(6);
    await run(t.org);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.messages')).rows[0].n).toBe(6);
  });

  it('two campaigns with different keys to the same segment are two sends (each customer is in each)', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 4 });
    const ids = await content(t);
    expect((await app.http('/campaigns', { token: t.admin, body: body(ids, { name: 'First' }) })).status).toBe(201);
    expect((await app.http('/campaigns', { token: t.admin, body: body(ids, { name: 'Second' }) })).status).toBe(201);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(8);
  });

  it('refuses before writing anything when sending is not ready, and names every reason', async () => {
    const off = await tenant();
    await customers(off.org, { ok: 2 });
    const idsOff = await content(off);
    const r1 = await withMode(undefined, () => app.http('/campaigns', { token: off.admin, body: body(idsOff) }));
    expect(r1.status).toBe(409);
    expect((r1.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(['send_mode_off']);

    const disabled = await tenant({ send: false });
    await customers(disabled.org, { ok: 2 });
    const idsDisabled = await content(disabled);
    const r2 = await withMode('sandbox', () => app.http('/campaigns', { token: disabled.admin, body: body(idsDisabled) }));
    expect((r2.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(['tenant_send_disabled']);

    const none = await tenant({ account: false });
    const idsNone = await content(none);
    const r3 = await withMode('sandbox', () => app.http('/campaigns', { token: none.admin, body: body(idsNone) }));
    expect((r3.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(['no_email_account']);

    const live = await tenant();
    const idsLive = await content(live);
    const r4 = await withMode('live', () => app.http('/campaigns', { token: live.admin, body: body(idsLive) }));
    expect((r4.json.problems as Array<{ code: string }>).map((p) => p.code).sort()).toEqual(['account_mode_mismatch', 'readiness_missing']);

    const two = await tenant();
    await creds.createAccount(two.org, two.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `second-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    const idsTwo = await content(two);
    const r5 = await withMode('sandbox', () => app.http('/campaigns', { token: two.admin, body: body(idsTwo) }));
    expect((r5.json.problems as Array<{ code: string }>).map((p) => p.code)).toEqual(['email_account_ambiguous']);

    const unpriced = await tenant({ billing: false });
    const idsUnpriced = await content(unpriced);
    const r6 = await withMode('sandbox', () => app.http('/campaigns', { token: unpriced.admin, body: body(idsUnpriced) }));
    expect((r6.json.problems as Array<{ code: string }>).map((p) => p.code).sort()).toEqual(['no_budget_cap', 'no_rate_card']);

    for (const t of [off, disabled, none, live, two, unpriced]) {
      expect(await campaignRows(t.org)).toBe(0);
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.journeys WHERE key LIKE 'campaign-%'`)).rows[0].n).toBe(0);
    }
  });

  it('refuses when unsubscribe links cannot be built, because no marketing message could be created', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 3 });
    const ids = await content(t);
    const appUrl = process.env.ENGAGE_PUBLIC_APP_URL;
    const apiUrl = process.env.ENGAGE_PUBLIC_API_URL;
    try {
      delete process.env.ENGAGE_PUBLIC_APP_URL;
      const missing = await app.http('/campaigns', { token: t.admin, body: body(ids) });
      expect(missing.status).toBe(409);
      expect(missing.json.problems).toEqual([{ code: 'public_links_missing', message: expect.stringContaining('ENGAGE_PUBLIC_APP_URL is not set') }]);
      process.env.ENGAGE_PUBLIC_APP_URL = appUrl;
      process.env.ENGAGE_PUBLIC_API_URL = 'http://api.example.com';
      const plain = await app.http('/campaigns/readiness', { token: t.admin });
      expect(plain.json).toMatchObject({ ready: false, problems: [{ code: 'public_links_missing', message: expect.stringContaining('must be an https URL') }] });
      expect(await campaignRows(t.org)).toBe(0);
    } finally {
      process.env.ENGAGE_PUBLIC_APP_URL = appUrl;
      process.env.ENGAGE_PUBLIC_API_URL = apiUrl;
    }
    expect((await app.http('/campaigns/readiness', { token: t.admin })).json).toMatchObject({ ready: true });
  });

  it('readiness and preview report the same facts without writing anything', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 5, noconsent: 3 });
    const ids = await content(t);
    const ready = await withMode('sandbox', () => app.http('/campaigns/readiness', { token: t.member }));
    expect(ready).toMatchObject({ status: 200, json: { sendMode: 'sandbox', ready: true, problems: [] } });
    const p = await withMode('sandbox', () => app.http('/campaigns/preview', { token: t.member, body: ids }));
    expect(p.status).toBe(200);
    expect(p.json).toMatchObject({
      template: { version: 1, subject: 'Hello', hasUnsubscribeLink: true }, segment: { version: 1 },
      audience: { inSegment: 8, withConsent: 5, overCap: false }, readiness: { ready: true },
    });
    expect((p.json.audience as { sample: unknown[] }).sample).toHaveLength(5);
    expect(await campaignRows(t.org)).toBe(0);
    const notReady = await withMode(undefined, () => app.http('/campaigns/readiness', { token: t.admin }));
    expect(notReady.json).toMatchObject({ sendMode: 'off', ready: false });
  });

  it('refuses a campaign nobody would receive, or with a bad request, and writes nothing', async () => {
    const t = await tenant();
    await customers(t.org, { noconsent: 4 });
    const ids = await content(t);
    const none = await withMode('sandbox', () => app.http('/campaigns', { token: t.admin, body: body(ids) }));
    expect(none).toMatchObject({ status: 400, json: { issues: [{ path: 'segmentId', message: 'no customer in this segment has email consent' }] } });
    for (const [over, path] of [
      [{ name: '' }, 'name'], [{ holdoutPercent: 60 }, 'holdoutPercent'], [{ holdoutPercent: 1.5 }, 'holdoutPercent'], [{ idempotencyKey: 'short' }, 'idempotencyKey'],
      [{ templateId: 'nope' }, 'templateId'], [{ segmentId: '00000000-0000-4000-8000-000000000000' }, 'segmentId'],
    ] as const) {
      const r = await withMode('sandbox', () => app.http('/campaigns', { token: t.admin, body: body(ids, over) }));
      expect(r.status, JSON.stringify(over)).toBe(400);
      expect((r.json.issues as Array<{ path: string }>).map((i) => i.path), JSON.stringify(over)).toContain(path);
    }
    expect(await campaignRows(t.org)).toBe(0);
  });

  it('a holdout share of the audience runs the journey but is never messaged', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 60 });
    const ids = await content(t);
    const r = await withMode('sandbox', () => app.http('/campaigns', { token: t.admin, body: body(ids, { holdoutPercent: 50 }) }));
    expect(r.json.campaign).toMatchObject({ matched: 60, enrolled: 60, holdoutPercent: 50 });
    const held = (await sql(t.org, `SELECT count(*) FILTER (WHERE cohort = 'holdout')::int AS h, count(*) FILTER (WHERE cohort = 'treatment')::int AS tr FROM engage.enrollments`)).rows[0];
    expect(held.h + held.tr).toBe(60);
    expect(held.h).toBeGreaterThan(15);
    expect(held.h).toBeLessThan(45);
    await run(t.org);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.messages')).rows[0].n).toBe(held.tr);
    const id = (r.json.campaign as { id: string }).id;
    expect((await app.http(`/campaigns/${id}`, { token: t.member })).json.outcome).toMatchObject({ messages: held.tr, heldOut: held.h, inFlight: false });
  });

  it('an interrupted send is finished by resuming it: exact counts, nobody enrolled twice, and a repeat resume changes nothing', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 23 });
    const ids = await content(t);
    const b = body(ids);
    let chunks = 0;
    await expect(withMode('sandbox', () => K.startCampaign(t.org, t.userId, b, { chunk: 5, onChunk: async () => { if (++chunks === 2) throw new Error('crash'); } }))).rejects.toThrow('crash');
    const [half] = (await K.listCampaigns(t.org));
    expect(half).toMatchObject({ status: 'sending', matched: 10, enrolled: 10, finishedAt: null });
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(10);
    // The same request again does not start a second campaign; it reports the one that exists.
    expect(await app.http('/campaigns', { token: t.admin, body: b })).toMatchObject({ status: 200, json: { replayed: true, campaign: { status: 'sending' } } });
    const resumed = await app.http(`/campaigns/${half!.id}/resume`, { token: t.admin, method: 'POST', body: {} });
    expect(resumed.json.campaign).toMatchObject({ status: 'sent', matched: 23, enrolled: 23, skipped: 0 });
    expect((await sql(t.org, 'SELECT count(*)::int AS n, count(DISTINCT profile_id)::int AS d FROM engage.enrollments')).rows[0]).toEqual({ n: 23, d: 23 });
    const again = await app.http(`/campaigns/${half!.id}/resume`, { token: t.admin, method: 'POST', body: {} });
    expect(again.json.campaign).toMatchObject({ status: 'sent', matched: 23 });
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(23);
  });

  it('a customer already enrolled under the campaign\'s key is skipped, not counted twice, and the counts still add up', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 12 });
    const ids = await content(t);
    let chunks = 0;
    await expect(K.startCampaign(t.org, t.userId, body(ids), { chunk: 4, onChunk: async () => { if (++chunks === 1) throw new Error('crash'); } })).rejects.toThrow('crash');
    const [half] = await K.listCampaigns(t.org);
    expect(half).toMatchObject({ status: 'sending', matched: 4, enrolled: 4, skipped: 0 });
    // Someone else (a retry that raced the crash) already enrolled a customer that the cursor has not reached yet.
    const next = (await f.admin.query(
      `SELECT p.id FROM engage.profiles p WHERE p.organization_id = $1 AND p.id > (SELECT last_profile_id FROM engage.campaigns WHERE id = $2) ORDER BY p.id LIMIT 1`, [t.org, half!.id])).rows[0].id as string;
    await f.admin.query(
      `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key, entered_at, current_step, next_run_at)
       SELECT $1, $2, v.id, $3, 'api', $4, now(), 'send', 'infinity' FROM engage.journey_versions v WHERE v.journey_id = $2`, [t.org, half!.journeyId, next, `campaign:${half!.id}:${next}`]);
    const done = await K.enrollCampaign(t.org, half!.id);
    expect(done).toMatchObject({ status: 'sent', matched: 12, enrolled: 11, skipped: 1 });
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(12);
  });

  it('stopping the campaign\'s journey in the middle ends the send where it is; nothing more is enrolled', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 12 });
    const ids = await content(t);
    let stopped = false;
    const out = await withMode('sandbox', () => K.startCampaign(t.org, t.userId, body(ids), {
      chunk: 4, onChunk: async () => { if (!stopped) { stopped = true; const [c] = await K.listCampaigns(t.org); await J.deactivateJourney(t.org, t.userId, c!.journeyId); } },
    }));
    expect(out.campaign).toMatchObject({ status: 'failed', error: 'journey_stopped', enrolled: 4 });
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(4);
  });

  it('the audience cap ends the send and says so only when more customers matched', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 12 });
    const ids = await content(t);
    const capped = await withMode('sandbox', () => K.startCampaign(t.org, t.userId, body(ids), { chunk: 4, maxRun: 8 }));
    expect(capped.campaign).toMatchObject({ status: 'sent', matched: 8, enrolled: 8, truncated: true });
    const exact = await tenant();
    await customers(exact.org, { ok: 8 });
    const idsExact = await content(exact);
    const done = await withMode('sandbox', () => K.startCampaign(exact.org, exact.userId, body(idsExact), { chunk: 4, maxRun: 8 }));
    expect(done.campaign).toMatchObject({ status: 'sent', matched: 8, truncated: false });
  });

  it('a campaign is not in the journey list, but its results are the journey\'s results', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 5 });
    const ids = await content(t);
    await J.createJourney(t.org, t.userId, { key: 'plain', name: 'Plain', definition: { trigger: { type: 'api' }, steps: [{ id: 'wait', type: 'delay', minutes: 60 }] } });
    const { campaign } = (await app.http('/campaigns', { token: t.admin, body: body(ids) })).json as { campaign: import('../../engage/campaigns/campaigns.js').CampaignView };
    const list = (await app.http('/journeys', { token: t.admin })).json.journeys as Array<{ key: string }>;
    expect(list.map((j) => j.key)).toEqual(['plain']);
    const results = await app.http(`/journeys/${campaign.journeyId}/analytics`, { token: t.member });
    expect(results.status).toBe(200);
    // The campaign's journey was enrolled in full (no holdout), so every customer is in the treatment group.
    expect(results.json).toMatchObject({ enrollments: { treatment: { entered: 5 }, holdout: { entered: 0 } } });
  });

  it('roles and tenants: a member reads but cannot start or resume; another tenant sees nothing and cannot use this one\'s template or segment', async () => {
    const a = await tenant();
    const b = await tenant();
    await customers(a.org, { ok: 3 });
    const ids = await content(a);
    expect((await app.http('/campaigns', { token: a.member, body: body(ids) })).status).toBe(403);
    expect((await app.http('/campaigns', { body: body(ids) })).status).toBe(401);
    const made = await app.http('/campaigns', { token: a.admin, body: body(ids) });
    const id = (made.json.campaign as { id: string }).id;
    expect((await app.http('/campaigns', { token: a.member })).json.campaigns).toHaveLength(1);
    expect((await app.http(`/campaigns/${id}`, { token: a.member })).status).toBe(200);
    expect((await app.http(`/campaigns/${id}/resume`, { token: a.member, method: 'POST', body: {} })).status).toBe(403);
    expect((await app.http('/campaigns', { token: b.admin })).json.campaigns).toEqual([]);
    expect((await app.http(`/campaigns/${id}`, { token: b.admin })).status).toBe(404);
    expect((await app.http(`/campaigns/${id}/resume`, { token: b.admin, method: 'POST', body: {} })).status).toBe(404);
    const cross = await withMode('sandbox', () => app.http('/campaigns', { token: b.admin, body: body(ids) }));
    expect(cross.status).toBe(400);
    expect(await campaignRows(b.org)).toBe(0);
  });

  it('the database keeps a finished campaign finished, keeps what it was asked to do, and cannot delete it', async () => {
    const t = await tenant();
    await customers(t.org, { ok: 2 });
    const ids = await content(t);
    const { campaign } = (await withMode('sandbox', () => K.startCampaign(t.org, t.userId, body(ids)))) as { campaign: import('../../engage/campaigns/campaigns.js').CampaignView };
    expect(campaign.status).toBe('sent');
    await expect(sql(t.org, `UPDATE engage.campaigns SET status = 'sending', finished_at = NULL WHERE id = $1`, [campaign.id])).rejects.toThrow(/finished campaign cannot change|permission/);
    await expect(sql(t.org, `UPDATE engage.campaigns SET name = 'x' WHERE id = $1`, [campaign.id])).rejects.toThrow(/permission denied|cannot change/);
    await expect(sql(t.org, `DELETE FROM engage.campaigns WHERE id = $1`, [campaign.id])).rejects.toThrow(/permission denied/);
    // Even the table owner's path cannot rewrite a sending campaign's request.
    const open = await f.admin.query(
      `INSERT INTO engage.campaigns (organization_id, journey_id, name, template_key, template_version, segment_key, segment_version, idempotency_key)
       SELECT organization_id, journey_id, 'open', 't', 1, 's', 1, $2 FROM engage.campaigns WHERE id = $1 RETURNING id`, [campaign.id, `guard-${u()}${u()}`]).catch((e: Error) => e);
    expect(open).toBeInstanceOf(Error); // (organization, journey) is unique: one campaign per journey
  });
});
