import { fetchAPI } from '@/lib/apiCore';

/** Engage tenant settings (WP-22). Mirrors server/src/engage/settings/settings.ts. Only tenant admins can call these. */

export type Channel = 'email' | 'sms' | 'whatsapp';

export interface ReadinessProblem { code: string; message: string }

export interface TenantSettings {
  sendEnabled: boolean;
  /** The name customers know the shop by. {{sender_name}} in a template or a draft is filled from it. */
  senderName: string | null;
  timezone: string;
  quietHours: { start: string; end: string } | null;
  frequencyCap: { max: number; windowHours: number };
  readiness: { sendMode: 'off' | 'sandbox' | 'live'; ready: boolean; problems: ReadinessProblem[] };
  requiredItems: Record<Channel, string[]>;
  readinessItems: Array<{ channel: Channel; item: string; value: string; evidenceUrl: string | null; recordedAt: string }>;
  budgetCaps: Array<{ channel: Channel; monthlyCapMinor: number; currency: string; updatedAt: string }>;
  rateCards: Array<{ channel: Channel; category: 'marketing' | 'transactional'; route: string; unitCostMinor: number; currency: string; effectiveFrom: string }>;
  channelAccounts: Array<{
    id: string; channel: Channel; provider: string; mode: 'test' | 'live'; label: string; hint: string | null;
    status: 'active' | 'disabled'; createdAt: string; disabledAt: string | null;
  }>;
}

export interface GateSettingsInput {
  timezone?: string;
  quietHours?: { start: string; end: string } | null;
  frequencyCap?: { max: number; windowHours: number };
}

export const getSettings = (): Promise<TenantSettings> => fetchAPI<TenantSettings>('/engage/settings');

export const setSenderName = (senderName: string | null): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>('/engage/settings/sender', { method: 'PUT', body: JSON.stringify({ senderName }) });

export const setSendEnabled = (enabled: boolean): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>('/engage/settings/send-enabled', { method: 'PUT', body: JSON.stringify({ enabled }) });

export const updateGateSettings = (input: GateSettingsInput): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>('/engage/settings/gate', { method: 'PUT', body: JSON.stringify(input) });

export const setBudgetCap = (channel: Channel, monthlyCapMinor: number, currency: string): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>(`/engage/settings/budget-caps/${channel}`, { method: 'PUT', body: JSON.stringify({ monthlyCapMinor, currency }) });

export const addRateCard = (input: { channel: Channel; category: 'marketing' | 'transactional'; unitCostMinor: number; currency: string }): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>('/engage/settings/rate-cards', { method: 'POST', body: JSON.stringify(input) });

export const recordReadinessItem = (channel: Channel, item: string, value: string, evidenceUrl: string | null): Promise<TenantSettings> =>
  fetchAPI<TenantSettings>(`/engage/settings/readiness/${channel}/${item}`, { method: 'PUT', body: JSON.stringify({ value, evidenceUrl }) });

/** The email domain check (WP-39). Mirrors server/src/engage/settings/emailDomain.ts. */
export interface DomainMechanism { ok: boolean; code: string }
export interface EmailDomainCheck {
  id: string; domain: string; dkimSelectors: string[];
  spf: DomainMechanism; dkim: Array<DomainMechanism & { selector: string }>; dmarc: DomainMechanism & { policy?: string };
  passed: boolean; checkedAt: string;
  /** True when the scheduled re-check made it, not an admin. */
  automatic: boolean;
}
export interface EmailDomainView {
  account: { id: string; label: string; domain: string | null } | null;
  accountProblem: 'no_email_account' | 'email_account_ambiguous' | null;
  lastCheck: EmailDomainCheck | null;
}

export const getEmailDomain = (): Promise<EmailDomainView> => fetchAPI<EmailDomainView>('/engage/settings/email-domain');

/** Without selectors the server reuses the last check's. */
export const checkEmailDomain = (dkimSelectors: string[] | null): Promise<EmailDomainView> =>
  fetchAPI<EmailDomainView>('/engage/settings/email-domain/check', { method: 'POST', body: JSON.stringify(dkimSelectors === null ? {} : { dkimSelectors }) });

/** What needs an admin's attention (the email domain lost by the scheduled re-check, the İYS sync late or stale). */
export interface AttentionItem {
  /** `email_domain_lost` and `iys_sync` are derived; any other code is the rule of an open ops alert (WP-29). */
  code: string;
  /** What an ops alert is about: a channel account id or a gate denial code. */
  subject?: string;
  severity: 'warning' | 'critical';
  since: string | null;
  data: Record<string, unknown>;
}
/** How each channel account is delivering now (WP-29). Mirrors server/src/engage/ops/health.ts. */
export interface AccountHealth {
  accountId: string; label: string; channel: string; provider: string; mode: string;
  status: 'ok' | 'degraded' | 'failing';
  last15m: { sent: number; failed: number; retried: number };
  last24h: { sent: number; bounced: number; complained: number; reports: number };
  waitingForReport: number;
  issues: Array<{ rule: string; severity: 'warning' | 'critical' }>;
}
export interface DeliveryHealth {
  checkedAt: string;
  accounts: AccountHealth[];
  tenant: Array<{ rule: string; subject: string; severity: 'warning' | 'critical' }>;
}
export const getDeliveryHealth = (): Promise<DeliveryHealth> => fetchAPI<DeliveryHealth>('/engage/settings/delivery-health');

export const getAttention = (): Promise<AttentionItem[]> => fetchAPI<{ items: AttentionItem[] }>('/engage/settings/attention').then((r) => r.items);

/** The İYS connection and sync report (WP-26). Mirrors server/src/engage/iys/report.ts; never carries credentials. */
export interface IysReport {
  health: 'ok' | 'warning' | 'critical';
  push: {
    pending: number; sent: number; skipped: number; failed: number; deadlineMissed: number;
    onTrack: number; late: number; atRisk: number; breached: number; oldestPendingAt: string | null; oldestPendingAgeHours: number | null;
  };
  pull: { status: 'ok' | 'stale' | 'critical' | 'never'; lastPullAt: string | null; lastAttemptAt: string | null; lastOutcome: string | null; lastErrorCode: string | null; lastApplied: number };
}
export interface IysView {
  connection: { accountId: string; provider: string; mode: 'test' | 'live'; iysCode: number | null; brandCode: number | null } | null;
  report: IysReport | null;
}
export interface IysCheck { ok: boolean; code: string | null; message: string | null; brandFound: boolean }
export const getIys = (): Promise<IysView> => fetchAPI<IysView>('/engage/settings/iys');
export const checkIys = (): Promise<IysCheck> => fetchAPI<IysCheck>('/engage/settings/iys/check', { method: 'POST' });

export const disableChannelAccount = (id: string): Promise<unknown> =>
  fetchAPI(`/engage/channel-accounts/${encodeURIComponent(id)}/disable`, { method: 'POST' });

/** The problems a refused request carries (409 from send-enabled), or an empty list. */
export function problemsOf(error: unknown): ReadinessProblem[] {
  const body = (error as { body?: { problems?: ReadinessProblem[] } } | null)?.body;
  return Array.isArray(body?.problems) ? body.problems : [];
}

/** Field-level issues a refused request carries (400), as "path: message" lines. */
export function issuesOf(error: unknown): string[] {
  const body = (error as { body?: { issues?: Array<{ path: string; message: string }> } } | null)?.body;
  return Array.isArray(body?.issues) ? body.issues.map((i) => `${i.path}: ${i.message}`) : [];
}
