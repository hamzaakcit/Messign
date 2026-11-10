import { withEngageTenant } from '../db.js';
import { readinessOn, type ReadinessProblem, type SendReadiness } from '../campaigns/campaigns.js';
import { currentSendMode, REQUIRED_READINESS } from '../messaging/gate.js';
import {
  addRateCard, GateConfigError, setBudgetCap, updateGateSettings, type RateCardInput,
} from '../messaging/gateConfig.js';
import { CHANNELS, listAccounts, type AccountMeta, type Channel } from '../credentials.js';
import { logInfo } from '../log.js';

/**
 * Tenant settings for the engage settings screen (WP-22): send_enabled, quiet hours, the frequency cap, the monthly
 * budget caps, the rate cards, the readiness items and the channel accounts. The rules are not written here again: the
 * readiness check is the one the campaigns use (readinessOn), and the setters are the gate's own (gateConfig). What this
 * module adds is the one rule the gate cannot enforce on its own: send_enabled is only turned on when sending is ready.
 */

export class SettingsInputError extends Error {
  constructor(message: string, public readonly issues: Array<{ path: string; message: string }> = []) { super(message); }
}
export class SettingsNotFoundError extends Error {}
export class SettingsNotReadyError extends Error {
  constructor(public readonly problems: ReadinessProblem[]) { super('Sending cannot be turned on until these are fixed'); }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const READINESS_VALUE_MAX = 200;
const EVIDENCE_URL = /^https:\/\/\S{1,500}$/;
const CURRENCY = /^[A-Z]{3}$/;
/** Every readiness item the gate knows, per channel. An item outside this list cannot be recorded. */
const KNOWN_ITEMS = new Set(Object.values(REQUIRED_READINESS).flat());

export interface QuietHours { start: string; end: string }
export interface TenantSettingsView {
  sendEnabled: boolean;
  timezone: string;
  quietHours: QuietHours | null;
  frequencyCap: { max: number; windowHours: number };
  readiness: SendReadiness;
  requiredItems: Record<Channel, readonly string[]>;
  readinessItems: Array<{ channel: Channel; item: string; value: string; evidenceUrl: string | null; recordedAt: string }>;
  budgetCaps: Array<{ channel: Channel; monthlyCapMinor: number; currency: string; updatedAt: string }>;
  rateCards: Array<{ channel: Channel; category: string; route: string; unitCostMinor: number; currency: string; effectiveFrom: string }>;
  channelAccounts: AccountMeta[];
}

export interface GateSettingsPatch {
  timezone?: string;
  /** null turns quiet hours off; an object sets both ends ("HH:MM", tenant time zone). Omit to leave them as they are. */
  quietHours?: QuietHours | null;
  frequencyCap?: { max: number; windowHours: number };
}

const iso = (v: unknown): string => new Date(v as string).toISOString();
const hhmm = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 5) : null);

function channelOrThrow(v: unknown): Channel {
  if (!CHANNELS.includes(v as Channel)) throw new SettingsInputError('The channel is not valid', [{ path: 'channel', message: 'must be email, sms or whatsapp' }]);
  return v as Channel;
}

/** Everything the screen shows, read in one tenant transaction, with the readiness the send gate would apply. */
export async function getTenantSettings(orgId: string): Promise<TenantSettingsView> {
  const view = await withEngageTenant(orgId, async (c) => {
    const s = (await c.query<{
      send_enabled: boolean; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null;
      frequency_cap_max: number; frequency_cap_window_hours: number;
    }>(`SELECT send_enabled, timezone, quiet_hours_start::text, quiet_hours_end::text, frequency_cap_max, frequency_cap_window_hours
          FROM engage.tenant_settings WHERE organization_id = $1`, [orgId])).rows[0];
    if (!s) throw new SettingsNotFoundError('Tenant settings not found');
    const readiness = await readinessOn(c, orgId, currentSendMode());
    const items = (await c.query<{ channel: Channel; item: string; value: string; evidence_url: string | null; recorded_at: string }>(
      `SELECT channel, item, value, evidence_url, recorded_at FROM engage.tenant_readiness WHERE organization_id = $1 ORDER BY channel, item`, [orgId])).rows;
    const caps = (await c.query<{ channel: Channel; monthly_cap_minor: string; currency: string; updated_at: string }>(
      `SELECT channel, monthly_cap_minor::text, currency, updated_at FROM engage.budget_caps WHERE organization_id = $1 ORDER BY channel`, [orgId])).rows;
    // The rate in effect for each channel, category and route: the newest row whose effective date has passed.
    const rates = (await c.query<{ channel: Channel; category: string; route: string; unit_cost_minor: string; currency: string; effective_from: string }>(
      `SELECT DISTINCT ON (channel, category, route) channel, category, route, unit_cost_minor::text, currency, effective_from
         FROM engage.rate_cards WHERE organization_id = $1 AND effective_from <= now()
        ORDER BY channel, category, route, effective_from DESC`, [orgId])).rows;
    return {
      sendEnabled: s.send_enabled,
      timezone: s.timezone,
      quietHours: s.quiet_hours_start && s.quiet_hours_end ? { start: hhmm(s.quiet_hours_start)!, end: hhmm(s.quiet_hours_end)! } : null,
      frequencyCap: { max: s.frequency_cap_max, windowHours: s.frequency_cap_window_hours },
      readiness,
      requiredItems: REQUIRED_READINESS,
      readinessItems: items.map((r) => ({ channel: r.channel, item: r.item, value: r.value, evidenceUrl: r.evidence_url, recordedAt: iso(r.recorded_at) })),
      budgetCaps: caps.map((r) => ({ channel: r.channel, monthlyCapMinor: Number(r.monthly_cap_minor), currency: r.currency, updatedAt: iso(r.updated_at) })),
      rateCards: rates.map((r) => ({ channel: r.channel, category: r.category, route: r.route, unitCostMinor: Number(r.unit_cost_minor), currency: r.currency, effectiveFrom: iso(r.effective_from) })),
      channelAccounts: [] as AccountMeta[],
    };
  });
  view.channelAccounts = await listAccounts(orgId);
  return view;
}

/**
 * Turns sending on or off. Turning it on re-checks readiness in the same transaction that writes the flag (the tenant
 * row is locked first, so two admins cannot race past the check). Turning it off is always allowed: it is the kill switch.
 * The check is the campaigns' readiness minus the flag itself, so it includes SEND_MODE, the email account, the rate card,
 * the budget cap, the public links and, in live mode, the legal readiness items.
 */
export async function setSendEnabled(orgId: string, userId: string, enabled: boolean): Promise<void> {
  await withEngageTenant(orgId, async (c) => {
    const row = (await c.query<{ send_enabled: boolean }>(
      `SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1 FOR UPDATE`, [orgId])).rows[0];
    if (!row) throw new SettingsNotFoundError('Tenant settings not found');
    if (enabled) {
      const readiness = await readinessOn(c, orgId, currentSendMode());
      const problems = readiness.problems.filter((p) => p.code !== 'tenant_send_disabled');
      if (problems.length) throw new SettingsNotReadyError(problems);
    }
    await c.query(`UPDATE engage.tenant_settings SET send_enabled = $2, updated_at = now() WHERE organization_id = $1`, [orgId, enabled]);
  });
  logSetting(orgId, userId, 'send_enabled', enabled);
}

export async function updateGate(orgId: string, userId: string, patch: GateSettingsPatch): Promise<void> {
  const issues: Array<{ path: string; message: string }> = [];
  if (patch.quietHours) {
    const { start, end } = patch.quietHours;
    if (!HHMM.test(start) || !HHMM.test(end)) issues.push({ path: 'quietHours', message: 'start and end must be HH:MM' });
    else if (start === end) issues.push({ path: 'quietHours', message: 'start and end must differ' });
  }
  if (patch.frequencyCap) {
    const { max, windowHours } = patch.frequencyCap;
    if (!Number.isInteger(max) || max < 1 || max > 1000) issues.push({ path: 'frequencyCap.max', message: 'must be a whole number from 1 to 1000' });
    if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 8760) issues.push({ path: 'frequencyCap.windowHours', message: 'must be a whole number of hours from 1 to 8760' });
  }
  if (issues.length) throw new SettingsInputError('The settings are not valid', issues);
  try {
    await updateGateSettings(orgId, {
      timezone: patch.timezone,
      quietHoursStart: patch.quietHours === undefined ? undefined : patch.quietHours?.start ?? null,
      quietHoursEnd: patch.quietHours === undefined ? undefined : patch.quietHours?.end ?? null,
      frequencyCapMax: patch.frequencyCap?.max,
      frequencyCapWindowHours: patch.frequencyCap?.windowHours,
    });
  } catch (err) {
    if (err instanceof GateConfigError) throw new SettingsInputError(err.message);
    throw err;
  }
  logSetting(orgId, userId, 'gate', Object.keys(patch));
}

export async function updateBudgetCap(orgId: string, userId: string, channelRaw: unknown, input: { monthlyCapMinor: unknown; currency: unknown }): Promise<void> {
  const channel = channelOrThrow(channelRaw);
  const issues: Array<{ path: string; message: string }> = [];
  if (!Number.isSafeInteger(input.monthlyCapMinor) || (input.monthlyCapMinor as number) < 0) issues.push({ path: 'monthlyCapMinor', message: 'must be a whole number of minor units (kuruş) and not negative' });
  if (typeof input.currency !== 'string' || !CURRENCY.test(input.currency)) issues.push({ path: 'currency', message: 'must be a three-letter code such as TRY' });
  if (issues.length) throw new SettingsInputError('The budget cap is not valid', issues);
  try {
    await setBudgetCap(orgId, channel, input.monthlyCapMinor as number, input.currency as string, userId);
  } catch (err) {
    if (err instanceof GateConfigError) throw new SettingsInputError(err.message);
    throw err;
  }
  logSetting(orgId, userId, 'budget_cap', channel);
}

/** A new rate is a new row, so the history of what a message was priced at is kept. */
export async function addRate(orgId: string, userId: string, input: Record<string, unknown>): Promise<void> {
  const channel = channelOrThrow(input.channel);
  const issues: Array<{ path: string; message: string }> = [];
  if (input.category !== 'marketing' && input.category !== 'transactional') issues.push({ path: 'category', message: 'must be marketing or transactional' });
  if (input.route !== undefined && (typeof input.route !== 'string' || !/^[a-z0-9_]{1,32}$/.test(input.route))) issues.push({ path: 'route', message: 'lower_snake, up to 32 characters' });
  if (!Number.isSafeInteger(input.unitCostMinor) || (input.unitCostMinor as number) < 0) issues.push({ path: 'unitCostMinor', message: 'must be a whole number of minor units and not negative' });
  if (typeof input.currency !== 'string' || !CURRENCY.test(input.currency)) issues.push({ path: 'currency', message: 'must be a three-letter code such as TRY' });
  if (issues.length) throw new SettingsInputError('The rate card is not valid', issues);
  const rate: RateCardInput = {
    channel,
    category: input.category as RateCardInput['category'],
    route: input.route as string | undefined,
    unitCostMinor: input.unitCostMinor as number,
    currency: input.currency as string,
    createdBy: userId,
  };
  try {
    await addRateCard(orgId, rate);
  } catch (err) {
    if (err instanceof GateConfigError) throw new SettingsInputError(err.message);
    throw err;
  }
  logSetting(orgId, userId, 'rate_card', channel);
}

/**
 * Records a readiness item the legal side needs (for example that a DPA is signed), with the value the admin gives and
 * an optional evidence link. Messign records what the tenant says; it does not verify it. Only the items the gate knows
 * can be recorded, and only for the channel they belong to.
 */
export async function recordReadiness(orgId: string, userId: string, channelRaw: unknown, itemRaw: unknown, input: { value: unknown; evidenceUrl: unknown }): Promise<void> {
  const channel = channelOrThrow(channelRaw);
  const item = typeof itemRaw === 'string' ? itemRaw : '';
  const issues: Array<{ path: string; message: string }> = [];
  if (!REQUIRED_READINESS[channel].includes(item)) {
    issues.push({ path: 'item', message: KNOWN_ITEMS.has(item) ? `${item} is not a readiness item for ${channel}` : 'not a readiness item the gate checks' });
  }
  const value = typeof input.value === 'string' ? input.value.trim() : '';
  if (value.length < 1 || value.length > READINESS_VALUE_MAX) issues.push({ path: 'value', message: `must be 1 to ${READINESS_VALUE_MAX} characters` });
  const evidence = input.evidenceUrl === undefined || input.evidenceUrl === null || input.evidenceUrl === '' ? null : input.evidenceUrl;
  if (evidence !== null && (typeof evidence !== 'string' || !EVIDENCE_URL.test(evidence))) issues.push({ path: 'evidenceUrl', message: 'must be an https link, or left empty' });
  if (issues.length) throw new SettingsInputError('The readiness item is not valid', issues);
  await withEngageTenant(orgId, (c) => c.query(
    `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value, evidence_url, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, channel, item) DO UPDATE SET value = EXCLUDED.value, evidence_url = EXCLUDED.evidence_url,
       recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
    [orgId, channel, item, value, evidence, userId]));
  logSetting(orgId, userId, 'readiness', `${channel}.${item}`);
}

function logSetting(orgId: string, userId: string, setting: string, value: unknown): void {
  // Ids and codes only: never a value that could be a secret or a personal detail.
  logInfo('engage settings changed', { organizationId: orgId, userId, setting, value: typeof value === 'boolean' || typeof value === 'string' ? value : JSON.stringify(value) });
}
