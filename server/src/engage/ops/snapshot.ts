import { withEngageTenant } from '../db.js';
import { expectsDeliveryReports } from '../messaging/index.js';
import { currentSendMode } from '../messaging/gate.js';
import { getAttention } from '../settings/attention.js';
import type { Thresholds } from './thresholds.js';
import type { AccountStats, DenialStats, QueueStats, Snapshot } from './types.js';

/**
 * Measures one tenant for the ops rules (WP-29, ADR-024). Everything is read in the tenant's own transaction, under its
 * row-level security, from the ledgers the server already keeps: nothing new is written to take a measurement. Counts only.
 */

const HOUR = 3_600_000;
const num = (v: unknown): number => Number(v ?? 0);

export async function takeSnapshot(orgId: string, t: Thresholds, now: Date = new Date()): Promise<Snapshot> {
  const windowStart = new Date(now.getTime() - t.windowMinutes * 60_000);
  const dayStart = new Date(now.getTime() - 24 * HOUR);
  const baselineStart = new Date(dayStart.getTime() - t.windowMinutes * 60_000);
  const graceCutoff = new Date(now.getTime() - t.reportGraceMinutes * 60_000);
  const overdueCutoff = new Date(now.getTime() - t.overdueMinutes * 60_000);
  const staleCutoff = new Date(now.getTime() - t.staleSendingMinutes * 60_000);
  const windowsPerDay = (24 * 60) / t.windowMinutes;

  const m = await withEngageTenant(orgId, async (c) => {
    const accounts = (await c.query<{ id: string; channel: AccountStats['channel']; provider: string; label: string; mode: string }>(
      `SELECT id, channel, provider, label, mode FROM engage.channel_accounts
        WHERE organization_id = $1 AND status = 'active' AND channel IN ('email', 'sms', 'whatsapp') ORDER BY created_at, id`, [orgId])).rows;
    const short = (await c.query<{ account_id: string; sent: string; failed: string; retried: string }>(
      `SELECT m.channel_account_id AS account_id,
              count(*) FILTER (WHERE e.type = 'sent') AS sent,
              count(*) FILTER (WHERE e.type = 'failed') AS failed,
              count(*) FILTER (WHERE e.type = 'retry_scheduled') AS retried
         FROM engage.message_events e JOIN engage.messages m ON m.organization_id = e.organization_id AND m.id = e.message_id
        WHERE e.organization_id = $1 AND e.received_at >= $2 AND e.source = 'system' AND e.type IN ('sent', 'failed', 'retry_scheduled')
        GROUP BY 1`, [orgId, windowStart])).rows;
    const codes = (await c.query<{ account_id: string; code: string; n: string }>(
      `SELECT m.channel_account_id AS account_id, e.error_code AS code, count(*) AS n
         FROM engage.message_events e JOIN engage.messages m ON m.organization_id = e.organization_id AND m.id = e.message_id
        WHERE e.organization_id = $1 AND e.received_at >= $2 AND e.source = 'system' AND e.type IN ('failed', 'retry_scheduled') AND e.error_code IS NOT NULL
        GROUP BY 1, 2`, [orgId, windowStart])).rows;
    const day = (await c.query<{ account_id: string; sent: string; bounced: string; complained: string; reports: string }>(
      `SELECT m.channel_account_id AS account_id,
              count(*) FILTER (WHERE e.type = 'sent' AND e.source = 'system') AS sent,
              count(*) FILTER (WHERE e.type = 'bounced') AS bounced,
              count(*) FILTER (WHERE e.type = 'complained') AS complained,
              count(*) FILTER (WHERE e.source = 'provider') AS reports
         FROM engage.message_events e JOIN engage.messages m ON m.organization_id = e.organization_id AND m.id = e.message_id
        WHERE e.organization_id = $1 AND e.received_at >= $2
        GROUP BY 1`, [orgId, dayStart])).rows;
    const waiting = (await c.query<{ account_id: string; n: string }>(
      `SELECT channel_account_id AS account_id, count(*) AS n FROM engage.messages
        WHERE organization_id = $1 AND status = 'sent' AND status_changed_at <= $2 AND status_changed_at >= $3 GROUP BY 1`, [orgId, graceCutoff, dayStart])).rows;
    const denials = (await c.query<{ code: string; recent: string; before: string }>(
      `SELECT code, count(*) FILTER (WHERE created_at >= $2) AS recent, count(*) FILTER (WHERE created_at < $2) AS before
         FROM engage.send_decisions WHERE organization_id = $1 AND decision = 'deny' AND created_at >= $3 GROUP BY code`, [orgId, windowStart, baselineStart])).rows;
    const settings = (await c.query<{ send_enabled: boolean }>(`SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1`, [orgId])).rows[0];
    const overdue = (await c.query<{ n: string; oldest: string | null }>(
      `SELECT count(*) AS n, extract(epoch FROM ($2::timestamptz - min(next_attempt_at))) AS oldest FROM engage.messages
        WHERE organization_id = $1 AND status = 'queued' AND next_attempt_at < $3`, [orgId, now, overdueCutoff])).rows[0]!;
    const stale = (await c.query<{ n: string }>(
      `SELECT count(*) AS n FROM engage.messages WHERE organization_id = $1 AND status = 'sending' AND claimed_at < $2`, [orgId, staleCutoff])).rows[0]!;
    const outbox = (await c.query<{ pending: string; oldest: string | null; failed: string }>(
      `SELECT count(*) FILTER (WHERE status = 'pending' AND created_at < $2) AS pending,
              extract(epoch FROM ($3::timestamptz - min(created_at) FILTER (WHERE status = 'pending' AND created_at < $2))) AS oldest,
              count(*) FILTER (WHERE status = 'failed' AND processed_at >= $4) AS failed
         FROM engage.trigger_outbox WHERE organization_id = $1 AND status IN ('pending', 'failed')`, [orgId, overdueCutoff, now, dayStart])).rows[0]!;
    return { accounts, short, codes, day, waiting, denials, settings, overdue, stale, outbox };
  });

  const by = <T extends { account_id: string }>(rows: T[]): Map<string, T> => new Map(rows.map((r) => [r.account_id, r]));
  const shortBy = by(m.short);
  const dayBy = by(m.day);
  const waitingBy = by(m.waiting);
  const accounts: AccountStats[] = m.accounts.map((a) => {
    const s = shortBy.get(a.id);
    const d = dayBy.get(a.id);
    const failureCodes: Record<string, number> = {};
    for (const r of m.codes) if (r.account_id === a.id) failureCodes[r.code] = num(r.n);
    return {
      accountId: a.id, channel: a.channel, provider: a.provider, label: a.label, mode: a.mode,
      expectsReports: expectsDeliveryReports(a.provider),
      sent: num(s?.sent), failed: num(s?.failed), retried: num(s?.retried), failureCodes,
      sent24h: num(d?.sent), bounced24h: num(d?.bounced), complained24h: num(d?.complained), reports24h: num(d?.reports),
      waitingForReport: num(waitingBy.get(a.id)?.n),
    };
  });

  const byCode: DenialStats['byCode'] = {};
  for (const r of m.denials) byCode[r.code] = { count: num(r.recent), baseline: num(r.before) / windowsPerDay };
  for (const k of Object.keys(byCode)) if (byCode[k]!.count === 0) delete byCode[k];

  const queue: QueueStats = {
    sendingOn: currentSendMode() !== 'off' && m.settings?.send_enabled === true,
    overdue: num(m.overdue.n), oldestOverdueSeconds: Math.max(0, num(m.overdue.oldest)), staleSending: num(m.stale.n),
    outboxPending: num(m.outbox.pending), oldestOutboxSeconds: Math.max(0, num(m.outbox.oldest)), outboxFailed: num(m.outbox.failed),
  };

  return { at: now, accounts, denials: { byCode }, queue, attention: await getAttention(orgId, now) };
}
