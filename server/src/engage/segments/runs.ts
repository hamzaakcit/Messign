import { withEngageTenant } from '../db.js';
import { enroll } from '../journeys/enroll.js';
import type { JourneyDefinition } from '../journeys/definition.js';
import { buildSegmentQuery } from './compile.js';
import type { SegmentDefinition } from './definition.js';

/**
 * Scheduled segment runs (WP-36, ADR-013). A journey whose trigger is a segment runs on a schedule: every N days at a
 * local time of the tenant, counted from the day the version was activated (the first run is the first such moment
 * after activation, never at once). At a run, the pinned segment version is evaluated as of the slot, and every
 * matching customer is enrolled, once per run: the enrollment key is segment:<slot>:<customer>, so repeats, retries and two
 * workers at the same time cannot enroll anyone twice. A run is claimed with one row per (journey, slot) and works in
 * chunks that each lock the run row, read the cursor from it and update it with the chunk's counts, so counts are
 * exact and an interrupted run resumes where it stopped. Missed slots are not made up: only the latest due slot runs.
 */

export const SEGMENT_CHUNK = 500;
/** One run enrolls at most this many customers; beyond it the run ends with truncated = true (a mistaken "everyone"). */
export const MAX_SEGMENT_RUN = 100_000;
const LEASE = `interval '10 minutes'`;

export type SegmentRunResult =
  | { status: 'not_segment' | 'not_due' | 'already_done' | 'in_progress' }
  | { status: 'done' | 'failed'; runId: string; slot: string; matched: number; enrolled: number; skipped: number; truncated: boolean; error?: string };

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

interface Active { versionId: string; definition: JourneyDefinition; activatedAt: Date; timezone: string }

async function loadActive(c: Tx, orgId: string, journeyId: string): Promise<Active | null> {
  const r = await c.query(
    `SELECT v.id, v.definition, v.activated_at, COALESCE(ts.timezone, 'Europe/Istanbul') AS tz
       FROM engage.journey_versions v LEFT JOIN engage.tenant_settings ts ON ts.organization_id = v.organization_id
      WHERE v.organization_id = $1 AND v.journey_id = $2 AND v.activated_at IS NOT NULL AND v.deactivated_at IS NULL`, [orgId, journeyId]);
  const x = r.rows[0];
  return x ? { versionId: x.id, definition: x.definition, activatedAt: x.activated_at, timezone: x.tz } : null;
}

/** The latest scheduled moment that is not in the future and not before activation (null before the first one). */
export async function latestDueSlot(c: Tx, a: { everyDays: number; atLocalTime: string; timezone: string; activatedAt: Date; now: Date }): Promise<Date | null> {
  const r = await c.query<{ slot: Date }>(
    `SELECT s.slot FROM (
        SELECT ((d::date + $2::time) AT TIME ZONE $3) AS slot
          FROM generate_series(($4::timestamptz AT TIME ZONE $3)::date::timestamp, ($5::timestamptz AT TIME ZONE $3)::date::timestamp, make_interval(days => $1::int)) d
     ) s WHERE s.slot >= $4::timestamptz AND s.slot <= $5::timestamptz ORDER BY s.slot DESC LIMIT 1`,
    [a.everyDays, a.atLocalTime, a.timezone, a.activatedAt.toISOString(), a.now.toISOString()]);
  return r.rows[0]?.slot ?? null;
}

interface Claim { runId: string; versionId: string; segmentDef: SegmentDefinition; segmentKey: string; segmentVersion: number; journeyDef: JourneyDefinition }

export async function runSegmentSchedule(orgId: string, journeyId: string, now: Date = new Date(), opts: { chunk?: number; maxRun?: number; onChunk?: (chunkDone: { matched: number }) => Promise<void> } = {}): Promise<SegmentRunResult> {
  const chunk = opts.chunk ?? SEGMENT_CHUNK;
  const maxRun = opts.maxRun ?? MAX_SEGMENT_RUN;
  // 1. Is a run due, and is it ours to do?
  const claimed = await withEngageTenant(orgId, async (c): Promise<SegmentRunResult | (Claim & { slot: Date })> => {
    const active = await loadActive(c, orgId, journeyId);
    const t = active?.definition.trigger;
    if (!active || !t || t.type !== 'segment') return { status: 'not_segment' };
    const slot = await latestDueSlot(c, { everyDays: t.every_days, atLocalTime: t.at_local_time, timezone: active.timezone, activatedAt: active.activatedAt, now });
    if (!slot) return { status: 'not_due' };
    const sv = (await c.query(
      `SELECT v.id, v.definition FROM engage.segments s JOIN engage.segment_versions v ON v.organization_id = s.organization_id AND v.segment_id = s.id
        WHERE s.organization_id = $1 AND s.key = $2 AND v.version = $3`, [orgId, t.segment, t.segment_version])).rows[0];
    if (!sv) return { status: 'not_segment' };
    const ins = await c.query<{ id: string }>(
      `INSERT INTO engage.segment_runs (organization_id, journey_id, journey_version_id, segment_version_id, slot_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, journey_id, slot_at) DO NOTHING RETURNING id`, [orgId, journeyId, active.versionId, sv.id, slot]);
    let runId = ins.rows[0]?.id;
    let versionId = active.versionId;
    if (!runId) {
      const ex = (await c.query<{ id: string; status: string; fresh: boolean; journey_version_id: string }>(
        `SELECT id, status, journey_version_id, claimed_at > clock_timestamp() - ${LEASE} AS fresh FROM engage.segment_runs
          WHERE organization_id = $1 AND journey_id = $2 AND slot_at = $3 FOR UPDATE`, [orgId, journeyId, slot])).rows[0]!;
      if (ex.status !== 'running') return { status: 'already_done' };
      if (ex.fresh) return { status: 'in_progress' };
      await c.query(`UPDATE engage.segment_runs SET claimed_at = clock_timestamp() WHERE organization_id = $1 AND id = $2`, [orgId, ex.id]);
      runId = ex.id;
      versionId = ex.journey_version_id;
    }
    return { runId, versionId, segmentDef: sv.definition, segmentKey: t.segment, segmentVersion: t.segment_version, journeyDef: active.definition, slot };
  });
  if ('status' in claimed) return claimed;

  // 2. Chunk by chunk; each chunk is one transaction that holds the run row.
  const keyOf = (profileId: string) => `segment:${claimed.slot.toISOString()}:${profileId}`;
  for (;;) {
    const step = await withEngageTenant(orgId, async (c) => {
      const run = (await c.query<{ status: string; last_profile_id: string | null; matched: number; journey_version_id: string }>(
        `SELECT status, last_profile_id, matched, journey_version_id FROM engage.segment_runs WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, claimed.runId])).rows[0]!;
      if (run.status !== 'running') return { done: true as const, matched: run.matched };
      const stillActive = await loadActive(c, orgId, journeyId);
      if (!stillActive || stillActive.versionId !== run.journey_version_id) {
        // The journey was stopped or replaced mid-run: the run ends where it is, and nothing more is enrolled.
        await c.query(`UPDATE engage.segment_runs SET status = 'failed', finished_at = clock_timestamp(), error_code = 'journey_version_changed' WHERE organization_id = $1 AND id = $2`, [orgId, claimed.runId]);
        return { done: true as const, matched: run.matched };
      }
      const limit = Math.min(chunk, maxRun - run.matched);
      const q = buildSegmentQuery(claimed.segmentDef, orgId, claimed.slot, { mode: 'ids', afterId: run.last_profile_id, limit: Math.max(limit, 1) });
      const ids = limit > 0 ? (await c.query<{ id: string }>(q.text, q.params)).rows.map((r) => r.id) : [];
      let enrolled = 0; let skipped = 0;
      for (const profileId of ids) {
        const out = await enroll(c, orgId, {
          journeyId, versionId: run.journey_version_id, profileId, kind: 'segment', key: keyOf(profileId), requestHash: null,
          payload: { segment: claimed.segmentKey, segment_version: claimed.segmentVersion }, enteredAt: claimed.slot, definition: claimed.journeyDef, now,
        });
        if ('id' in out) enrolled++; else skipped++;
      }
      const last = ids.at(-1) ?? null;
      const reachedCap = run.matched + ids.length >= maxRun;
      // At the cap the run ends; it is truncated only if more customers matched than it enrolled.
      let truncated = false;
      if (reachedCap && last) {
        const more = buildSegmentQuery(claimed.segmentDef, orgId, claimed.slot, { mode: 'ids', afterId: last, limit: 1 });
        truncated = (await c.query(more.text, more.params)).rowCount! > 0;
      }
      const finished = ids.length < limit || reachedCap || limit <= 0;
      await c.query(
        `UPDATE engage.segment_runs SET matched = matched + $3, enrolled = enrolled + $4, skipped = skipped + $5,
                last_profile_id = COALESCE($6::uuid, last_profile_id), claimed_at = clock_timestamp(),
                status = CASE WHEN $7 THEN 'done' ELSE status END, finished_at = CASE WHEN $7 THEN clock_timestamp() END, truncated = truncated OR $8
          WHERE organization_id = $1 AND id = $2`,
        [orgId, claimed.runId, ids.length, enrolled, skipped, last, finished, truncated]);
      return { done: finished, matched: run.matched + ids.length };
    });
    if (step.done) break;
    await opts.onChunk?.({ matched: step.matched });
  }
  const r = (await withEngageTenant(orgId, (c) => c.query(
    `SELECT status, matched, enrolled, skipped, truncated, error_code FROM engage.segment_runs WHERE organization_id = $1 AND id = $2`, [orgId, claimed.runId]))).rows[0];
  return {
    status: r.status === 'failed' ? 'failed' : 'done', runId: claimed.runId, slot: claimed.slot.toISOString(),
    matched: r.matched, enrolled: r.enrolled, skipped: r.skipped, truncated: r.truncated, ...(r.error_code ? { error: r.error_code } : {}),
  };
}

export interface SegmentRunView { id: string; slot: string; status: string; matched: number; enrolled: number; skipped: number; truncated: boolean; error: string | null; startedAt: string; finishedAt: string | null }

export async function listSegmentRuns(orgId: string, journeyId: string, limit = 50): Promise<SegmentRunView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT id, slot_at, status, matched, enrolled, skipped, truncated, error_code, started_at, finished_at FROM engage.segment_runs
      WHERE organization_id = $1 AND journey_id = $2 ORDER BY slot_at DESC LIMIT $3`, [orgId, journeyId, Math.min(Math.max(limit, 1), 200)])).rows.map((r) => ({
    id: r.id, slot: new Date(r.slot_at).toISOString(), status: r.status, matched: r.matched, enrolled: r.enrolled, skipped: r.skipped, truncated: r.truncated,
    error: r.error_code ?? null, startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  })));
}
