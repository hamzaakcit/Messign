import { randomInt } from 'crypto';
import type { withEngageTenant } from '../db.js';
import { DEFAULT_HOLDOUT_PERCENT, type JourneyDefinition } from './definition.js';

/**
 * Enrolling a customer in a journey (WP-16, WP-17; shared with the segment runner, WP-36): the re-entry rule and the
 * cohort draw, under one lock per (journey, customer), then an insert that the unique trigger key makes idempotent.
 */

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

export interface EnrollInput {
  journeyId: string; versionId: string; profileId: string; kind: 'event' | 'api' | 'segment'; key: string;
  requestHash: string | null; payload: Record<string, unknown>; enteredAt: Date; definition: JourneyDefinition; now: Date;
}
export type EnrollOutcome = { id: string } | { refused: 'already_in_journey' | 're_entry_not_allowed' };

/** treatment or holdout, drawn once per enrollment. */
export function drawCohort(holdoutPercent: number, draw: (max: number) => number = (max) => randomInt(max)): 'treatment' | 'holdout' {
  return draw(10_000) < Math.round(holdoutPercent * 100) ? 'holdout' : 'treatment';
}

/**
 * Inserts an enrollment unless one exists for this trigger key, the profile is already in the journey, or the
 * journey's re-entry rule refuses it. The lock per (journey, profile) makes the re-entry check and the insert one step.
 */
export async function enroll(c: Tx, orgId: string, e: EnrollInput): Promise<EnrollOutcome> {
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`engage-enroll:${orgId}:${e.journeyId}:${e.profileId}`]);
  const prior = (await c.query<{ active: boolean }>(
    `SELECT bool_or(status = 'active') AS active FROM engage.enrollments WHERE organization_id = $1 AND journey_id = $2 AND profile_id = $3`,
    [orgId, e.journeyId, e.profileId])).rows[0]?.active;
  if (prior === true) return { refused: 'already_in_journey' };
  if (prior === false && (e.definition.re_entry ?? 'never') === 'never') return { refused: 're_entry_not_allowed' };
  const cohort = drawCohort(e.definition.holdout_percent ?? DEFAULT_HOLDOUT_PERCENT);
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.enrollments (organization_id, journey_id, journey_version_id, profile_id, trigger_kind, trigger_key,
       request_hash, payload, entered_at, current_step, next_run_at, cohort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING RETURNING id`,
    [orgId, e.journeyId, e.versionId, e.profileId, e.kind, e.key, e.requestHash, JSON.stringify(e.payload), e.enteredAt,
      e.definition.steps[0]!.id, e.now, cohort]);
  return r.rows[0] ? { id: r.rows[0].id } : { refused: 'already_in_journey' };
}

