import { withEngageTenant } from '../db.js';
import { DERIVED_ATTENTION, getAttention, type AttentionItem } from '../settings/attention.js';
import { listOpenAlerts } from './alerts.js';
import { evaluateRules } from './rules.js';
import { takeSnapshot } from './snapshot.js';
import { loadThresholds, type Thresholds } from './thresholds.js';
import type { AccountStats, Condition } from './types.js';

/**
 * What a tenant admin sees of the ops layer (WP-29): how each channel account is doing now, and the alerts that are open.
 * The health is computed live from the same rules the ops check uses, so the screen and the operators' alerts cannot disagree.
 */

export type AccountHealthStatus = 'ok' | 'degraded' | 'failing';
export interface AccountHealth {
  accountId: string; label: string; channel: string; provider: string; mode: string;
  status: AccountHealthStatus;
  last15m: { sent: number; failed: number; retried: number };
  last24h: { sent: number; bounced: number; complained: number; reports: number };
  waitingForReport: number;
  issues: Array<{ rule: string; severity: 'warning' | 'critical' }>;
}
export interface DeliveryHealth {
  checkedAt: string;
  accounts: AccountHealth[];
  /** Problems that are about the tenant as a whole (messages waiting, journey triggers not processed, gate denials). */
  tenant: Array<{ rule: string; subject: string; severity: 'warning' | 'critical' }>;
}

export function accountHealth(a: AccountStats, conditions: Condition[]): AccountHealth {
  const issues = conditions.filter((c) => c.subject === a.accountId).map((c) => ({ rule: c.rule, severity: c.severity }));
  const status: AccountHealthStatus = issues.some((i) => i.severity === 'critical') ? 'failing' : issues.length ? 'degraded' : 'ok';
  return {
    accountId: a.accountId, label: a.label, channel: a.channel, provider: a.provider, mode: a.mode, status,
    last15m: { sent: a.sent, failed: a.failed, retried: a.retried },
    last24h: { sent: a.sent24h, bounced: a.bounced24h, complained: a.complained24h, reports: a.reports24h },
    waitingForReport: a.waitingForReport, issues,
  };
}

export async function getDeliveryHealth(orgId: string, now: Date = new Date(), t: Thresholds = loadThresholds()): Promise<DeliveryHealth> {
  const snap = await takeSnapshot(orgId, t, now);
  const conditions = evaluateRules(snap, t);
  const accountIds = new Set(snap.accounts.map((a) => a.accountId));
  return {
    checkedAt: now.toISOString(),
    accounts: snap.accounts.map((a) => accountHealth(a, conditions)),
    tenant: conditions.filter((c) => !accountIds.has(c.subject) && !DERIVED_ATTENTION.has(c.rule)).map((c) => ({ rule: c.rule, subject: c.subject, severity: c.severity })),
  };
}

/** The Settings "needs attention" list: the derived items (email domain, İYS) and every open ops alert, once each. */
export async function attentionWithAlerts(orgId: string, now: Date = new Date()): Promise<AttentionItem[]> {
  const derived = await getAttention(orgId, now);
  const have = new Set(derived.map((i) => i.code));
  const alerts = (await listOpenAlerts(orgId)).filter((a) => !have.has(a.rule));
  return [...derived, ...alerts.map((a): AttentionItem => ({ code: a.rule, subject: a.subject || undefined, severity: a.severity, since: a.openedAt.toISOString(), data: a.data }))];
}

/** Used by tests: a tenant's account ids in the same order the snapshot lists them. */
export const accountIdsOf = (orgId: string): Promise<string[]> =>
  withEngageTenant(orgId, async (c) => (await c.query<{ id: string }>(`SELECT id FROM engage.channel_accounts WHERE organization_id = $1 AND status = 'active' ORDER BY created_at, id`, [orgId])).rows.map((r) => r.id));
