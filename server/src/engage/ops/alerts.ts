import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import type { Thresholds } from './thresholds.js';
import type { AlertRow, Condition, Severity } from './types.js';

/**
 * The life of an alert (WP-29, ADR-024). Conditions come from the rules each run; this keeps one stored row per (rule, subject):
 *   opened     the condition appeared                       -> the operators are told
 *   refreshed  it still holds                               -> last_seen_at moves, severity and numbers follow
 *   escalated  it went from warning to critical             -> told again
 *   reminded   it still holds after a long while            -> told again (critical every 6 hours, warning every 24)
 *   resolved   it has been gone for the grace period        -> told once that it is over
 * A condition that flickers around its threshold therefore opens one alert, not one per run.
 */

interface Row {
  id: string; organization_id: string; rule: string; subject: string; severity: Severity; state: 'open' | 'resolved';
  opened_at: Date; last_seen_at: Date; resolved_at: Date | null; data: Record<string, unknown>;
  last_notified_at: Date | null; notified_severity: Severity | null; resolved_notified_at: Date | null;
}
const COLUMNS = 'id, organization_id, rule, subject, severity, state, opened_at, last_seen_at, resolved_at, data, last_notified_at, notified_severity, resolved_notified_at';
const toAlert = (r: Row): AlertRow => ({
  id: r.id, organizationId: r.organization_id, rule: r.rule, subject: r.subject, severity: r.severity, state: r.state,
  openedAt: r.opened_at, lastSeenAt: r.last_seen_at, resolvedAt: r.resolved_at, data: r.data,
  lastNotifiedAt: r.last_notified_at, notifiedSeverity: r.notified_severity, resolvedNotifiedAt: r.resolved_notified_at,
});

export interface ReconcileResult { opened: number; resolved: number; open: number }

/** Brings the stored alerts of one tenant in line with the conditions found now. */
export async function reconcileAlerts(orgId: string, conditions: Condition[], t: Thresholds, now: Date = new Date()): Promise<ReconcileResult> {
  return withEngageTenant(orgId, async (c) => {
    const result: ReconcileResult = { opened: 0, resolved: 0, open: 0 };
    const seen = new Set<string>();
    for (const cond of conditions) {
      const key = `${cond.rule}\u0000${cond.subject}`;
      if (seen.has(key)) continue; // two conditions with one key: the first (the most specific) stands
      seen.add(key);
      const r = await c.query<{ inserted: boolean }>(
        `INSERT INTO engage.ops_alerts (organization_id, rule, subject, severity, data, opened_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6)
         ON CONFLICT (organization_id, rule, subject) WHERE state = 'open'
         DO UPDATE SET severity = EXCLUDED.severity, data = EXCLUDED.data, last_seen_at = EXCLUDED.last_seen_at
         RETURNING (xmax = 0) AS inserted`, [orgId, cond.rule, cond.subject, cond.severity, JSON.stringify(cond.data), now]);
      if (r.rows[0]?.inserted) result.opened++;
    }
    const open = (await c.query<Row>(`SELECT ${COLUMNS} FROM engage.ops_alerts WHERE organization_id = $1 AND state = 'open'`, [orgId])).rows;
    const graceCutoff = now.getTime() - t.resolveGraceMinutes * 60_000;
    for (const a of open) {
      if (seen.has(`${a.rule}\u0000${a.subject}`)) { result.open++; continue; }
      if (a.last_seen_at.getTime() > graceCutoff) { result.open++; continue; } // gone for now: wait out the grace period
      await c.query(`UPDATE engage.ops_alerts SET state = 'resolved', resolved_at = $3 WHERE organization_id = $1 AND id = $2 AND state = 'open'`, [orgId, a.id, now]);
      result.resolved++;
    }
    return result;
  });
}

export type NoticeKind = 'opened' | 'escalated' | 'reminder' | 'resolved';
export interface Notice { kind: NoticeKind; alert: AlertRow }

/** What the operators have not been told yet about this alert, if anything. Pure. */
export function noticeFor(a: AlertRow, t: Thresholds, now: Date): NoticeKind | null {
  if (a.state === 'resolved') {
    return a.resolvedNotifiedAt === null && a.lastNotifiedAt !== null && a.resolvedAt !== null && now.getTime() - a.resolvedAt.getTime() < 24 * 3_600_000 ? 'resolved' : null;
  }
  if (a.lastNotifiedAt === null) return 'opened';
  if (a.severity === 'critical' && a.notifiedSeverity !== 'critical') return 'escalated';
  const hours = a.severity === 'critical' ? t.remindCriticalHours : t.remindWarningHours;
  return now.getTime() - a.lastNotifiedAt.getTime() >= hours * 3_600_000 ? 'reminder' : null;
}

export async function pendingNotices(orgId: string, t: Thresholds, now: Date = new Date()): Promise<Notice[]> {
  const rows = (await withEngageTenant(orgId, (c) => c.query<Row>(
    `SELECT ${COLUMNS} FROM engage.ops_alerts
      WHERE organization_id = $1 AND (state = 'open' OR (resolved_notified_at IS NULL AND last_notified_at IS NOT NULL AND resolved_at > $2))
      ORDER BY opened_at, id`, [orgId, new Date(now.getTime() - 24 * 3_600_000)]))).rows.map(toAlert);
  const out: Notice[] = [];
  for (const alert of rows) { const kind = noticeFor(alert, t, now); if (kind) out.push({ kind, alert }); }
  return out;
}

/** Records that the operators were told (call only after the message was accepted, so a failed send is tried again). */
export async function markNotified(orgId: string, notices: Notice[], now: Date = new Date()): Promise<void> {
  if (notices.length === 0) return;
  await withEngageTenant(orgId, async (c: PoolClient) => {
    for (const n of notices) {
      if (n.kind === 'resolved') {
        await c.query(`UPDATE engage.ops_alerts SET resolved_notified_at = $3 WHERE organization_id = $1 AND id = $2`, [orgId, n.alert.id, now]);
      } else {
        await c.query(`UPDATE engage.ops_alerts SET last_notified_at = $3, notified_severity = severity WHERE organization_id = $1 AND id = $2`, [orgId, n.alert.id, now]);
      }
    }
  });
}

/** The alerts that are open now for one tenant, most severe and oldest first. */
export async function listOpenAlerts(orgId: string): Promise<AlertRow[]> {
  return (await withEngageTenant(orgId, (c) => c.query<Row>(
    `SELECT ${COLUMNS} FROM engage.ops_alerts WHERE organization_id = $1 AND state = 'open'
      ORDER BY (severity = 'critical') DESC, opened_at, id`, [orgId]))).rows.map(toAlert);
}
