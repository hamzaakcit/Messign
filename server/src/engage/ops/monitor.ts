import { withEngageScheduler } from '../db.js';
import { errorFields, logError, logInfo } from '../log.js';
import { markNotified, pendingNotices, reconcileAlerts, type Notice } from './alerts.js';
import { describeCondition } from './describe.js';
import { captureError, drainErrorNotices } from './errors.js';
import { pingHeartbeat, sendToOperators } from './notify.js';
import { failedEngageJobs, platformConditions, type PlatformCondition } from './platform.js';
import { evaluateRules } from './rules.js';
import { takeSnapshot } from './snapshot.js';
import { loadThresholds, type Thresholds } from './thresholds.js';
import type { Condition } from './types.js';

/**
 * The ops check (WP-29, ADR-024): every few minutes, for every tenant that can be sending, measure, apply the rules, keep the
 * stored alerts in line, and tell the operators what is new in one message. Nothing it reads can fail a send, and nothing it
 * does can send anything to a customer: it only reads ledgers and writes `engage.ops_alerts`.
 */

export interface OpsDeps {
  now?: () => Date;
  thresholds?: Thresholds;
  /** A name for the operators' message. Default: the first eight characters of the tenant id. */
  orgLabel?: (orgId: string) => Promise<string>;
  queueFailures?: () => Promise<Record<string, number>>;
  send?: typeof sendToOperators;
  /** Narrow a run to some tenants (an operator script, parallel tests); the database does the narrowing. */
  onlyOrganizations?: string[];
  limit?: number;
  /** False: measure and evaluate only; nothing is stored or sent. */
  persist?: boolean;
  heartbeat?: boolean;
}

export interface OpsRunSummary {
  tenants: number;
  conditions: number;
  opened: number;
  resolved: number;
  open: number;
  told: number;
  /** Was there a webhook, and did it take the message? */
  webhook: 'none' | 'sent' | 'failed';
  errors: number;
  platform: PlatformCondition[];
  /** Conditions found per tenant (for the report; empty when nothing is wrong). */
  found: Array<{ organizationId: string; conditions: Condition[] }>;
}

// Platform conditions are told on appearance, again after the reminder interval, and once when they clear. Held in this process.
const platformSeen = new Map<string, { since: Date; toldAt: Date | null }>();
export const resetPlatformState = (): void => { platformSeen.clear(); };

async function defaultLabel(orgId: string): Promise<string> {
  try {
    const { pool } = await import('../../db/index.js');
    const r = await pool.query<{ slug: string }>('SELECT slug FROM organizations WHERE id = $1', [orgId]);
    if (r.rows[0]?.slug) return r.rows[0].slug;
  } catch { /* the id is label enough */ }
  return orgId.slice(0, 8);
}

const ICON: Record<string, string> = { critical: 'CRITICAL', warning: 'warning' };
const KIND: Record<string, string> = { opened: 'new', escalated: 'now critical', reminder: 'still open', resolved: 'resolved' };

export async function runOpsCheck(deps: OpsDeps = {}): Promise<OpsRunSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const t = deps.thresholds ?? loadThresholds();
  const persist = deps.persist !== false;
  const label = deps.orgLabel ?? defaultLabel;
  const summary: OpsRunSummary = { tenants: 0, conditions: 0, opened: 0, resolved: 0, open: 0, told: 0, webhook: 'none', errors: 0, platform: [], found: [] };

  const orgs = (await withEngageScheduler((c) => c.query<{ organization_id: string }>(
    'SELECT organization_id FROM engage.ops_work($1, $2::uuid[])', [deps.limit ?? 1000, deps.onlyOrganizations ?? null]))).rows.map((r) => r.organization_id);
  summary.tenants = orgs.length;

  const lines: string[] = [];
  const structured: unknown[] = [];
  const toMark = new Map<string, Notice[]>();

  for (const orgId of orgs) {
    try {
      const snap = await takeSnapshot(orgId, t, now);
      const conditions = evaluateRules(snap, t);
      summary.conditions += conditions.length;
      if (conditions.length) summary.found.push({ organizationId: orgId, conditions });
      if (!persist) continue;
      const r = await reconcileAlerts(orgId, conditions, t, now);
      summary.opened += r.opened; summary.resolved += r.resolved; summary.open += r.open;
      const notices = await pendingNotices(orgId, t, now);
      if (notices.length) {
        toMark.set(orgId, notices);
        const tenant = await label(orgId);
        for (const n of notices) {
          const text = describeCondition({ rule: n.alert.rule, subject: n.alert.subject, data: n.alert.data });
          lines.push(`[${ICON[n.alert.severity]}] ${KIND[n.kind]} · ${tenant} · ${n.alert.rule} · ${text}`);
          structured.push({ kind: n.kind, tenant, organizationId: orgId, rule: n.alert.rule, subject: n.alert.subject, severity: n.alert.severity, since: n.alert.openedAt, text });
        }
      }
    } catch (err) {
      summary.errors++;
      captureError('ops_check', err, now);
      logError('ops check failed for a tenant', { organizationId: orgId, ...errorFields(err) });
    }
  }

  if (persist) {
    // The platform: dead-lettered jobs, and what this process caught.
    try {
      const failed = await (deps.queueFailures ?? failedEngageJobs)();
      const current = platformConditions(failed);
      summary.platform = current;
      const keys = new Set(current.map((c) => c.key));
      for (const c of current) {
        const seen = platformSeen.get(c.key);
        const remindMs = (c.severity === 'critical' ? t.remindCriticalHours : t.remindWarningHours) * 3_600_000;
        if (!seen || seen.toldAt === null || now.getTime() - seen.toldAt.getTime() >= remindMs) {
          lines.push(`[${ICON[c.severity]}] ${seen ? 'still open' : 'new'} · platform · ${c.key} · ${c.text}`);
          structured.push({ kind: seen ? 'reminder' : 'opened', tenant: 'platform', rule: c.key, severity: c.severity, text: c.text });
          platformSeen.set(c.key, { since: seen?.since ?? now, toldAt: now });
        }
      }
      for (const [key, seen] of [...platformSeen]) {
        if (keys.has(key)) continue;
        platformSeen.delete(key);
        if (seen.toldAt) { lines.push(`[warning] resolved · platform · ${key}`); structured.push({ kind: 'resolved', tenant: 'platform', rule: key, severity: 'warning', text: 'no longer failing' }); }
      }
    } catch (err) { summary.errors++; captureError('ops_platform', err, now); }
    for (const n of drainErrorNotices(now)) {
      const g = n.group;
      lines.push(`[warning] ${n.kind === 'new' ? 'new error' : 'error burst'} · platform · ${g.source} · ${g.description.slice(0, 160)} (${g.count} so far)`);
      structured.push({ kind: n.kind === 'new' ? 'opened' : 'reminder', tenant: 'platform', rule: `error:${g.source}`, severity: 'warning', fingerprint: g.fingerprint, count: g.count, text: g.description.slice(0, 160) });
    }

    if (lines.length) {
      const send = deps.send ?? sendToOperators;
      const shown = lines.slice(0, 30);
      const text = `Messign Engage ops: ${lines.length} update${lines.length === 1 ? '' : 's'}\n${shown.join('\n')}${lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : ''}`;
      const d = await send(text, structured);
      summary.webhook = !d.configured ? 'none' : d.ok ? 'sent' : 'failed';
      if (d.ok) {
        for (const [orgId, notices] of toMark) {
          try { await markNotified(orgId, notices, now); summary.told += notices.length; } catch (err) { summary.errors++; captureError('ops_check', err, now); }
        }
      }
    }
    if (summary.errors === 0 && deps.heartbeat !== false) await pingHeartbeat();
  }

  logInfo('ops check', { tenants: summary.tenants, conditions: summary.conditions, opened: summary.opened, resolved: summary.resolved, open: summary.open, told: summary.told, webhook: summary.webhook, errors: summary.errors });
  return summary;
}
