import type { AccountStats, Condition, Severity, Snapshot } from './types.js';
import type { Thresholds } from './thresholds.js';

/**
 * The ops rules (ADR-024): a pure function from what was measured to the problems that exist now. No database, no clock, no
 * network, so every rule is tested by handing it numbers. Each condition's data holds codes and numbers only.
 */

/** Gate denials that mean something is wrong with the setup, not with a customer. Any run of them is worth a look. */
export const SYSTEMIC_DENIALS: ReadonlySet<string> = new Set([
  'gate_error', 'gate_unavailable', 'sender_identity_mismatch', 'readiness_missing', 'account_inactive', 'account_mode_mismatch',
  'budget_exceeded', 'no_budget_cap', 'no_rate_card', 'currency_mismatch', 'content_template_invalid', 'sender_id_invalid',
]);

/** A provider refusing our credentials, as the adapters name it. */
const AUTH_FAILURE = /^(wa_190|ses_(unrecognized_client|invalid_signature|expired_token|access_denied|invalid_client_token|signature_does_not_match|missing_authentication|credentials_missing)[a-z_]*)$/;
export const isAuthFailure = (code: string): boolean => AUTH_FAILURE.test(code);

const round = (n: number, places = 3): number => Math.round(n * 10 ** places) / 10 ** places;
const top = (codes: Record<string, number>, n = 3): Array<{ code: string; count: number }> =>
  Object.entries(codes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([code, count]) => ({ code, count }));
const pick = (value: number, warning: number, critical: number): Severity | null => (value >= critical ? 'critical' : value >= warning ? 'warning' : null);

function accountRules(a: AccountStats, t: Thresholds, out: Condition[]): void {
  const who = { provider: a.provider, channel: a.channel };
  const failures = a.failed + a.retried;
  const attempts = a.sent + failures;
  const authCount = Object.entries(a.failureCodes).filter(([c]) => isAuthFailure(c)).reduce((n, [, k]) => n + k, 0);

  if (authCount >= t.authFailures) {
    out.push({ rule: 'credentials_rejected', subject: a.accountId, severity: 'critical', data: { ...who, count: authCount, codes: top(Object.fromEntries(Object.entries(a.failureCodes).filter(([c]) => isAuthFailure(c)))) } });
  } else if (attempts >= t.minAttempts) {
    const rate = failures / attempts;
    const severity = pick(rate, t.failRateWarning, t.failRateCritical);
    if (severity) out.push({ rule: 'provider_failing', subject: a.accountId, severity, data: { ...who, attempts, failures, rate: round(rate, 2), codes: top(a.failureCodes) } });
  }

  if (a.expectsReports && a.waitingForReport >= t.reportMinWaiting && a.reports24h === 0) {
    out.push({ rule: 'delivery_reports_missing', subject: a.accountId, severity: 'critical', data: { ...who, waiting: a.waitingForReport } });
  }

  if (a.channel === 'email') {
    if (a.sent24h >= t.bounceMinSent) {
      const rate = a.bounced24h / a.sent24h;
      const severity = pick(rate, t.bounceWarning, t.bounceCritical);
      if (severity) out.push({ rule: 'bounce_rate_high', subject: a.accountId, severity, data: { ...who, sent: a.sent24h, bounced: a.bounced24h, rate: round(rate) } });
    }
    if (a.sent24h >= t.complaintMinSent && a.complained24h >= 2) {
      const rate = a.complained24h / a.sent24h;
      const severity = pick(rate, t.complaintWarning, t.complaintCritical);
      if (severity) out.push({ rule: 'complaint_rate_high', subject: a.accountId, severity, data: { ...who, sent: a.sent24h, complained: a.complained24h, rate: round(rate, 4) } });
    }
  }
}

export function evaluateRules(s: Snapshot, t: Thresholds): Condition[] {
  const out: Condition[] = [];
  for (const a of s.accounts) accountRules(a, t, out);

  for (const [code, d] of Object.entries(s.denials.byCode)) {
    if (SYSTEMIC_DENIALS.has(code)) {
      const severity = pick(d.count, t.denialSystemicWarning, t.denialSystemicCritical);
      if (severity) out.push({ rule: 'gate_denials_systemic', subject: code, severity, data: { code, count: d.count, windowMinutes: t.windowMinutes } });
    } else if (d.count >= t.denialSpikeMin && d.count >= t.denialSpikeFactor * Math.max(1, d.baseline)) {
      out.push({ rule: 'gate_denials_spike', subject: code, severity: 'warning', data: { code, count: d.count, usual: round(d.baseline, 1), windowMinutes: t.windowMinutes } });
    }
  }

  const q = s.queue;
  if (q.sendingOn) {
    const waiting = q.overdue + q.staleSending;
    if (waiting > 0) {
      const oldestMinutes = Math.floor(q.oldestOverdueSeconds / 60);
      const severity: Severity = waiting >= t.queueCriticalCount || oldestMinutes >= t.queueCriticalMinutes ? 'critical' : 'warning';
      out.push({ rule: 'messages_stuck', subject: '', severity, data: { overdue: q.overdue, staleSending: q.staleSending, oldestMinutes } });
    }
  }
  if (q.outboxPending > 0 || q.outboxFailed > 0) {
    out.push({ rule: 'trigger_outbox_stuck', subject: '', severity: q.outboxFailed > 0 ? 'critical' : 'warning',
      data: { pending: q.outboxPending, failed: q.outboxFailed, oldestMinutes: Math.floor(q.oldestOutboxSeconds / 60) } });
  }

  for (const item of s.attention) {
    out.push({ rule: item.code, subject: '', severity: item.severity, data: item.data });
  }
  return out;
}
