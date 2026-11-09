/**
 * Journey executor (WP-16) on real Postgres and the non-bypass engage role: event and API triggers, delay,
 * wait-until with timeout, exit conditions, the step ledger, and the tick. The clock is passed in.
 * Acceptance: a retry (a repeated, concurrent or crashed run, a replayed trigger) never repeats a step's effect, and an
 * order after a cart ends the enrollment, also when the order arrives first.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';

const MIN = 60_000;
const cartJourney = (over: Record<string, unknown> = {}) => ({
  trigger: { type: 'event', event: 'cart_updated' },
  exit_when: [{ event: 'order_completed' }],
  steps: [{ id: 'wait', type: 'delay', minutes: 60 }, { id: 'finish', type: 'exit' }],
  ...over,
});
const PROPS: Record<string, Record<string, unknown>> = {
  cart_updated: { cart_id: 'c1', items: [{ sku: 'x', qty: 1 }] },
  checkout_started: { cart_id: 'c1' },
  order_completed: { order_id: 'o1' },
};

describe.skipIf(!adminUrl)('journey executor (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let E: typeof import('../../engage/journeys/engine.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let I: typeof import('../../engage/ingest.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  // Every event in these tests happened in the last few hours, so ingestion accepts it; the engine's clock is at().
  const base = Date.now() - 3 * 3600_000;
  const at = (minutes: number) => new Date(base + minutes * MIN);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Ctx { org: string; userId: string; journeyId: string; key: string }
  async function journey(def: unknown, t?: { org: string; userId: string }): Promise<Ctx> {
    const tenant: { org: string; userId: string } = t
      ?? await f.provisionTenant(`Eng ${u()}`).then((x) => ({ org: x.organization.id, userId: x.admin.userId }));
    const key = `j-${u()}`;
    const { journey: j } = await J.createJourney(tenant.org, tenant.userId, { key, name: 'Test', definition: def });
    await J.approveJourneyVersion(tenant.org, tenant.userId, j.id, 1);
    await J.activateJourneyVersion(tenant.org, tenant.userId, j.id, 1);
    return { ...tenant, journeyId: j.id, key };
  }
  async function person(org: string): Promise<string> {
    const ext = `p-${u()}`;
    await sql(org, `INSERT INTO engage.profiles (organization_id, external_id, attributes) VALUES ($1, $2, '{"tier":"gold"}'::jsonb)`, [org, ext]);
    return ext;
  }
  /** Tracks an event through the real ingestion path and returns its outbox id. */
  async function track(org: string, ext: string, name: string, minute: number, props: Record<string, unknown> = {}): Promise<string> {
    const id = `ev-${u()}`;
    const r = await I.trackEvents(org, [{ client_event_id: id, external_id: ext, name, occurred_at: at(minute).toISOString(), properties: { ...PROPS[name], ...props } }]);
    expect(r[0]).toMatchObject({ status: 'accepted' });
    return (await sql(org, `SELECT o.id FROM engage.trigger_outbox o JOIN engage.event_keys k ON k.organization_id = o.organization_id AND k.event_id = o.event_id
                            WHERE k.client_event_id = $1`, [id])).rows[0].id as string;
  }
  const enrollments = async (org: string) => (await sql(org,
    `SELECT id, status, end_reason, current_step, next_run_at, trigger_kind FROM engage.enrollments ORDER BY created_at`)).rows as Array<
      { id: string; status: string; end_reason: string | null; current_step: string; next_run_at: Date; trigger_kind: string }>;
  const ledger = async (org: string, id: string) => (await sql(org,
    `SELECT step_id, status, outcome, next_step, started_at, wake_at FROM engage.enrollment_steps WHERE enrollment_id = $1 ORDER BY id`, [id])).rows;
  /** Enrolls one profile through a cart event at minute 0 and returns the enrollment id. */
  async function enrolled(c: Ctx, ext?: string): Promise<{ id: string; ext: string }> {
    const p = ext ?? await person(c.org);
    expect(await E.processTriggerOutbox(c.org, await track(c.org, p, 'cart_updated', 0), at(0))).toMatchObject({ status: 'done', enrolled: 1 });
    const e = (await enrollments(c.org)).at(-1)!;
    return { id: e.id, ext: p };
  }

  beforeAll(async () => {
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    E = await import('../../engage/journeys/engine.js');
    J = await import('../../engage/journeys/journeys.js');
    I = await import('../../engage/ingest.js');
    app = await startEngageApp();
    // Warm the pool so the concurrency tests really run in parallel.
    await Promise.all(Array.from({ length: 8 }, () => f.engage.withEngageTenant(f.A.organization.id, (c) => c.query('SELECT pg_sleep(0.05)'))));
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('event triggers', () => {
    it('an event enrolls the profile once; a replayed or concurrent processing of the trigger enrolls nobody again', async () => {
      const c = await journey(cartJourney());
      const ext = await person(c.org);
      const outbox = await track(c.org, ext, 'cart_updated', 0);
      const results = await Promise.all(Array.from({ length: 5 }, () => E.processTriggerOutbox(c.org, outbox, at(0))));
      expect(results.filter((r) => r.status === 'done')).toEqual([{ status: 'done', enrolled: 1, woken: 0 }]);
      expect(results.filter((r) => r.status === 'skipped')).toHaveLength(4);
      expect(await E.processTriggerOutbox(c.org, outbox, at(1))).toEqual({ status: 'skipped' });
      const [e] = await enrollments(c.org);
      expect(e).toMatchObject({ status: 'active', current_step: 'wait', trigger_kind: 'event' });
      expect((await sql(c.org, `SELECT status FROM engage.trigger_outbox WHERE id = $1`, [outbox])).rows[0].status).toBe('done');
    });

    it('a second cart event while the profile is in the journey does not enroll it twice', async () => {
      const c = await journey(cartJourney());
      const { id, ext } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(1));
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'cart_updated', 5), at(5))).toMatchObject({ enrolled: 0, woken: 1 });
      expect(await enrollments(c.org)).toHaveLength(1);
    });

    it('applies the trigger filter to the event and the profile', async () => {
      const c = await journey(cartJourney({
        trigger: { type: 'event', event: 'cart_updated', filter: { all: [{ field: 'event.total', op: 'gte', value: 100 }, { field: 'attributes.tier', op: 'eq', value: 'gold' }] } },
      }));
      const ext = await person(c.org);
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'cart_updated', 0, { total: 50 }), at(0))).toMatchObject({ enrolled: 0 });
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'cart_updated', 1, { total: 150 }), at(1))).toMatchObject({ enrolled: 1 });
    });

    it('an event older than a day starts nothing (a backfill of history must not enroll everyone)', async () => {
      const c = await journey(cartJourney());
      const ext = await person(c.org);
      const outbox = await track(c.org, ext, 'cart_updated', 0);
      expect(await E.processTriggerOutbox(c.org, outbox, new Date(at(0).getTime() + E.MAX_TRIGGER_AGE_MS + MIN))).toMatchObject({ status: 'done', enrolled: 0 });
      expect(await enrollments(c.org)).toEqual([]);
    });

    it('a journey that is not active, or listens to another event, enrolls nobody', async () => {
      const c = await journey(cartJourney());
      await J.deactivateJourney(c.org, c.userId, c.journeyId);
      await journey(cartJourney({ trigger: { type: 'event', event: 'checkout_started' } }), c);
      const ext = await person(c.org);
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'cart_updated', 0), at(0))).toMatchObject({ enrolled: 0 });
    });
  });

  describe('delay and the step ledger', () => {
    it('waits until the delay is over, counted from the trigger, then finishes; each step is recorded once', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      expect(await E.runEnrollment(c.org, id, at(10))).toEqual({ status: 'waiting', step: 'wait', until: at(60) });
      expect(await E.runEnrollment(c.org, id, at(20))).toEqual({ status: 'waiting', step: 'wait', until: at(60) });
      expect((await enrollments(c.org))[0]!.next_run_at).toEqual(at(60));
      expect(await ledger(c.org, id)).toMatchObject([{ step_id: 'wait', status: 'started', started_at: at(0), wake_at: at(60) }]);
      expect(await E.runEnrollment(c.org, id, at(61))).toEqual({ status: 'completed', reason: 'exit_step' });
      expect(await ledger(c.org, id)).toMatchObject([
        { step_id: 'wait', status: 'done', outcome: 'elapsed', next_step: 'finish' },
        { step_id: 'finish', status: 'done', outcome: 'exit', next_step: null },
      ]);
      expect(await E.runEnrollment(c.org, id, at(62))).toEqual({ status: 'skipped' });
    });

    it('acceptance: concurrent runs of a due enrollment act once', async () => {
      // Several rounds: whether runs overlap depends on timing, and one overlapping round is enough to catch a missing lock.
      const c = await journey(cartJourney());
      for (let round = 0; round < 5; round++) {
        const { id } = await enrolled(c, await person(c.org));
        await E.runEnrollment(c.org, id, at(10));
        const results = await Promise.all(Array.from({ length: 6 }, () => E.runEnrollment(c.org, id, at(61))));
        expect(results.filter((r) => r.status !== 'skipped')).toEqual([{ status: 'completed', reason: 'exit_step' }]);
        expect(await ledger(c.org, id)).toHaveLength(2);
      }
    }, 30_000);

    it('a step that is already done is never run again, even if the enrollment points back at it', async () => {
      const c = await journey(cartJourney({ steps: [{ id: 'a', type: 'delay', minutes: 10 }, { id: 'b', type: 'delay', minutes: 30 }] }));
      const { id } = await enrolled(c);
      expect(await E.runEnrollment(c.org, id, at(15))).toMatchObject({ status: 'waiting', step: 'b' });
      await sql(c.org, `UPDATE engage.enrollments SET current_step = 'a' WHERE id = $1`, [id]);
      expect(await E.runEnrollment(c.org, id, at(16))).toEqual({ status: 'waiting', step: 'b', until: at(45) });
      expect(await ledger(c.org, id)).toMatchObject([{ step_id: 'a', status: 'done' }, { step_id: 'b', status: 'started' }]);
    });

    it('acceptance: a run that crashes part-way leaves nothing behind, and the retry does the work once', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(10));
      // Make finishing the first step fail for this one enrollment, as a crash between two writes would.
      const fn = `engage.test_crash_${u()}`;
      await f.admin.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated crash'; END $$`);
      await f.admin.query(`CREATE TRIGGER test_crash BEFORE UPDATE ON engage.enrollment_steps FOR EACH ROW WHEN (NEW.enrollment_id = '${id}') EXECUTE FUNCTION ${fn}()`);
      try {
        await expect(E.runEnrollment(c.org, id, at(61))).rejects.toThrow(/simulated crash/);
      } finally {
        await f.admin.query('DROP TRIGGER test_crash ON engage.enrollment_steps');
        await f.admin.query(`DROP FUNCTION ${fn}()`);
      }
      expect(await ledger(c.org, id)).toMatchObject([{ step_id: 'wait', status: 'started' }]);
      expect((await enrollments(c.org))[0]).toMatchObject({ status: 'active', current_step: 'wait' });
      expect(await E.runEnrollment(c.org, id, at(62))).toEqual({ status: 'completed', reason: 'exit_step' });
      expect(await ledger(c.org, id)).toHaveLength(2);
    });

    it('a later step counts from when the previous one finished', async () => {
      const c = await journey(cartJourney({ steps: [{ id: 'a', type: 'delay', minutes: 10 }, { id: 'b', type: 'delay', minutes: 30 }] }));
      const { id } = await enrolled(c);
      expect(await E.runEnrollment(c.org, id, at(15))).toEqual({ status: 'waiting', step: 'b', until: at(45) });
      expect(await E.runEnrollment(c.org, id, at(45))).toEqual({ status: 'completed', reason: 'end' });
    });
  });

  describe('exit conditions', () => {
    it('acceptance: an order after the cart ends the enrollment, and wakes it right away', async () => {
      const c = await journey(cartJourney());
      const { id, ext } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(1));
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'order_completed', 5), at(5))).toMatchObject({ woken: 1 });
      expect((await enrollments(c.org))[0]!.next_run_at).toEqual(at(5));
      expect(await E.runEnrollment(c.org, id, at(5))).toEqual({ status: 'exited', reason: 'exit_event' });
      expect(await ledger(c.org, id)).toMatchObject([{ step_id: 'wait', status: 'started' }]);
      expect(await E.runEnrollment(c.org, id, at(61))).toEqual({ status: 'skipped' });
    });

    it('acceptance: an order that arrives before the cart event (out of order) still ends it', async () => {
      const c = await journey(cartJourney());
      const ext = await person(c.org);
      // The order happened at minute 5 and is processed first; the cart event (minute 0) arrives late.
      await E.processTriggerOutbox(c.org, await track(c.org, ext, 'order_completed', 5), at(6));
      expect(await E.processTriggerOutbox(c.org, await track(c.org, ext, 'cart_updated', 0), at(7))).toMatchObject({ enrolled: 1 });
      const [e] = await enrollments(c.org);
      expect(await E.runEnrollment(c.org, e!.id, at(7))).toEqual({ status: 'exited', reason: 'exit_event' });
      expect(await ledger(c.org, e!.id)).toEqual([]);
    });

    it('an order before the cart, or one that does not match the exit filter, does not end it', async () => {
      const c = await journey(cartJourney({ exit_when: [{ event: 'order_completed', filter: { field: 'event.total', op: 'gt', value: 0 } }] }));
      const ext = await person(c.org);
      await track(c.org, ext, 'order_completed', -10, { total: 99 });
      const { id } = await enrolled(c, ext);
      await track(c.org, ext, 'order_completed', 5, { total: 0 });
      expect(await E.runEnrollment(c.org, id, at(61))).toEqual({ status: 'completed', reason: 'exit_step' });
    });

    it('an exit event that is also the trigger does not end the enrollment it started', async () => {
      const c = await journey(cartJourney({ trigger: { type: 'event', event: 'order_completed' } }));
      const ext = await person(c.org);
      await E.processTriggerOutbox(c.org, await track(c.org, ext, 'order_completed', 0), at(0));
      const [e] = await enrollments(c.org);
      expect(await E.runEnrollment(c.org, e!.id, at(1))).toMatchObject({ status: 'waiting' });
    });

    it('stopping the journey ends running enrollments; activating a newer version does not', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await J.addJourneyVersion(c.org, c.userId, c.journeyId, cartJourney({ steps: [{ id: 'other', type: 'exit' }] }));
      await J.approveJourneyVersion(c.org, c.userId, c.journeyId, 2);
      await J.activateJourneyVersion(c.org, c.userId, c.journeyId, 2);
      expect(await E.runEnrollment(c.org, id, at(10))).toEqual({ status: 'waiting', step: 'wait', until: at(60) });
      await J.deactivateJourney(c.org, c.userId, c.journeyId);
      expect(await E.runEnrollment(c.org, id, at(61))).toEqual({ status: 'exited', reason: 'journey_stopped' });
    });
  });

  describe('wait_until', () => {
    const waitJourney = (onTimeout: 'next' | 'exit', event = 'checkout_started') => cartJourney({
      exit_when: [],
      steps: [
        { id: 'w', type: 'wait_until', event, filter: { field: 'event.cart_id', op: 'eq', value: 'c1' }, timeout_minutes: 30, on_timeout: onTimeout },
        { id: 'finish', type: 'exit' },
      ],
    });

    it('a matching event before the deadline continues the journey', async () => {
      const c = await journey(waitJourney('exit'));
      const { id, ext } = await enrolled(c);
      expect(await E.runEnrollment(c.org, id, at(5))).toEqual({ status: 'waiting', step: 'w', until: at(30) });
      await track(c.org, ext, 'checkout_started', 10, { cart_id: 'other' });
      expect(await E.runEnrollment(c.org, id, at(11))).toMatchObject({ status: 'waiting' });
      await track(c.org, ext, 'checkout_started', 12);
      expect(await E.runEnrollment(c.org, id, at(13))).toEqual({ status: 'completed', reason: 'exit_step' });
      expect(await ledger(c.org, id)).toMatchObject([{ step_id: 'w', outcome: 'matched' }, { step_id: 'finish' }]);
    });

    it('on timeout, exits or continues as defined; an event after the deadline does not count', async () => {
      const exiting = await journey(waitJourney('exit'));
      const a = await enrolled(exiting);
      expect(await E.runEnrollment(exiting.org, a.id, at(31))).toEqual({ status: 'exited', reason: 'wait_timeout' });

      const going = await journey(waitJourney('next'));
      const b = await enrolled(going);
      await track(going.org, b.ext, 'checkout_started', 40);
      expect(await E.runEnrollment(going.org, b.id, at(45))).toEqual({ status: 'completed', reason: 'exit_step' });
      expect(await ledger(going.org, b.id)).toMatchObject([{ step_id: 'w', outcome: 'timed_out', next_step: 'finish' }, { step_id: 'finish' }]);
    });

    it('the trigger event itself does not satisfy a wait for the same event', async () => {
      const c = await journey(waitJourney('exit', 'cart_updated'));
      const { id } = await enrolled(c);
      expect(await E.runEnrollment(c.org, id, at(1))).toMatchObject({ status: 'waiting', step: 'w' });
    });
  });

  describe('API trigger (HTTP)', () => {
    async function apiKey(org: string): Promise<string> {
      const k = f.keys.generateApiKey();
      await f.admin.query(`INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'trigger-test', $2, $3, '{journeys:trigger}')`, [org, k.prefix, k.hash]);
      return k.plaintext;
    }
    const apiJourney = { trigger: { type: 'api' }, steps: [{ id: 'wait', type: 'delay', minutes: 5 }] };

    it('enrolls once per idempotency key; the same request again is a duplicate, a different one with the same key is refused', async () => {
      const c = await journey(apiJourney);
      const key = await apiKey(c.org);
      const ext = await person(c.org);
      const path = `/v1/journeys/${c.key}/trigger`;
      const body = { external_id: ext, idempotency_key: 'order-1', payload: { order_id: 'o1' } };
      const first = await app.http(path, { key, body });
      expect(first).toMatchObject({ status: 202, json: { status: 'enrolled' } });
      const again = await app.http(path, { key, body: { ...body, payload: { order_id: 'o1' } } });
      expect(again).toMatchObject({ status: 200, json: { status: 'duplicate', duplicate: true, enrollment_id: first.json.enrollment_id } });
      expect(await app.http(path, { key, body: { ...body, payload: { order_id: 'o2' } } })).toMatchObject({ status: 409 });
      expect(await app.http(path, { key, body: { ...body, idempotency_key: 'order-2' } })).toMatchObject({ status: 200, json: { status: 'not_enrolled', reason: 'already_in_journey' } });
      expect(await enrollments(c.org)).toHaveLength(1);
      // A retry gets the first answer even after the journey was stopped.
      await J.deactivateJourney(c.org, c.userId, c.journeyId);
      expect(await app.http(path, { key, body })).toMatchObject({ status: 200, json: { status: 'duplicate', enrollment_id: first.json.enrollment_id } });
    });

    it('a request that loses the race to an identical one gets the winner\'s enrollment', async () => {
      const c = await journey(apiJourney);
      const ext = await person(c.org);
      const input = { externalId: ext, idempotencyKey: `k-${u()}`, payload: { n: 1 } };
      const ids = (await sql(c.org, `SELECT p.id AS profile, v.id AS version FROM engage.profiles p, engage.journey_versions v WHERE p.external_id = $1 AND v.journey_id = $2`, [ext, c.journeyId])).rows[0];
      // The winner's insert is open (not committed) while the loser checks and inserts; the loser waits, then sees it.
      const winner = await f.admin.connect();
      try {
        await winner.query('BEGIN');
        const w = await winner.query(
          `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key, request_hash, entered_at, current_step, next_run_at)
           VALUES ($1, $2, $3, $4, 'api', $5, $6, now(), 'wait', now()) RETURNING id`,
          [c.org, c.journeyId, ids.version, ids.profile, `api:${input.idempotencyKey}`, E.triggerRequestHash(ext, input.payload)]);
        const loser = E.triggerApiJourney(c.org, c.key, input, at(0));
        await new Promise((r) => setTimeout(r, 300));
        await winner.query('COMMIT');
        expect(await loser).toEqual({ status: 'duplicate', enrollmentId: w.rows[0].id });
      } finally {
        await winner.query('ROLLBACK').catch(() => undefined);
        winner.release();
      }
    });

    it('concurrent identical requests produce one enrollment and the same answer', async () => {
      const c = await journey(apiJourney);
      const ext = await person(c.org);
      const input = { externalId: ext, idempotencyKey: `k-${u()}`, payload: {} };
      const results = await Promise.all(Array.from({ length: 6 }, () => E.triggerApiJourney(c.org, c.key, input, at(0))));
      expect(new Set(results.map((r) => (r as { enrollmentId: string }).enrollmentId)).size).toBe(1);
      expect(results.filter((r) => r.status === 'enrolled')).toHaveLength(1);
      expect(await enrollments(c.org)).toHaveLength(1);
    });

    it('404 for an unknown journey or profile, 409 for an event-triggered journey; create_if_missing creates the profile', async () => {
      const c = await journey(apiJourney);
      const key = await apiKey(c.org);
      const ext = `new-${u()}`;
      expect(await app.http(`/v1/journeys/nope-${u()}/trigger`, { key, body: { external_id: ext, idempotency_key: 'a' } })).toMatchObject({ status: 404 });
      expect(await app.http(`/v1/journeys/${c.key}/trigger`, { key, body: { external_id: ext, idempotency_key: 'a' } })).toMatchObject({ status: 404 });
      expect(await app.http(`/v1/journeys/${c.key}/trigger`, { key, body: { external_id: ext, idempotency_key: 'a', create_if_missing: true } })).toMatchObject({ status: 202 });
      const ev = await journey(cartJourney(), c);
      expect(await app.http(`/v1/journeys/${ev.key}/trigger`, { key, body: { external_id: ext, idempotency_key: 'b' } })).toMatchObject({ status: 409 });
    });

    it('a key of one tenant cannot trigger or see another tenant\'s journey', async () => {
      const c = await journey(apiJourney);
      const other = await f.provisionTenant(`Other ${u()}`);
      const key = await apiKey(other.organization.id);
      const ext = await person(c.org);
      expect(await app.http(`/v1/journeys/${c.key}/trigger`, { key, body: { external_id: ext, idempotency_key: 'x' } })).toMatchObject({ status: 404 });
      expect(await enrollments(c.org)).toEqual([]);
    });
  });

  it('the tick drains the outbox and runs what is due, across tenants', async () => {
    const one = await journey(cartJourney());
    const two = await journey(cartJourney());
    for (const c of [one, two]) for (let i = 0; i < 3; i++) await track(c.org, await person(c.org), 'cart_updated', 0);
    const states = async () => (await Promise.all([one, two].map((c) => enrollments(c.org)))).flat();
    // A batch of one: one tick keeps draining the outbox batch after batch, so six triggers need at most two ticks (a
    // second only when a parallel test file holds the row the first reached, which stops a tick early by design).
    for (let tick = 0; tick < 2 && (await states()).length < 6; tick++) await E.runJourneyTick({ now: () => at(0), batch: 1 });
    expect(await states()).toHaveLength(6);
    // Then the due enrollments, with the normal batch size.
    for (let tick = 0; tick < 3 && (await states()).some((e) => e.next_run_at.getTime() !== at(60).getTime()); tick++) await E.runJourneyTick({ now: () => at(0) });
    for (const e of await states()) expect(e).toMatchObject({ status: 'active', next_run_at: at(60) });
    for (let tick = 0; tick < 3 && (await states()).some((e) => e.status !== 'completed'); tick++) await E.runJourneyTick({ now: () => at(61) });
    for (const e of await states()) expect(e).toMatchObject({ status: 'completed', end_reason: 'exit_step' });
  }, 90_000);

  describe('database guards', () => {
    it('an ended enrollment and a finished step cannot change; nothing can be deleted', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(61));
      await expect(sql(c.org, `UPDATE engage.enrollments SET status = 'active', end_reason = NULL, ended_at = NULL WHERE id = $1`, [id])).rejects.toThrow(/ended enrollment cannot change/);
      await expect(sql(c.org, `UPDATE engage.enrollment_steps SET outcome = 'exit' WHERE enrollment_id = $1`, [id])).rejects.toThrow(/finished step cannot change/);
      await expect(sql(c.org, `UPDATE engage.enrollments SET payload = '{}'::jsonb WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(c.org, `DELETE FROM engage.enrollment_steps WHERE enrollment_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(c.org, `DELETE FROM engage.enrollments WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('a running enrollment keeps its identity, and a started step keeps its deadline', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(1));
      await expect(f.admin.query(`UPDATE engage.enrollments SET entered_at = now() WHERE id = $1`, [id])).rejects.toThrow(/identity cannot change/);
      await expect(f.admin.query(`UPDATE engage.enrollment_steps SET wake_at = now() WHERE enrollment_id = $1`, [id])).rejects.toThrow(/start cannot change/);
    });

    it('the work lists show the scheduler ids only, only what is due, and the scheduler sees no rows itself', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(1));
      await f.engage.withEngageScheduler(async (s) => {
        expect((await s.query('SELECT 1 FROM engage.enrollments')).rowCount).toBe(0);
        const due = (when: Date) => s.query('SELECT * FROM engage.due_enrollment_work(1000, $1)', [when]);
        const later = await due(at(60));
        expect(later.fields.map((x) => x.name)).toEqual(['organization_id', 'enrollment_id']);
        expect(later.rows).toContainEqual({ organization_id: c.org, enrollment_id: id });
        expect((await due(at(59))).rows.map((r) => r.enrollment_id)).not.toContain(id);
      });
    });

    it('the database allows one enrollment per trigger key and one ledger row per step', async () => {
      const c = await journey(cartJourney());
      const { id } = await enrolled(c);
      await E.runEnrollment(c.org, id, at(61));
      const row = (await sql(c.org, 'SELECT * FROM engage.enrollments WHERE id = $1', [id])).rows[0];
      await expect(sql(c.org,
        `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key, entered_at, current_step, next_run_at)
         VALUES ($1, $2, $3, $4, 'event', $5, now(), 'wait', now())`,
        [c.org, row.journey_id, row.journey_version_id, row.profile_id, row.trigger_key])).rejects.toThrow(/enrollments_organization_id_journey_id_trigger_key_key/);
      await expect(sql(c.org,
        `INSERT INTO engage.enrollment_steps (organization_id, enrollment_id, step_id, step_type, started_at) VALUES ($1, $2, 'wait', 'delay', now())`,
        [c.org, id])).rejects.toThrow(/enrollment_steps_organization_id_enrollment_id_step_id_key/);
    });
  });
});
