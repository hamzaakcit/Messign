/**
 * Journey message steps, branch, re-entry and holdout (WP-17), end to end on real Postgres and the mock channel:
 * event -> enrollment -> steps -> message (same transaction as the step) -> dispatcher -> send gate -> mock adapter.
 * Acceptance: a retry of any step never creates a second message; an order after the cart ends the enrollment and no
 * message is created; the re-entry rule holds; holdout is 10% ±2% over 10,000 enrollments.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

const MIN = 60_000;
const remind = { id: 'remind', type: 'message', channel: 'email', template: 'cart-reminder', purpose: 'marketing' };
const cartJourney = (over: Record<string, unknown> = {}) => ({
  trigger: { type: 'event', event: 'cart_updated' },
  exit_when: [{ event: 'order_completed' }],
  holdout_percent: 0,
  steps: [{ id: 'wait', type: 'delay', minutes: 60 }, remind],
  ...over,
});
const PROPS: Record<string, Record<string, unknown>> = {
  cart_updated: { cart_id: 'c-42', items: [{ sku: 'x', qty: 1 }] },
  order_completed: { order_id: 'o1' },
};

describe.skipIf(!adminUrl)('journey messages, branch, re-entry and holdout (real Postgres, mock channel)', () => {
  let f: TenancyFixture;
  let E: typeof import('../../engage/journeys/engine.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let I: typeof import('../../engage/ingest.js');
  let M: typeof import('../../engage/messaging/index.js');
  let T: typeof import('../../engage/templates/templates.js');
  let P: typeof import('../../engage/profiles.js');
  let creds: typeof import('../../engage/credentials.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const base = Date.now() - 3 * 3600_000;
  const at = (minutes: number) => new Date(base + minutes * MIN);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string }
  /** A tenant that can send: send_enabled, rate cards, budget, one mock email account, the reminder template. */
  async function tenant(o: { accounts?: number } = {}): Promise<Tn> {
    const t = await f.provisionTenant(`Msg ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
    for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(org, { channel: 'email', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
    for (let i = 0; i < (o.accounts ?? 1); i++) {
      await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `a-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    }
    await T.createTemplate(org, t.admin.userId, {
      key: 'cart-reminder', name: 'Sepet', subject: 'Sepetiniz bekliyor',
      html: '<p>Merhaba {{first_name | default: "okur"}}, sepetiniz ({{payload.cart_id}}) duruyor.</p><a href="{{unsubscribe_url}}">Abonelikten çık</a>',
    });
    return { org, userId: t.admin.userId };
  }
  async function journey(t: Tn, def: unknown): Promise<{ id: string; key: string }> {
    const key = `j-${u()}`;
    const { journey: j } = await J.createJourney(t.org, t.userId, { key, name: 'Sepet terk', definition: def });
    await J.approveJourneyVersion(t.org, t.userId, j.id, 1);
    await J.activateJourneyVersion(t.org, t.userId, j.id, 1);
    return { id: j.id, key };
  }
  /** A consented, allowlisted customer. */
  async function customer(t: Tn, attributes: Record<string, unknown> = {}): Promise<{ id: string; ext: string }> {
    const ext = `c-${u()}`;
    const email = `${u()}@example.com`;
    const p = await P.upsertProfile(t.org, { externalId: ext, email, attributes });
    await P.recordConsent(t.org, p.id, { channel: 'email', status: 'granted', source: 'api', evidence: { test: 'wp17' } });
    await M.addAllowlistEntry(t.org, 'email', email);
    return { id: p.id, ext };
  }
  async function track(t: Tn, ext: string, name: string, minute: number): Promise<string> {
    const id = `ev-${u()}`;
    const r = await I.trackEvents(t.org, [{ client_event_id: id, external_id: ext, name, occurred_at: at(minute).toISOString(), properties: PROPS[name]! }]);
    expect(r[0]).toMatchObject({ status: 'accepted' });
    return (await sql(t.org, `SELECT o.id FROM engage.trigger_outbox o JOIN engage.event_keys k ON k.organization_id = o.organization_id AND k.event_id = o.event_id
                              WHERE k.client_event_id = $1`, [id])).rows[0].id as string;
  }
  /** Cart at minute 0, processed; returns the enrollment id. */
  async function cart(t: Tn, ext: string): Promise<string> {
    await E.processTriggerOutbox(t.org, await track(t, ext, 'cart_updated', 0), at(0));
    return (await sql(t.org, `SELECT e.id FROM engage.enrollments e JOIN engage.profiles p ON p.id = e.profile_id WHERE p.external_id = $1 ORDER BY e.created_at DESC LIMIT 1`, [ext])).rows[0].id;
  }
  const messages = async (t: Tn) => (await sql(t.org, `SELECT id, idempotency_key, purpose, status, content FROM engage.messages ORDER BY created_at`)).rows;
  const ledger = async (t: Tn, id: string) => (await sql(t.org,
    `SELECT step_id, status, outcome, next_step, message_id FROM engage.enrollment_steps WHERE enrollment_id = $1 ORDER BY id`, [id])).rows;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    E = await import('../../engage/journeys/engine.js');
    J = await import('../../engage/journeys/journeys.js');
    I = await import('../../engage/ingest.js');
    M = await import('../../engage/messaging/index.js');
    T = await import('../../engage/templates/templates.js');
    P = await import('../../engage/profiles.js');
    creds = await import('../../engage/credentials.js');
    mock = await import('../../engage/messaging/mockAdapter.js');
    await Promise.all(Array.from({ length: 8 }, () => f.engage.withEngageTenant(f.A.organization.id, (c) => c.query('SELECT pg_sleep(0.05)'))));
  }, 90_000);
  afterEach(() => { delete process.env.SEND_MODE; mock.resetMockAdapter(); });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  describe('message step', () => {
    it('end to end: the step creates one message with the step\'s idempotency key, and the dispatcher sends it once', async () => {
      const t = await tenant();
      const c = await customer(t, { first_name: 'Ayşe' });
      await journey(t, cartJourney());
      const id = await cart(t, c.ext);
      expect(await E.runEnrollment(t.org, id, at(61))).toEqual({ status: 'completed', reason: 'end' });
      const [m] = await messages(t);
      expect(m).toMatchObject({ idempotency_key: `journey:${id}:remind`, purpose: 'marketing', status: 'queued' });
      expect(m.content).toMatchObject({ subject: 'Sepetiniz bekliyor' });
      expect(m.content.html).toContain('Merhaba Ayşe, sepetiniz (c-42) duruyor.');
      expect(await ledger(t, id)).toMatchObject([{ step_id: 'wait', outcome: 'elapsed' }, { step_id: 'remind', status: 'done', outcome: 'queued', message_id: m.id }]);

      const send = vi.spyOn(mock.mockAdapter, 'send');
      try {
        process.env.SEND_MODE = 'sandbox';
        expect(await M.dispatchDueAcrossTenants({ onlyOrganizations: [t.org] })).toEqual({ sent: 1 });
        expect(await M.dispatchDueAcrossTenants({ onlyOrganizations: [t.org] })).toEqual({});
        expect(send).toHaveBeenCalledTimes(1);
        expect((await messages(t))[0]).toMatchObject({ status: 'sent' });
      } finally { send.mockRestore(); }
    });

    it('with SEND_MODE off the dispatcher sends nothing and the message waits', async () => {
      const t = await tenant();
      const c = await customer(t);
      await journey(t, cartJourney());
      await E.runEnrollment(t.org, await cart(t, c.ext), at(61));
      const send = vi.spyOn(mock.mockAdapter, 'send');
      try {
        for (const mode of [undefined, 'off', 'typo']) {
          if (mode === undefined) delete process.env.SEND_MODE; else process.env.SEND_MODE = mode;
          expect(await M.dispatchDueAcrossTenants({ onlyOrganizations: [t.org] })).toEqual({});
        }
        expect(send).not.toHaveBeenCalled();
      } finally { send.mockRestore(); }
      expect((await messages(t))[0]).toMatchObject({ status: 'queued' });
      expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.send_decisions')).rows[0].n).toBe(0);
    });

    it('acceptance: a run that crashes after creating the message leaves no message; the retry creates exactly one', async () => {
      const t = await tenant();
      const c = await customer(t);
      await journey(t, cartJourney());
      const id = await cart(t, c.ext);
      await E.runEnrollment(t.org, id, at(10));
      const fn = `engage.test_crash_${u()}`;
      await f.admin.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step_id = 'remind' THEN RAISE EXCEPTION 'simulated crash'; END IF; RETURN NEW; END $$`);
      await f.admin.query(`CREATE TRIGGER test_crash_msg BEFORE UPDATE ON engage.enrollment_steps FOR EACH ROW WHEN (NEW.enrollment_id = '${id}') EXECUTE FUNCTION ${fn}()`);
      try {
        await expect(E.runEnrollment(t.org, id, at(61))).rejects.toThrow(/simulated crash/);
      } finally {
        await f.admin.query('DROP TRIGGER test_crash_msg ON engage.enrollment_steps');
        await f.admin.query(`DROP FUNCTION ${fn}()`);
      }
      expect(await messages(t)).toEqual([]);
      expect(await E.runEnrollment(t.org, id, at(62))).toEqual({ status: 'completed', reason: 'end' });
      expect(await messages(t)).toHaveLength(1);
    });

    it('acceptance: concurrent and repeated runs create one message per enrollment', async () => {
      const t = await tenant();
      await journey(t, cartJourney());
      for (let round = 0; round < 4; round++) {
        const c = await customer(t);
        const id = await cart(t, c.ext);
        await E.runEnrollment(t.org, id, at(10));
        await Promise.all(Array.from({ length: 6 }, () => E.runEnrollment(t.org, id, at(61))));
        await E.runEnrollment(t.org, id, at(62));
      }
      const all = await messages(t);
      expect(all).toHaveLength(4);
      expect(new Set(all.map((m) => m.idempotency_key)).size).toBe(4);
    }, 30_000);

    it('acceptance: an order after the cart ends the enrollment and no message is created, also out of order', async () => {
      const t = await tenant();
      await journey(t, cartJourney());
      const a = await customer(t);
      const ida = await cart(t, a.ext);
      await E.runEnrollment(t.org, ida, at(1));
      await E.processTriggerOutbox(t.org, await track(t, a.ext, 'order_completed', 30), at(30));
      expect(await E.runEnrollment(t.org, ida, at(30))).toEqual({ status: 'exited', reason: 'exit_event' });

      const b = await customer(t);
      await E.processTriggerOutbox(t.org, await track(t, b.ext, 'order_completed', 5), at(6));
      const idb = await cart(t, b.ext);
      expect(await E.runEnrollment(t.org, idb, at(61))).toEqual({ status: 'exited', reason: 'exit_event' });
      expect(await messages(t)).toEqual([]);
    });

    it('fails closed, creating nothing, without an email account or with more than one', async () => {
      for (const [accounts, reason] of [[0, 'no_email_account'], [2, 'email_account_ambiguous']] as const) {
        const t = await tenant({ accounts });
        const c = await customer(t);
        await journey(t, cartJourney());
        expect(await E.runEnrollment(t.org, await cart(t, c.ext), at(61))).toEqual({ status: 'failed', reason });
        expect(await messages(t)).toEqual([]);
      }
    });

    it('a pinned template version is used even after a newer one is published', async () => {
      const t = await tenant();
      const c = await customer(t);
      const tpl = (await T.listTemplates(t.org))[0]!;
      await T.addTemplateVersion(t.org, t.userId, tpl.id, { subject: 'Yeni konu', html: '<a href="{{unsubscribe_url}}">x</a>' });
      await journey(t, cartJourney({ steps: [{ ...remind, template_version: 1 }] }));
      await E.runEnrollment(t.org, await cart(t, c.ext), at(1));
      expect((await messages(t))[0]!.content).toMatchObject({ subject: 'Sepetiniz bekliyor', template_version: 1 });
    });
  });

  it('branch: the first matching branch wins, otherwise the fallback', async () => {
    const t = await tenant();
    await journey(t, cartJourney({
      steps: [
        { id: 'route', type: 'branch', branches: [
          { when: { field: 'attributes.tier', op: 'eq', value: 'gold' }, next: 'remind' },
          { when: { field: 'payload.cart_id', op: 'exists' }, next: 'done' },
        ], otherwise: 'remind' },
        remind,
        { id: 'done', type: 'exit' },
      ],
    }));
    const gold = await customer(t, { tier: 'gold' });
    const plain = await customer(t);
    const g = await cart(t, gold.ext);
    const p = await cart(t, plain.ext);
    expect(await E.runEnrollment(t.org, g, at(1))).toMatchObject({ status: 'completed' });
    expect(await E.runEnrollment(t.org, p, at(1))).toEqual({ status: 'completed', reason: 'exit_step' });
    expect(await ledger(t, g)).toMatchObject([{ step_id: 'route', outcome: 'matched', next_step: 'remind' }, { step_id: 'remind', outcome: 'queued' }, { step_id: 'done' }]);
    expect(await ledger(t, p)).toMatchObject([{ step_id: 'route', outcome: 'matched', next_step: 'done' }, { step_id: 'done' }]);
    expect(await messages(t)).toHaveLength(1);
  });

  describe('re-entry', () => {
    it('never: a profile enters a journey once; after_exit: again once the previous enrollment ended', async () => {
      const t = await tenant();
      const once = await journey(t, cartJourney({ steps: [{ id: 'x', type: 'exit' }] }));
      const again = await journey(t, cartJourney({ re_entry: 'after_exit', steps: [{ id: 'y', type: 'exit' }] }));
      const c = await customer(t);
      expect(await E.processTriggerOutbox(t.org, await track(t, c.ext, 'cart_updated', 0), at(0))).toMatchObject({ enrolled: 2 });
      // A second cart while both are running: neither enrolls again.
      expect(await E.processTriggerOutbox(t.org, await track(t, c.ext, 'cart_updated', 1), at(1))).toMatchObject({ enrolled: 0 });
      for (const r of (await sql(t.org, `SELECT id FROM engage.enrollments`)).rows) await E.runEnrollment(t.org, r.id, at(2));
      expect(await E.processTriggerOutbox(t.org, await track(t, c.ext, 'cart_updated', 3), at(3))).toMatchObject({ enrolled: 1 });
      const counts = (await sql(t.org, `SELECT journey_id, count(*)::int AS n FROM engage.enrollments GROUP BY journey_id`)).rows;
      expect(Object.fromEntries(counts.map((r) => [r.journey_id, r.n]))).toEqual({ [once.id]: 1, [again.id]: 2 });
    });

    it('the trigger API reports a refused re-entry', async () => {
      const t = await tenant();
      const j = await journey(t, { trigger: { type: 'api' }, holdout_percent: 0, steps: [{ id: 'x', type: 'exit' }] });
      const c = await customer(t);
      const first = await E.triggerApiJourney(t.org, j.key, { externalId: c.ext, idempotencyKey: 'a', payload: {} }, at(0));
      await E.runEnrollment(t.org, (first as { enrollmentId: string }).enrollmentId, at(0));
      expect(await E.triggerApiJourney(t.org, j.key, { externalId: c.ext, idempotencyKey: 'b', payload: {} }, at(1)))
        .toEqual({ status: 'not_enrolled', reason: 're_entry_not_allowed' });
    });
  });

  describe('holdout', () => {
    it('a holdout enrollment runs every step and records the message step as held out, with no message', async () => {
      const t = await tenant();
      await journey(t, cartJourney({ holdout_percent: 50, steps: [remind, { id: 'after', type: 'delay', minutes: 5 }] }));
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) ids.push(await cart(t, (await customer(t)).ext));
      const cohorts = (await sql(t.org, `SELECT id, cohort FROM engage.enrollments`)).rows as Array<{ id: string; cohort: string }>;
      const held = cohorts.filter((r) => r.cohort === 'holdout');
      expect(held.length).toBeGreaterThan(0);
      expect(held.length).toBeLessThan(20);
      for (const id of ids) await E.runEnrollment(t.org, id, at(1));
      for (const h of held) expect(await ledger(t, h.id)).toMatchObject([{ step_id: 'remind', outcome: 'held_out', message_id: null }, { step_id: 'after', status: 'started' }]);
      expect(await messages(t)).toHaveLength(20 - held.length);
    }, 30_000);

    it('acceptance: 10% ±2% of 10,000 enrollments are holdout (the default); 0% means none', async () => {
      const t = await tenant();
      const j = await journey(t, { trigger: { type: 'api' }, steps: [{ id: 'wait', type: 'delay', minutes: 5 }] });
      const none = await journey(t, { trigger: { type: 'api' }, holdout_percent: 0, steps: [{ id: 'wait', type: 'delay', minutes: 5 }] });
      const N = 10_000;
      // Enrolled "in 2100": never due, so a journey tick in a parallel test file does not have to run 10,000 of them.
      const later = new Date('2100-01-01T00:00:00Z');
      await sql(t.org, `INSERT INTO engage.profiles (organization_id, external_id) SELECT $1, 'h-' || g FROM generate_series(1, $2::int) g`, [t.org, N]);
      for (let i = 0; i < N; i += 25) {
        await Promise.all(Array.from({ length: 25 }, (_, k) => E.triggerApiJourney(t.org, j.key, { externalId: `h-${i + k + 1}`, idempotencyKey: `k-${i + k + 1}`, payload: {} }, later)));
      }
      for (let i = 1; i <= 500; i++) await E.triggerApiJourney(t.org, none.key, { externalId: `h-${i}`, idempotencyKey: `k-${i}`, payload: {} }, later);
      const r = (await sql(t.org, `SELECT journey_id, count(*)::int AS n, count(*) FILTER (WHERE cohort = 'holdout')::int AS held FROM engage.enrollments GROUP BY journey_id`)).rows;
      const by = Object.fromEntries(r.map((x) => [x.journey_id, x]));
      expect(by[j.id]!.n).toBe(N);
      expect(by[j.id]!.held / N).toBeGreaterThanOrEqual(0.08);
      expect(by[j.id]!.held / N).toBeLessThanOrEqual(0.12);
      expect(by[none.id]).toMatchObject({ n: 500, held: 0 });
    }, 180_000);

    it('the cohort draw follows the percentage exactly at its edges', () => {
      expect(E.drawCohort(10, () => 999)).toBe('holdout');
      expect(E.drawCohort(10, () => 1000)).toBe('treatment');
      expect(E.drawCohort(0, () => 0)).toBe('treatment');
      expect(E.drawCohort(50, () => 4999)).toBe('holdout');
    });

    it('the cohort cannot be changed afterwards, not even by the database owner', async () => {
      const t = await tenant();
      await journey(t, cartJourney());
      const id = await cart(t, (await customer(t)).ext);
      await expect(f.admin.query(`UPDATE engage.enrollments SET cohort = 'holdout' WHERE id = $1`, [id])).rejects.toThrow(/identity cannot change/);
    });
  });

  it('the dispatcher work list returns ids only, and only due queued messages', async () => {
    const t = await tenant();
    const c = await customer(t);
    await journey(t, cartJourney());
    await E.runEnrollment(t.org, await cart(t, c.ext), at(61));
    const [m] = await messages(t);
    await f.engage.withEngageScheduler(async (s) => {
      const r = await s.query('SELECT * FROM engage.due_message_work(1000)');
      expect(r.fields.map((x) => x.name)).toEqual(['organization_id', 'message_id']);
      expect(r.rows).toContainEqual({ organization_id: t.org, message_id: m.id });
    });
    await sql(t.org, `UPDATE engage.messages SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`, [m.id]);
    await f.engage.withEngageScheduler(async (s) => {
      expect((await s.query('SELECT message_id FROM engage.due_message_work(1000)')).rows.map((r) => r.message_id)).not.toContain(m.id);
    });
  });
});
