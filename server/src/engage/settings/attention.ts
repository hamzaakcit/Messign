import { withEngageTenant } from '../db.js';
import { iysSlaReport, type IysSlaReport } from '../iys/report.js';
import { EMAIL_DOMAIN_ITEM } from '../messaging/gate.js';

/**
 * What needs a tenant admin's attention, derived from state the server already keeps (no new table, nothing to dismiss: an
 * item goes away when the cause does). Shown on the Settings screen and as a dot on its tab.
 *
 *   email_domain_lost  The scheduled re-check (ADR-020) found a record gone and removed `email_domain_authenticated`, so live
 *                      email sending is blocked until the records are back. It is the last check being an automatic one that
 *                      did not pass, with the readiness item absent: a failed check an admin ran themselves is not "lost",
 *                      they are looking at it, and a check that only could not reach DNS keeps the item and says nothing.
 *   iys_sync           The İYS sync is late, at risk, refused or stale (ADR-022): the report's health is warning or critical.
 *
 * Codes and numbers only: no address, no record text. A tenant that has no İYS account has no İYS item.
 */

export type AttentionCode = 'email_domain_lost' | 'iys_sync';
export interface AttentionItem {
  /** The two derived items above, and (from the ops alerts, WP-29) the rule of an open alert. */
  code: string;
  /** What an ops alert is about: a channel account id or a gate denial code. */
  subject?: string;
  severity: 'warning' | 'critical';
  /** When it started, where known. */
  since: string | null;
  data: Record<string, unknown>;
}

interface Mech { ok?: boolean; code?: string }

/** Everything that failed in a check, once each, in a stable order: SPF, DKIM selectors, DMARC. */
export function failedCodes(spf: Mech, dkim: Mech[], dmarc: Mech): string[] {
  const out: string[] = [];
  const add = (m: Mech) => { if (m && m.ok === false && typeof m.code === 'string' && !out.includes(m.code)) out.push(m.code); };
  add(spf);
  if (dkim.length === 0) out.push('dkim_selectors_not_set');
  dkim.forEach(add);
  add(dmarc);
  return out;
}

export async function getAttention(orgId: string, now: Date = new Date()): Promise<AttentionItem[]> {
  const out: AttentionItem[] = [];
  const { last, held, iysActive } = await withEngageTenant(orgId, async (c) => ({
    last: (await c.query<{ domain: string; passed: boolean; checked_by: string | null; checked_at: Date; spf: Mech; dkim: Mech[]; dmarc: Mech }>(
      `SELECT domain, passed, checked_by, checked_at, spf, dkim, dmarc FROM engage.email_domain_checks WHERE organization_id = $1 ORDER BY checked_at DESC, id DESC LIMIT 1`, [orgId])).rows[0],
    held: (await c.query(`SELECT 1 FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = $2`, [orgId, EMAIL_DOMAIN_ITEM])).rows.length > 0,
    iysActive: (await c.query(`SELECT 1 FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'iys' AND status = 'active'`, [orgId])).rows.length > 0,
  }));
  if (last && !last.passed && last.checked_by === null && !held) {
    out.push({ code: 'email_domain_lost', severity: 'critical', since: last.checked_at.toISOString(), data: { domain: last.domain, reasons: failedCodes(last.spf, last.dkim, last.dmarc) } });
  }
  if (iysActive) {
    const r: IysSlaReport = await iysSlaReport(orgId, now);
    if (r.health !== 'ok') {
      out.push({
        code: 'iys_sync', severity: r.health, since: r.push.oldestPendingAt ?? r.pull.lastAttemptAt,
        data: {
          pullStatus: r.pull.status, pullErrorCode: r.pull.lastErrorCode, lastPullAt: r.pull.lastPullAt,
          late: r.push.late, atRisk: r.push.atRisk, breached: r.push.breached, failed: r.push.failed, deadlineMissed: r.push.deadlineMissed,
        },
      });
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}
