import { withEngageTenant } from '../db.js';
import type { Channel } from '../credentials.js';
import { normalizeEmail, normalizePhone } from '../profiles.js';

/**
 * Gate configuration (WP-11): sandbox allow-list, rate cards, budget caps, quiet hours and frequency cap.
 * The settings screen (WP-22) reaches the setters through settings/settings.ts. `send_enabled` is deliberately not
 * settable here: it is set only by settings.setSendEnabled, which checks readiness first.
 */

export class GateConfigError extends Error {}

const CHANNELS: readonly Channel[] = ['email', 'sms', 'whatsapp'];
function assertChannel(ch: unknown): asserts ch is Channel {
  if (!CHANNELS.includes(ch as Channel)) throw new GateConfigError('channel must be email, sms or whatsapp');
}
function assertCurrency(c: unknown): asserts c is string {
  if (typeof c !== 'string' || !/^[A-Z]{3}$/.test(c)) throw new GateConfigError('currency must be a three-letter code such as TRY');
}
function assertMinor(v: unknown, what: string): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw new GateConfigError(`${what} must be a non-negative integer in minor units`);
}

export function normalizeForChannel(channel: Channel, raw: string): string | null {
  return channel === 'email' ? normalizeEmail(raw) : normalizePhone(raw);
}

export async function addAllowlistEntry(orgId: string, channel: Channel, rawValue: string, opts: { label?: string; createdBy?: string } = {}): Promise<{ id: string }> {
  assertChannel(channel);
  const value = normalizeForChannel(channel, rawValue);
  if (!value) throw new GateConfigError('Not a valid address for this channel');
  if (opts.label !== undefined && opts.label.length > 100) throw new GateConfigError('label must be at most 100 characters');
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO engage.send_allowlist (organization_id, channel, value_normalized, label, created_by) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, channel, value_normalized) WHERE removed_at IS NULL DO NOTHING RETURNING id`,
      [orgId, channel, value, opts.label ?? null, opts.createdBy ?? null]);
    if (r.rows[0]) return { id: r.rows[0].id };
    const existing = await c.query<{ id: string }>(
      `SELECT id FROM engage.send_allowlist WHERE organization_id = $1 AND channel = $2 AND value_normalized = $3 AND removed_at IS NULL`, [orgId, channel, value]);
    return { id: existing.rows[0]!.id };
  });
}

export async function removeAllowlistEntry(orgId: string, entryId: string): Promise<boolean> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(`UPDATE engage.send_allowlist SET removed_at = now() WHERE organization_id = $1 AND id = $2 AND removed_at IS NULL`, [orgId, entryId]);
    return (r.rowCount ?? 0) > 0;
  });
}

export async function listAllowlist(orgId: string): Promise<Array<{ id: string; channel: Channel; value: string; label: string | null }>> {
  return withEngageTenant(orgId, async (c) => (await c.query<{ id: string; channel: Channel; value_normalized: string; label: string | null }>(
    `SELECT id, channel, value_normalized, label FROM engage.send_allowlist WHERE organization_id = $1 AND removed_at IS NULL ORDER BY created_at`, [orgId]))
    .rows.map((r) => ({ id: r.id, channel: r.channel, value: r.value_normalized, label: r.label })));
}

export interface RateCardInput {
  channel: Channel;
  category: 'marketing' | 'transactional';
  route?: string;
  unitCostMinor: number;
  currency: string;
  effectiveFrom?: Date;
  createdBy?: string;
}

/** A new rate is a new row; the gate uses the latest one in effect. */
export async function addRateCard(orgId: string, input: RateCardInput): Promise<{ id: string }> {
  assertChannel(input.channel);
  if (input.category !== 'marketing' && input.category !== 'transactional') throw new GateConfigError('category must be marketing or transactional');
  if (input.route !== undefined && !/^[a-z0-9_]{1,32}$/.test(input.route)) throw new GateConfigError('route must be lower_snake, up to 32 characters');
  assertMinor(input.unitCostMinor, 'unitCostMinor');
  assertCurrency(input.currency);
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO engage.rate_cards (organization_id, channel, category, route, unit_cost_minor, currency, effective_from, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8) RETURNING id`,
      [orgId, input.channel, input.category, input.route ?? 'default', input.unitCostMinor, input.currency, input.effectiveFrom ?? null, input.createdBy ?? null]);
    return { id: r.rows[0]!.id };
  });
}

export async function setBudgetCap(orgId: string, channel: Channel, monthlyCapMinor: number, currency: string, updatedBy?: string): Promise<void> {
  assertChannel(channel);
  assertMinor(monthlyCapMinor, 'monthlyCapMinor');
  assertCurrency(currency);
  await withEngageTenant(orgId, (c) => c.query(
    `INSERT INTO engage.budget_caps (organization_id, channel, monthly_cap_minor, currency, updated_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, channel) DO UPDATE SET monthly_cap_minor = EXCLUDED.monthly_cap_minor, currency = EXCLUDED.currency,
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [orgId, channel, monthlyCapMinor, currency, updatedBy ?? null]));
}

export interface GateSettingsInput {
  timezone?: string;
  /** "HH:MM" in the tenant's time zone. Set both, or pass null for both to turn quiet hours off. */
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  frequencyCapMax?: number;
  frequencyCapWindowHours?: number;
}

export async function updateGateSettings(orgId: string, input: GateSettingsInput): Promise<void> {
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new GateConfigError('Unknown time zone'); }
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const v of [input.quietHoursStart, input.quietHoursEnd]) {
    if (v !== undefined && v !== null && !hhmm.test(v)) throw new GateConfigError('Quiet hours must be HH:MM');
  }
  if ((input.quietHoursStart === undefined) !== (input.quietHoursEnd === undefined)) throw new GateConfigError('Set quiet hours start and end together');
  if (input.frequencyCapMax !== undefined && (!Number.isInteger(input.frequencyCapMax) || input.frequencyCapMax < 1 || input.frequencyCapMax > 1000)) {
    throw new GateConfigError('frequencyCapMax must be 1 to 1000');
  }
  if (input.frequencyCapWindowHours !== undefined && (!Number.isInteger(input.frequencyCapWindowHours) || input.frequencyCapWindowHours < 1 || input.frequencyCapWindowHours > 8760)) {
    throw new GateConfigError('frequencyCapWindowHours must be 1 to 8760');
  }
  await withEngageTenant(orgId, async (c) => {
    const r = await c.query(
      `UPDATE engage.tenant_settings SET
         timezone = COALESCE($2, timezone),
         quiet_hours_start = CASE WHEN $6 THEN $3::time ELSE quiet_hours_start END,
         quiet_hours_end = CASE WHEN $6 THEN $4::time ELSE quiet_hours_end END,
         frequency_cap_max = COALESCE($5, frequency_cap_max),
         frequency_cap_window_hours = COALESCE($7, frequency_cap_window_hours),
         updated_at = now()
       WHERE organization_id = $1`,
      [orgId, input.timezone ?? null, input.quietHoursStart ?? null, input.quietHoursEnd ?? null, input.frequencyCapMax ?? null,
        input.quietHoursStart !== undefined, input.frequencyCapWindowHours ?? null]);
    if (!r.rowCount) throw new GateConfigError('Tenant settings not found');
  });
}
