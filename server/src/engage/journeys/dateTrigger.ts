import { withEngageTenant } from '../db.js';
import { enroll } from './enroll.js';
import type { JourneyDefinition } from './definition.js';

/**
 * The date-attribute trigger (WP-25, ADR-021). A journey whose trigger is `date_attribute {attribute, offset_days,
 * at_local_time}` starts for customers whose date attribute (an anniversary, a birthday) is an occasion `offset_days`
 * away, every year. The occasion is the month and day of the attribute; the year it was recorded in does not matter.
 *
 *   fire day = occasion day + offset_days        (offset -7: seven days before; 0: on the day; 3: three days after)
 *
 * A scheduled run happens once per local calendar day of the tenant, at `at_local_time`. It enrolls every customer whose
 * occasion falls on (today - offset_days). Like a segment run (ADR-013) it is claimed with one row per (journey, day),
 * works in chunks that each lock the run row and move a keyset cursor, and only the latest due day runs: a tick that was
 * down for two days does not send two days of reminders, and a message that arrives after its day is not worth sending.
 * The first run is the first such moment after activation, never at once.
 *
 * Once per occurrence: the enrollment key is date:<occasion day>:<customer>, so retries, repeated runs and concurrent
 * workers cannot enroll a customer twice for one occurrence, and next year's occurrence is a different key. A journey
 * that repeats every year must let a customer enter again, so the definition requires re_entry `after_exit`.
 */

export const DATE_CHUNK = 500;
/** One run enrolls at most this many customers; beyond it the run ends with truncated = true. */
export const MAX_DATE_RUN = 100_000;
const LEASE = `interval '10 minutes'`;
/** What counts as a date in a customer's attribute: YYYY-MM-DD, alone or at the start of an ISO timestamp. */
const DATE_VALUE = String.raw`^\d{4}-\d{2}-\d{2}([T ]|$)`;

// --- Pure date arithmetic (UTC calendar days, no time zones: a "day" here is a calendar date) ---------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function parts(date: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error('not a YYYY-MM-DD date');
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
export function addDays(date: string, days: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The day customers' occasions fall on when the run is for `slotDate`: the fire day minus the offset. */
export const occasionDayFor = (slotDate: string, offsetDays: number): string => addDays(slotDate, -offsetDays);

/**
 * Which month-and-day values of a customer's attribute match an occasion day. A 29 February occasion is celebrated on
 * 28 February in a year without one, so on that day customers recorded as 02-29 match as well.
 */
export function occasionMatch(occasionDay: string): { monthDay: string; alsoLeapDay: boolean } {
  const { y, m, d } = parts(occasionDay);
  return { monthDay: occasionDay.slice(5), alsoLeapDay: m === 2 && d === 28 && !isLeapYear(y) };
}

// --- The scheduled run ----------------------------------------------------------------------------------------------

export type DateRunResult =
  | { status: 'not_date' | 'not_due' | 'already_done' | 'in_progress' }
  | { status: 'done' | 'failed'; runId: string; slotDate: string; occasionDay: string; matched: number; enrolled: number; skipped: number; truncated: boolean; error?: string };

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];
type DateTrigger = Extract<JourneyDefinition['trigger'], { type: 'date_attribute' }>;

interface Active { versionId: string; definition: JourneyDefinition; activatedAt: Date; timezone: string }

async function loadActive(c: Tx, orgId: string, journeyId: string): Promise<Active | null> {
  const r = await c.query(
    `SELECT v.id, v.definition, v.activated_at, COALESCE(ts.timezone, 'Europe/Istanbul') AS tz
       FROM engage.journey_versions v LEFT JOIN engage.tenant_settings ts ON ts.organization_id = v.organization_id
      WHERE v.organization_id = $1 AND v.journey_id = $2 AND v.activated_at IS NOT NULL AND v.deactivated_at IS NULL`, [orgId, journeyId]);
  const x = r.rows[0];
  return x ? { versionId: x.id, definition: x.definition, activatedAt: x.activated_at, timezone: x.tz } : null;
}

/**
 * The latest scheduled moment that is not in the future and not before activation: today's `atLocalTime` in the tenant's
 * time zone, or yesterday's when today's has not come yet. Null before the first one.
 */
export async function latestDateSlot(c: Tx, a: { atLocalTime: string; timezone: string; activatedAt: Date; now: Date }): Promise<{ date: string; at: Date } | null> {
  const r = await c.query<{ slot_date: string; slot_at: Date }>(
    `SELECT s.d::text AS slot_date, s.slot AS slot_at FROM (
        SELECT v.d, ((v.d + $2::time) AT TIME ZONE $3) AS slot
          FROM (VALUES ((($1::timestamptz AT TIME ZONE $3)::date)), ((($1::timestamptz AT TIME ZONE $3)::date - 1))) v(d)
     ) s WHERE s.slot <= $1::timestamptz AND s.slot >= $4::timestamptz ORDER BY s.slot DESC LIMIT 1`,
    [a.now.toISOString(), a.atLocalTime, a.timezone, a.activatedAt.toISOString()]);
  const x = r.rows[0];
  return x ? { date: x.slot_date, at: x.slot_at } : null;
}

interface Claim { runId: string; slotDate: string; slotAt: Date; occasionDay: string; trigger: DateTrigger; journeyDef: JourneyDefinition }

export async function runDateSchedule(orgId: string, journeyId: string, now: Date = new Date(), opts: { chunk?: number; maxRun?: number } = {}): Promise<DateRunResult> {
  const chunk = opts.chunk ?? DATE_CHUNK;
  const maxRun = opts.maxRun ?? MAX_DATE_RUN;
  // 1. Is a run due, and is it ours to do?
  const claimed = await withEngageTenant(orgId, async (c): Promise<DateRunResult | Claim> => {
    const active = await loadActive(c, orgId, journeyId);
    const t = active?.definition.trigger;
    if (!active || !t || t.type !== 'date_attribute') return { status: 'not_date' };
    const slot = await latestDateSlot(c, { atLocalTime: t.at_local_time, timezone: active.timezone, activatedAt: active.activatedAt, now });
    if (!slot) return { status: 'not_due' };
    const occasionDay = occasionDayFor(slot.date, t.offset_days);
    const ins = await c.query<{ id: string }>(
      `INSERT INTO engage.date_runs (organization_id, journey_id, journey_version_id, slot_date, slot_at, occurrence_date) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, journey_id, slot_date) DO NOTHING RETURNING id`, [orgId, journeyId, active.versionId, slot.date, slot.at, occasionDay]);
    let runId = ins.rows[0]?.id;
    if (!runId) {
      const ex = (await c.query<{ id: string; status: string; fresh: boolean }>(
        `SELECT id, status, claimed_at > clock_timestamp() - ${LEASE} AS fresh FROM engage.date_runs
          WHERE organization_id = $1 AND journey_id = $2 AND slot_date = $3 FOR UPDATE`, [orgId, journeyId, slot.date])).rows[0]!;
      if (ex.status !== 'running') return { status: 'already_done' };
      if (ex.fresh) return { status: 'in_progress' };
      await c.query(`UPDATE engage.date_runs SET claimed_at = clock_timestamp() WHERE organization_id = $1 AND id = $2`, [orgId, ex.id]);
      runId = ex.id;
    }
    return { runId, slotDate: slot.date, slotAt: slot.at, occasionDay, trigger: t, journeyDef: active.definition };
  });
  if ('status' in claimed) return claimed;

  // 2. Chunk by chunk; each chunk is one transaction that holds the run row.
  const match = occasionMatch(claimed.occasionDay);
  const keyOf = (profileId: string) => `date:${claimed.occasionDay}:${profileId}`;
  for (;;) {
    const step = await withEngageTenant(orgId, async (c) => {
      const run = (await c.query<{ status: string; last_profile_id: string | null; matched: number; journey_version_id: string }>(
        `SELECT status, last_profile_id, matched, journey_version_id FROM engage.date_runs WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, claimed.runId])).rows[0]!;
      if (run.status !== 'running') return { done: true as const };
      const stillActive = await loadActive(c, orgId, journeyId);
      if (!stillActive || stillActive.versionId !== run.journey_version_id) {
        // The journey was stopped or replaced mid-run: the run ends where it is, and nothing more is enrolled.
        await c.query(`UPDATE engage.date_runs SET status = 'failed', finished_at = clock_timestamp(), error_code = 'journey_version_changed' WHERE organization_id = $1 AND id = $2`, [orgId, claimed.runId]);
        return { done: true as const };
      }
      const limit = Math.max(Math.min(chunk, maxRun - run.matched), 0);
      const ids = limit > 0 ? (await c.query<{ id: string }>(matchingProfiles, [orgId, claimed.trigger.attribute, match.monthDay, match.alsoLeapDay, run.last_profile_id, limit])).rows.map((r) => r.id) : [];
      let enrolled = 0; let skipped = 0;
      for (const profileId of ids) {
        const out = await enroll(c, orgId, {
          journeyId, versionId: run.journey_version_id, profileId, kind: 'date', key: keyOf(profileId), requestHash: null,
          payload: { attribute: claimed.trigger.attribute, occasion_date: claimed.occasionDay, offset_days: claimed.trigger.offset_days },
          enteredAt: claimed.slotAt, definition: claimed.journeyDef, now,
        });
        if ('id' in out) enrolled++; else skipped++;
      }
      const last = ids.at(-1) ?? null;
      const reachedCap = run.matched + ids.length >= maxRun;
      // At the cap the run ends; it is truncated only if more customers matched than it enrolled.
      let truncated = false;
      if (reachedCap && last) {
        truncated = (await c.query(matchingProfiles, [orgId, claimed.trigger.attribute, match.monthDay, match.alsoLeapDay, last, 1])).rowCount! > 0;
      }
      const finished = ids.length < limit || reachedCap || limit <= 0;
      await c.query(
        `UPDATE engage.date_runs SET matched = matched + $3, enrolled = enrolled + $4, skipped = skipped + $5,
                last_profile_id = COALESCE($6::uuid, last_profile_id), claimed_at = clock_timestamp(),
                status = CASE WHEN $7 THEN 'done' ELSE status END, finished_at = CASE WHEN $7 THEN clock_timestamp() END, truncated = truncated OR $8
          WHERE organization_id = $1 AND id = $2`,
        [orgId, claimed.runId, ids.length, enrolled, skipped, last, finished, truncated]);
      return { done: finished };
    });
    if (step.done) break;
  }
  const r = (await withEngageTenant(orgId, (c) => c.query(
    `SELECT status, matched, enrolled, skipped, truncated, error_code FROM engage.date_runs WHERE organization_id = $1 AND id = $2`, [orgId, claimed.runId]))).rows[0];
  return {
    status: r.status === 'failed' ? 'failed' : 'done', runId: claimed.runId, slotDate: claimed.slotDate, occasionDay: claimed.occasionDay,
    matched: r.matched, enrolled: r.enrolled, skipped: r.skipped, truncated: r.truncated, ...(r.error_code ? { error: r.error_code } : {}),
  };
}

/**
 * Customers whose attribute is a date with this month and day, after the cursor. Text only: the value is compared as
 * characters (never cast to a date), so a malformed value cannot raise an error, it just does not match. Erased customers
 * never match. The attribute name is a bound parameter.
 */
const matchingProfiles = `
  SELECT p.id FROM engage.profiles p
   WHERE p.organization_id = $1 AND p.erased_at IS NULL
     AND p.attributes ->> $2 ~ '${DATE_VALUE}'
     AND (substring(p.attributes ->> $2 from 6 for 5) = $3 OR ($4::boolean AND substring(p.attributes ->> $2 from 6 for 5) = '02-29'))
     AND ($5::uuid IS NULL OR p.id > $5::uuid)
   ORDER BY p.id LIMIT $6`;

export interface DateRunView { id: string; slotDate: string; slot: string; occasionDay: string; status: string; matched: number; enrolled: number; skipped: number; truncated: boolean; error: string | null; startedAt: string; finishedAt: string | null }

export async function listDateRuns(orgId: string, journeyId: string, limit = 50): Promise<DateRunView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT id, slot_date::text AS slot_date, slot_at, occurrence_date::text AS occurrence_date, status, matched, enrolled, skipped, truncated, error_code, started_at, finished_at
       FROM engage.date_runs WHERE organization_id = $1 AND journey_id = $2 ORDER BY slot_at DESC LIMIT $3`, [orgId, journeyId, Math.min(Math.max(limit, 1), 200)])).rows.map((r) => ({
    id: r.id, slotDate: r.slot_date, slot: new Date(r.slot_at).toISOString(), occasionDay: r.occurrence_date, status: r.status, matched: r.matched, enrolled: r.enrolled, skipped: r.skipped,
    truncated: r.truncated, error: r.error_code ?? null, startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  })));
}
