import { withEngageTenant } from '../db.js';
import { addBusinessDays, reportDeadline } from './format.js';

/**
 * The İYS SLA monitor (WP-26, ADR-022): how late are the opt-outs the tenant owes İYS, and how stale is the pull.
 *
 * Reporting an opt-out: the regulation allows three business days; Messign's target is the same day. An opt-out still
 * waiting after 24 hours is `late`, after two business days `at_risk`, and past three `breached` (İYS then refuses it, H467).
 * Pulling: İYS lists only the last 7 days, so a pull that stops for good loses recipients' opt-outs. The pull is `ok` when
 * it succeeded within 2 hours, `stale` up to 72 hours, `critical` beyond that (still inside the 7-day window, but beyond the
 * three business days a recipient's opt-out may wait), and `never` before the first success.
 * Pure classification below; the report reads the rows once. Ids and counts only, no addresses.
 */

export const TARGET_HOURS = 24;
export const PULL_OK_HOURS = 2;
export const PULL_CRITICAL_HOURS = 72;
const HOUR = 3_600_000;

export type PushClass = 'on_track' | 'late' | 'at_risk' | 'breached';
export type PullStatus = 'ok' | 'stale' | 'critical' | 'never';
export type Health = 'ok' | 'warning' | 'critical';

/** How a report still waiting at `now`, for an opt-out made at `consentAt`, is doing. */
export function classifyPending(consentAt: Date, now: Date): PushClass {
  if (now.getTime() > reportDeadline(consentAt).getTime()) return 'breached';
  if (now.getTime() >= addBusinessDays(consentAt, 2).getTime()) return 'at_risk';
  if (now.getTime() - consentAt.getTime() > TARGET_HOURS * HOUR) return 'late';
  return 'on_track';
}

export function classifyPull(lastPullAt: Date | null, now: Date): PullStatus {
  if (!lastPullAt) return 'never';
  const hours = (now.getTime() - lastPullAt.getTime()) / HOUR;
  return hours <= PULL_OK_HOURS ? 'ok' : hours <= PULL_CRITICAL_HOURS ? 'stale' : 'critical';
}

export interface IysSlaReport {
  health: Health;
  push: {
    pending: number; sent: number; skipped: number; failed: number; deadlineMissed: number;
    onTrack: number; late: number; atRisk: number; breached: number;
    oldestPendingAt: string | null; oldestPendingAgeHours: number | null;
  };
  pull: { status: PullStatus; lastPullAt: string | null; lastAttemptAt: string | null; lastOutcome: string | null; lastErrorCode: string | null; lastApplied: number };
}

export async function iysSlaReport(orgId: string, now: Date = new Date()): Promise<IysSlaReport> {
  const { counts, pending, state } = await withEngageTenant(orgId, async (c) => ({
    counts: (await c.query<{ status: string; outcome: string | null; n: number }>(
      `SELECT status, outcome, count(*)::int AS n FROM engage.iys_outbox WHERE organization_id = $1 GROUP BY status, outcome`, [orgId])).rows,
    pending: (await c.query<{ consent_at: Date }>(
      `SELECT consent_at FROM engage.iys_outbox WHERE organization_id = $1 AND status = 'pending' ORDER BY consent_at LIMIT 10000`, [orgId])).rows,
    state: (await c.query<{ last_pull_at: Date | null; last_pull_attempt_at: Date | null; last_pull_outcome: string | null; last_pull_error_code: string | null; last_pull_applied: number }>(
      `SELECT last_pull_at, last_pull_attempt_at, last_pull_outcome, last_pull_error_code, last_pull_applied FROM engage.iys_sync_state WHERE organization_id = $1`, [orgId])).rows[0],
  }));
  const total = (status: string) => counts.filter((r) => r.status === status).reduce((a, r) => a + r.n, 0);
  const classes = { on_track: 0, late: 0, at_risk: 0, breached: 0 };
  for (const p of pending) classes[classifyPending(p.consent_at, now)]++;
  const deadlineMissed = counts.filter((r) => r.outcome === 'deadline_missed').reduce((a, r) => a + r.n, 0);
  const oldest = pending[0]?.consent_at ?? null;
  const pullStatus = classifyPull(state?.last_pull_at ?? null, now);
  const rejected = counts.filter((r) => r.status === 'failed' && r.outcome !== 'deadline_missed').reduce((a, r) => a + r.n, 0);
  const health: Health = classes.breached > 0 || deadlineMissed > 0 || pullStatus === 'critical' ? 'critical'
    : classes.late > 0 || classes.at_risk > 0 || rejected > 0 || pullStatus === 'stale' || pullStatus === 'never' ? 'warning' : 'ok';
  return {
    health,
    push: {
      pending: pending.length, sent: total('sent'), skipped: total('skipped'), failed: total('failed'), deadlineMissed,
      onTrack: classes.on_track, late: classes.late, atRisk: classes.at_risk, breached: classes.breached,
      oldestPendingAt: oldest ? oldest.toISOString() : null, oldestPendingAgeHours: oldest ? Math.round(((now.getTime() - oldest.getTime()) / HOUR) * 10) / 10 : null,
    },
    pull: {
      status: pullStatus, lastPullAt: state?.last_pull_at?.toISOString() ?? null, lastAttemptAt: state?.last_pull_attempt_at?.toISOString() ?? null,
      lastOutcome: state?.last_pull_outcome ?? null, lastErrorCode: state?.last_pull_error_code ?? null, lastApplied: state?.last_pull_applied ?? 0,
    },
  };
}
