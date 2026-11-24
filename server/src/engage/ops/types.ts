import type { AttentionItem } from '../settings/attention.js';

/**
 * What the ops check measures for one tenant (WP-29, ADR-024). Counts, rates, codes and ids only: nothing here can hold an
 * address, a name or message text, so it is safe to log, store in `engage.ops_alerts` and send to an operator's chat.
 */
export interface AccountStats {
  accountId: string;
  channel: 'email' | 'sms' | 'whatsapp';
  provider: string;
  label: string;
  mode: string;
  /** Does the provider send delivery reports back (webhook)? Taken from the adapter's capabilities. */
  expectsReports: boolean;
  /** Short window: provider calls our dispatcher made. */
  sent: number;
  failed: number;
  retried: number;
  /** Why the short window's calls failed: error code -> count. */
  failureCodes: Record<string, number>;
  /** Long window: what the provider reported back, against what we sent. */
  sent24h: number;
  bounced24h: number;
  complained24h: number;
  /** Provider-sourced events (any kind) received in the long window. */
  reports24h: number;
  /** Messages accepted by the provider more than the grace ago whose delivery nobody has reported. */
  waitingForReport: number;
  /** WhatsApp accounts only (WP-40c). */
  whatsapp?: {
    /** Messages Meta held back with 131049 in the long window. */
    frequencyLimited24h: number;
    /** Messages waiting for the account's daily limit of new customers, and those held for over a day. */
    pacingWaiting: number;
    pacingWaitingOverADay: number;
    limit: number;
    limitIsDefault: boolean;
  };
}

export interface DenialStats {
  /** Denials in the short window by code, and the same codes' average over the 24 hours before it, scaled to one window. */
  byCode: Record<string, { count: number; baseline: number }>;
}

export interface QueueStats {
  /** False when sending is off (SEND_MODE off, or the tenant's send_enabled false): waiting messages are then expected. */
  sendingOn: boolean;
  overdue: number;
  oldestOverdueSeconds: number;
  staleSending: number;
  outboxPending: number;
  oldestOutboxSeconds: number;
  outboxFailed: number;
}

export interface Snapshot {
  at: Date;
  accounts: AccountStats[];
  denials: DenialStats;
  queue: QueueStats;
  /** The tenant's own attention items (email domain lost, İYS sync): the same facts the Settings screen shows. */
  attention: AttentionItem[];
  /** The audit log's hash chain (WP-31). Absent in older snapshots; a broken chain is always critical. */
  auditChain?: { ok: boolean; entries: number; firstBadSeq: number | null };
}

export type Severity = 'warning' | 'critical';

/** A problem that exists now. Reconciled against the stored alerts by (rule, subject). */
export interface Condition {
  rule: string;
  subject: string;
  severity: Severity;
  data: Record<string, unknown>;
}

export interface AlertRow {
  id: string;
  organizationId: string;
  rule: string;
  subject: string;
  severity: Severity;
  state: 'open' | 'resolved';
  openedAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  data: Record<string, unknown>;
  lastNotifiedAt: Date | null;
  notifiedSeverity: Severity | null;
  resolvedNotifiedAt: Date | null;
}
