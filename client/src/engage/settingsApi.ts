import { fetchAPI } from '@/lib/apiCore';

/** Engage tenant settings (WP-22). Mirrors server/src/engage/settings/settings.ts. Only tenant admins can call these. */

export type Channel = 'email' | 'sms' | 'whatsapp';

export interface ReadinessProblem { code: string; message: string }

export interface TenantSettings {
  sendEnabled: boolean;
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
