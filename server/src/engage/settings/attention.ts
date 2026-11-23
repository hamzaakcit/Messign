import { withEngageTenant } from '../db.js';
import { iysSlaReport, type IysSlaReport } from '../iys/report.js';
import { EMAIL_DOMAIN_ITEM } from '../messaging/gate.js';
import { isUnhealthy, templatesInUseOn, UNHEALTHY_STATUSES } from '../whatsapp/operate.js';
import { getTemplateCheckState } from '../whatsapp/templateStatus.js';

/**
 * What needs a tenant admin's attention, derived from state the server already keeps (no new table, nothing to dismiss: an
 * item goes away when the cause does). Shown on the Settings screen and as a dot on its tab.
 *
 *   email_domain_lost  The scheduled re-check (ADR-020) found a record gone and removed `email_domain_authenticated`, so live
 *                      email sending is blocked until the records are back. It is the last check being an automatic one that
 *                      did not pass, with the readiness item absent: a failed check an admin ran themselves is not "lost",
 *                      they are looking at it, and a check that only could not reach DNS keeps the item and says nothing.
 *   iys_sync           The İYS sync is late, at risk, refused or stale (ADR-022): the report's health is warning or critical.
 *   whatsapp_template_unhealthy     A WhatsApp template that an active journey sends, or that messages used in the last 7 days,
 *                      is paused, disabled, rejected or deleted at Meta (critical: its messages are refused) or rated RED (warning).
 *   whatsapp_template_check_failing The template check (ADR-025) failed three times in a row for a tenant with an active WhatsApp
 *                      account, so the statuses the gate reads are getting old.
 *
 * Codes and numbers only: no address, no record text. A tenant that has no İYS account has no İYS item.
 */

export type AttentionCode = 'email_domain_lost' | 'iys_sync' | 'whatsapp_template_unhealthy' | 'whatsapp_template_check_failing';
/** The items derived here; every other attention code is an open ops alert. */
export const DERIVED_ATTENTION: ReadonlySet<string> = new Set<AttentionCode>(['email_domain_lost', 'iys_sync', 'whatsapp_template_unhealthy', 'whatsapp_template_check_failing']);
/** The template check is "failing" after this many failures in a row (about three hours of the hourly check). */
export const CHECK_FAILURES_ALERT = 3;
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
  const { last, held, iysActive, waActive, inUse } = await withEngageTenant(orgId, async (c) => ({
    last: (await c.query<{ domain: string; passed: boolean; checked_by: string | null; checked_at: Date; spf: Mech; dkim: Mech[]; dmarc: Mech }>(
      `SELECT domain, passed, checked_by, checked_at, spf, dkim, dmarc FROM engage.email_domain_checks WHERE organization_id = $1 ORDER BY checked_at DESC, id DESC LIMIT 1`, [orgId])).rows[0],
    held: (await c.query(`SELECT 1 FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = $2`, [orgId, EMAIL_DOMAIN_ITEM])).rows.length > 0,
    iysActive: (await c.query(`SELECT 1 FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'iys' AND status = 'active'`, [orgId])).rows.length > 0,
    waActive: (await c.query(`SELECT 1 FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'whatsapp' AND status = 'active'`, [orgId])).rows.length > 0,
    inUse: await templatesInUseOn(c, orgId, now),
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
  const unhealthy = inUse.filter(isUnhealthy);
  if (unhealthy.length) {
    const stopped = unhealthy.filter((t) => t.status !== null && UNHEALTHY_STATUSES.has(t.status));
    out.push({
      code: 'whatsapp_template_unhealthy', severity: stopped.length ? 'critical' : 'warning', since: null,
      data: {
        count: unhealthy.length,
        templates: unhealthy.slice(0, 10).map((t) => ({ metaName: t.metaName, language: t.language, status: t.status, quality: t.quality, reason: t.rejectedReason, journeys: t.journeyKeys.length, recentMessages: t.recentMessages })),
      },
    });
  }
  if (waActive) {
    const check = await getTemplateCheckState(orgId);
    if (check.consecutiveFailures >= CHECK_FAILURES_ALERT) {
      out.push({ code: 'whatsapp_template_check_failing', severity: 'warning', since: check.lastOkAt, data: { failures: check.consecutiveFailures, code: check.lastError, lastOkAt: check.lastOkAt } });
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}
