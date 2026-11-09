import { createHash } from 'crypto';
import { withEngageScheduler, withEngageTenant } from '../db.js';
import { errorFields, logError } from '../log.js';
import { canonical } from '../messaging/messages.js';
import { upsertProfileOn } from '../profiles.js';
import { matches, type ConditionContext } from './conditions.js';
import { defaultNext, type JourneyDefinition } from './definition.js';

/**
 * The journey executor (WP-16, ADR-012). The database is the truth; pg-boss only wakes the executor up.
 *
 *   trigger_outbox row (written with the event, WP-08)
 *     -> processTriggerOutbox: enroll the profile in every active journey the event starts, wake its running ones
 *   POST /v1/journeys/:key/trigger
 *     -> triggerApiJourney: enroll once per idempotency key
 *   due enrollment (next_run_at <= now)
 *     -> runEnrollment: exit check, then steps until one has to wait or the journey ends
 *
 * Every function here does its work in one tenant transaction and holds the row lock of what it works on
 * (FOR UPDATE SKIP LOCKED), so two workers never act on the same enrollment, and a crash rolls back to the last
 * committed state. Each step is recorded once in engage.enrollment_steps; a step that is recorded as done is never
 * run again, so a retry, a crash or a duplicate wake-up never repeats a step's effect.
 *
 * Time is passed in (`now`) so tests can drive the clock. Branch and message steps arrive with WP-17: until then an
 * enrollment that reaches one ends as failed and nothing is sent.
 */

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Older events are stored but start nothing, so a backfill of history cannot enroll (and later message) everyone. */
export const MAX_TRIGGER_AGE_MS = 24 * 3600_000;
/** A run that fails unexpectedly is tried again this much later. */
export const RETRY_DELAY_MS = 5 * 60_000;
const MAX_EVENTS_SCANNED = 500;

export class JourneyTriggerError extends Error {
  constructor(message: string, public readonly code: 'not_found' | 'profile_not_found' | 'not_api_triggered' | 'key_reused') { super(message); }
}

interface EnrollInput {
  journeyId: string; versionId: string; profileId: string; kind: 'event' | 'api'; key: string;
  requestHash: string | null; payload: Record<string, unknown>; enteredAt: Date; firstStep: string; now: Date;
}

/** Inserts an enrollment unless one exists for this trigger key, or the profile is already in the journey. */
async function enroll(c: Tx, orgId: string, e: EnrollInput): Promise<string | null> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key,
       request_hash, payload, entered_at, current_step, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT DO NOTHING RETURNING id`,
    [orgId, e.journeyId, e.versionId, e.profileId, e.kind, e.key, e.requestHash, JSON.stringify(e.payload), e.enteredAt, e.firstStep, e.now]);
  return r.rows[0]?.id ?? null;
}

const ACTIVE_VERSION = `v.activated_at IS NOT NULL AND v.deactivated_at IS NULL`;

// ---------------------------------------------------------------------------------------------------------------
// Event triggers
// ---------------------------------------------------------------------------------------------------------------

export type OutboxResult = { status: 'skipped' } | { status: 'done' | 'failed'; enrolled: number; woken: number };

export async function processTriggerOutbox(orgId: string, outboxId: string, now: Date = new Date()): Promise<OutboxResult> {
  return withEngageTenant(orgId, async (c) => {
    const o = await c.query<{ event_id: string; occurred_at: Date }>(
      `SELECT event_id, occurred_at FROM engage.trigger_outbox
        WHERE organization_id = $1 AND id = $2 AND status = 'pending' FOR UPDATE SKIP LOCKED`, [orgId, outboxId]);
    const item = o.rows[0];
    if (!item) return { status: 'skipped' };
    const finish = async (status: 'done' | 'failed', enrolled: number, woken: number): Promise<OutboxResult> => {
      await c.query(`UPDATE engage.trigger_outbox SET status = $3, processed_at = now() WHERE organization_id = $1 AND id = $2`, [orgId, outboxId, status]);
      return { status, enrolled, woken };
    };

    const ev = (await c.query<{ id: string; name: string; properties: Record<string, unknown>; occurred_at: Date; profile_id: string; attributes: Record<string, unknown>; erased_at: Date | null }>(
      `SELECT e.id, e.name, e.properties, e.occurred_at, e.profile_id, p.attributes, p.erased_at
         FROM engage.events e JOIN engage.profiles p ON p.organization_id = e.organization_id AND p.id = e.profile_id
        WHERE e.organization_id = $1 AND e.id = $2 AND e.occurred_at = $3`, [orgId, item.event_id, item.occurred_at])).rows[0];
    if (!ev) {
      logError('journey trigger: outbox row without its event', { organizationId: orgId, outboxId });
      return finish('failed', 0, 0);
    }
    if (ev.erased_at) return finish('done', 0, 0);

    let enrolled = 0;
    if (now.getTime() - ev.occurred_at.getTime() <= MAX_TRIGGER_AGE_MS) {
      const journeys = await c.query<{ journey_id: string; version_id: string; definition: JourneyDefinition }>(
        `SELECT j.id AS journey_id, v.id AS version_id, v.definition
           FROM engage.journeys j JOIN engage.journey_versions v ON v.organization_id = j.organization_id AND v.journey_id = j.id
          WHERE j.organization_id = $1 AND ${ACTIVE_VERSION}
            AND v.definition->'trigger'->>'type' = 'event' AND v.definition->'trigger'->>'event' = $2
          ORDER BY j.id`, [orgId, ev.name]);
      for (const j of journeys.rows) {
        const t = j.definition.trigger;
        if (t.type !== 'event' || t.event !== ev.name) continue;
        if (!matches(t.filter, { attributes: ev.attributes, event: ev.properties })) continue;
        const id = await enroll(c, orgId, {
          journeyId: j.journey_id, versionId: j.version_id, profileId: ev.profile_id, kind: 'event', key: `event:${ev.id}`,
          requestHash: null, payload: ev.properties, enteredAt: ev.occurred_at, firstStep: j.definition.steps[0]!.id, now,
        });
        if (id) enrolled++;
      }
    }

    // Wake the profile's running enrollments: this event may end a wait or meet an exit condition. Locks are taken
    // in id order so two events for the same profile cannot deadlock.
    const woken = await c.query(
      `UPDATE engage.enrollments SET next_run_at = $3, updated_at = now()
        WHERE organization_id = $1 AND status = 'active' AND id IN (
          SELECT id FROM engage.enrollments WHERE organization_id = $1 AND profile_id = $2 AND status = 'active' AND next_run_at > $3
           ORDER BY id FOR UPDATE)`, [orgId, ev.profile_id, now]);
    return finish('done', enrolled, woken.rowCount ?? 0);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// API triggers
// ---------------------------------------------------------------------------------------------------------------

export interface ApiTriggerInput { externalId: string; idempotencyKey: string; payload: Record<string, unknown>; createIfMissing?: boolean }
export type ApiTriggerResult =
  | { status: 'enrolled' | 'duplicate'; enrollmentId: string }
  | { status: 'not_enrolled'; reason: 'already_in_journey' };

export const triggerRequestHash = (externalId: string, payload: Record<string, unknown>) =>
  createHash('sha256').update(canonical({ externalId, payload })).digest('hex');

/**
 * Starts an API-triggered journey for a profile. The idempotency key is unique per journey: the same request again
 * returns the same enrollment (duplicate), the same key with a different profile or payload is refused.
 */
export async function triggerApiJourney(orgId: string, journeyKey: string, input: ApiTriggerInput, now: Date = new Date()): Promise<ApiTriggerResult> {
  if (!KEY_RE.test(journeyKey)) throw new JourneyTriggerError('No active journey with this key', 'not_found');
  const hash = triggerRequestHash(input.externalId, input.payload);
  const triggerKey = `api:${input.idempotencyKey}`;
  return withEngageTenant(orgId, async (c) => {
    const previous = async (): Promise<ApiTriggerResult | null> => {
      const r = await c.query<{ id: string; request_hash: string | null }>(
        `SELECT e.id, e.request_hash FROM engage.enrollments e
           JOIN engage.journeys j ON j.organization_id = e.organization_id AND j.id = e.journey_id
          WHERE e.organization_id = $1 AND j.key = $2 AND e.trigger_key = $3`, [orgId, journeyKey, triggerKey]);
      const row = r.rows[0];
      if (!row) return null;
      if (row.request_hash !== hash) throw new JourneyTriggerError('This idempotency key was already used for a different request', 'key_reused');
      return { status: 'duplicate', enrollmentId: row.id };
    };
    // A retry gets the first answer, even if the journey was changed or stopped in between.
    const seen = await previous();
    if (seen) return seen;

    const j = (await c.query<{ journey_id: string; version_id: string; definition: JourneyDefinition }>(
      `SELECT j.id AS journey_id, v.id AS version_id, v.definition
         FROM engage.journeys j JOIN engage.journey_versions v ON v.organization_id = j.organization_id AND v.journey_id = j.id
        WHERE j.organization_id = $1 AND j.key = $2 AND ${ACTIVE_VERSION}`, [orgId, journeyKey])).rows[0];
    if (!j) throw new JourneyTriggerError('No active journey with this key', 'not_found');
    if (j.definition.trigger.type !== 'api') throw new JourneyTriggerError('This journey is not started through the API', 'not_api_triggered');

    const p = (await c.query<{ id: string; erased_at: Date | null }>(
      `SELECT id, erased_at FROM engage.profiles WHERE organization_id = $1 AND external_id = $2`, [orgId, input.externalId])).rows[0];
    let profileId = p && !p.erased_at ? p.id : null;
    if (!p && input.createIfMissing) profileId = (await upsertProfileOn(c, orgId, { externalId: input.externalId })).id;
    if (!profileId) throw new JourneyTriggerError('Unknown or erased profile', 'profile_not_found');

    const id = await enroll(c, orgId, {
      journeyId: j.journey_id, versionId: j.version_id, profileId, kind: 'api', key: triggerKey,
      requestHash: hash, payload: input.payload, enteredAt: now, firstStep: j.definition.steps[0]!.id, now,
    });
    if (id) return { status: 'enrolled', enrollmentId: id };
    // Not inserted: either a concurrent request with the same key won (answer like a retry), or the profile is
    // already in this journey.
    return (await previous()) ?? { status: 'not_enrolled', reason: 'already_in_journey' };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Running an enrollment
// ---------------------------------------------------------------------------------------------------------------

export type RunResult =
  | { status: 'skipped' }
  | { status: 'waiting'; step: string; until: Date }
  | { status: 'completed' | 'exited' | 'failed'; reason: string };

interface EnrollmentRow {
  id: string; journey_id: string; profile_id: string; trigger_kind: 'event' | 'api'; trigger_key: string;
  payload: Record<string, unknown>; entered_at: Date; current_step: string;
  definition: JourneyDefinition; attributes: Record<string, unknown>; erased_at: Date | null; journey_running: boolean;
}

interface StepRow { status: 'started' | 'done'; started_at: Date; wake_at: Date | null; next_step: string | null }

export async function runEnrollment(orgId: string, enrollmentId: string, now: Date = new Date()): Promise<RunResult> {
  return withEngageTenant(orgId, async (c) => {
    const e = (await c.query<EnrollmentRow>(
      `SELECT e.id, e.journey_id, e.profile_id, e.trigger_kind, e.trigger_key, e.payload, e.entered_at, e.current_step,
              v.definition, p.attributes, p.erased_at,
              EXISTS (SELECT 1 FROM engage.journey_versions a WHERE a.organization_id = e.organization_id AND a.journey_id = e.journey_id
                         AND a.activated_at IS NOT NULL AND a.deactivated_at IS NULL) AS journey_running
         FROM engage.enrollments e
         JOIN engage.journey_versions v ON v.organization_id = e.organization_id AND v.id = e.journey_version_id
         JOIN engage.profiles p ON p.organization_id = e.organization_id AND p.id = e.profile_id
        WHERE e.organization_id = $1 AND e.id = $2 AND e.status = 'active'
        FOR UPDATE OF e SKIP LOCKED`, [orgId, enrollmentId])).rows[0];
    if (!e) return { status: 'skipped' };

    const def = e.definition;
    // The event that started the enrollment never counts as a later event (an exit or a wait on the same name).
    const triggerEventId = e.trigger_kind === 'event' ? e.trigger_key.slice('event:'.length) : null;
    const base: ConditionContext = { attributes: e.attributes ?? {}, payload: e.payload ?? {} };
    let current: string | null = e.current_step;
    let last = e.current_step;

    const end = async (status: 'completed' | 'exited' | 'failed', reason: string): Promise<RunResult> => {
      await c.query(
        `UPDATE engage.enrollments SET status = $3, end_reason = $4, ended_at = $5, current_step = $6, updated_at = now()
          WHERE organization_id = $1 AND id = $2`, [orgId, e.id, status, reason, now, last]);
      return { status, reason };
    };
    const wait = async (step: string, until: Date): Promise<RunResult> => {
      await c.query(
        `UPDATE engage.enrollments SET current_step = $3, next_run_at = $4, updated_at = now() WHERE organization_id = $1 AND id = $2`,
        [orgId, e.id, step, until]);
      return { status: 'waiting', step, until };
    };
    const eventsSince = (names: string[], from: Date, to: Date | null) => c.query<{ name: string; properties: Record<string, unknown> }>(
      `SELECT name, properties FROM engage.events
        WHERE organization_id = $1 AND profile_id = $2 AND name = ANY($3::text[]) AND occurred_at >= $4
          AND ($5::timestamptz IS NULL OR occurred_at <= $5) AND ($6::uuid IS NULL OR id <> $6::uuid)
        ORDER BY occurred_at LIMIT ${MAX_EVENTS_SCANNED}`, [orgId, e.profile_id, names, from, to, triggerEventId]).then((r) => r.rows);

    if (e.erased_at) return end('exited', 'profile_erased');
    // Activating a newer version leaves running enrollments on theirs; stopping the journey stops them.
    if (!e.journey_running) return end('exited', 'journey_stopped');

    // Exit conditions first, on every run, before any step: an order that arrives (even out of order, with an
    // earlier timestamp than other events) ends the enrollment before anything else happens.
    const exitWhen = def.exit_when ?? [];
    if (exitWhen.length) {
      const evs = await eventsSince([...new Set(exitWhen.map((x) => x.event))], e.entered_at, null);
      const hit = evs.some((ev) => exitWhen.some((x) => x.event === ev.name && matches(x.filter, { ...base, event: ev.properties })));
      if (hit) return end('exited', 'exit_event');
    }

    const index = new Map(def.steps.map((s, i) => [s.id, i]));
    // The definition is acyclic, so a run visits each step at most once; the bound is a second line of defence.
    for (let visited = 0; visited <= def.steps.length; visited++) {
      if (current === null) return end('completed', 'end');
      last = current;
      const i = index.get(current);
      if (i === undefined) return end('failed', 'unknown_step');
      const step = def.steps[i]!;

      let s = (await c.query<StepRow>(
        `SELECT status, started_at, wake_at, next_step FROM engage.enrollment_steps
          WHERE organization_id = $1 AND enrollment_id = $2 AND step_id = $3`, [orgId, e.id, step.id])).rows[0];
      if (s?.status === 'done') { current = s.next_step; continue; }
      if (step.type === 'branch' || step.type === 'message') return end('failed', 'step_not_supported_yet');

      if (!s) {
        // The first step counts from when the trigger happened (a one-hour delay after a cart event means one hour
        // after the cart changed); later steps count from when the previous one finished.
        const startedAt = i === 0 ? new Date(Math.min(e.entered_at.getTime(), now.getTime())) : now;
        const minutes = step.type === 'delay' ? step.minutes : step.type === 'wait_until' ? step.timeout_minutes : null;
        const wakeAt = minutes === null ? null : new Date(startedAt.getTime() + minutes * 60_000);
        s = (await c.query<StepRow>(
          `INSERT INTO engage.enrollment_steps (organization_id, enrollment_id, step_id, step_type, started_at, wake_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING status, started_at, wake_at, next_step`,
          [orgId, e.id, step.id, step.type, startedAt, wakeAt])).rows[0]!;
      }
      const done = async (outcome: string, next: string | null) => {
        await c.query(
          `UPDATE engage.enrollment_steps SET status = 'done', outcome = $4, next_step = $5, done_at = $6
            WHERE organization_id = $1 AND enrollment_id = $2 AND step_id = $3`, [orgId, e.id, step.id, outcome, next, now]);
        current = next;
      };

      if (step.type === 'exit') {
        await done('exit', null);
        return end('completed', 'exit_step');
      }
      if (step.type === 'delay') {
        if (now < s.wake_at!) return wait(step.id, s.wake_at!);
        await done('elapsed', defaultNext(def.steps, i));
        continue;
      }
      // wait_until: an event that happened between the start of the step and its deadline continues the journey.
      const evs = await eventsSince([step.event], s.started_at, s.wake_at);
      if (evs.some((ev) => matches(step.filter, { ...base, event: ev.properties }))) {
        await done('matched', defaultNext(def.steps, i));
        continue;
      }
      if (now < s.wake_at!) return wait(step.id, s.wake_at!);
      if (step.on_timeout === 'exit') {
        await done('timed_out', null);
        return end('exited', 'wait_timeout');
      }
      await done('timed_out', defaultNext(def.steps, i));
    }
    return end('failed', 'step_limit');
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The tick: find work across tenants (ids only), do each piece in its tenant
// ---------------------------------------------------------------------------------------------------------------

export interface TickSummary { triggers: number; enrolled: number; runs: number; errors: number }
export interface TickOptions { now?: () => Date; batch?: number; budgetMs?: number }

async function deferEnrollment(orgId: string, id: string, until: Date): Promise<void> {
  await withEngageTenant(orgId, (c) => c.query(
    `UPDATE engage.enrollments SET next_run_at = $3, updated_at = now() WHERE organization_id = $1 AND id = $2 AND status = 'active'`,
    [orgId, id, until])).catch(() => undefined);
}

export async function runJourneyTick(opts: TickOptions = {}): Promise<TickSummary> {
  const clock = opts.now ?? (() => new Date());
  const batch = opts.batch ?? 200;
  const stopAt = Date.now() + (opts.budgetMs ?? 45_000);
  const summary: TickSummary = { triggers: 0, enrolled: 0, runs: 0, errors: 0 };

  for (;;) {
    const work = (await withEngageScheduler((c) => c.query<{ organization_id: string; outbox_id: string }>(
      'SELECT organization_id, outbox_id FROM engage.pending_trigger_work($1)', [batch]))).rows;
    let progressed = 0;
    for (const w of work) {
      try {
        const r = await processTriggerOutbox(w.organization_id, String(w.outbox_id), clock());
        if (r.status !== 'skipped') { progressed++; summary.triggers++; summary.enrolled += r.enrolled; }
      } catch (err) {
        summary.errors++;
        logError('journey trigger failed', { organizationId: w.organization_id, outboxId: String(w.outbox_id), ...errorFields(err) });
      }
    }
    if (work.length < batch || progressed === 0 || Date.now() > stopAt) break;
  }

  for (;;) {
    const now = clock();
    const work = (await withEngageScheduler((c) => c.query<{ organization_id: string; enrollment_id: string }>(
      'SELECT organization_id, enrollment_id FROM engage.due_enrollment_work($1, $2)', [batch, now]))).rows;
    let progressed = 0;
    for (const w of work) {
      try {
        const r = await runEnrollment(w.organization_id, w.enrollment_id, clock());
        if (r.status !== 'skipped') { progressed++; summary.runs++; }
      } catch (err) {
        summary.errors++;
        logError('journey run failed', { organizationId: w.organization_id, enrollmentId: w.enrollment_id, ...errorFields(err) });
        await deferEnrollment(w.organization_id, w.enrollment_id, new Date(clock().getTime() + RETRY_DELAY_MS));
      }
    }
    if (work.length < batch || progressed === 0 || Date.now() > stopAt) break;
  }
  return summary;
}
