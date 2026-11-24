import type { PoolClient } from 'pg';
import { withEngageTenant } from './db.js';

export const CONSENT_CHANNELS = ['sms', 'email', 'call', 'whatsapp'] as const;
export const CONSENT_SOURCES = ['iys', 'web', 'import', 'api', 'unsubscribe_link', 'stop_keyword'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
export type IdentifierType = 'email' | 'phone';
export type SuppressionReason = 'hard_bounce' | 'complaint' | 'opt_out' | 'manual' | 'invalid';

export class ProfileInputError extends Error {}
export class ProfileNotFoundError extends Error {}
/** The value is already the active identifier of a different profile in this tenant. */
export class IdentifierConflictError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lower-case, trimmed. Returns null when it cannot be an address (the database CHECK is the backstop). */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/**
 * E.164. Turkish national forms default to +90: 05XXXXXXXXX, 5XXXXXXXXX, 905XXXXXXXXX, 00905XXXXXXXXX, +905XXXXXXXXX.
 * Anything else must already be international (+ or 00 prefix). Returns null for anything that is not 8-15 digits.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim().replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]+$/.test(v)) return null;
  if (v.startsWith('+')) v = v.slice(1);
  else if (v.startsWith('00')) v = v.slice(2);
  else if (v.startsWith('0') && v.length === 11) v = `90${v.slice(1)}`;
  else if (v.length === 10 && v.startsWith('5')) v = `90${v}`;
  else if (!v.startsWith('90')) return null;
  return /^[1-9][0-9]{7,14}$/.test(v) ? `+${v}` : null;
}

export interface ProfileView {
  id: string;
  externalId: string;
  attributes: Record<string, unknown>;
  timezone: string | null;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
  erasedAt: string | null;
  identifiers: { email: string | null; phone: string | null };
  consents: Partial<Record<ConsentChannel, 'granted' | 'revoked'>>;
}

export interface UpsertProfileInput {
  externalId: string;
  email?: string | null;
  phone?: string | null;
  attributes?: Record<string, unknown>;
  timezone?: string | null;
  locale?: string | null;
}

function parseUpsert(input: UpsertProfileInput): void {
  if (typeof input.externalId !== 'string' || input.externalId.length < 1 || input.externalId.length > 200) {
    throw new ProfileInputError('externalId must be 1-200 characters');
  }
  if (input.attributes !== undefined && (typeof input.attributes !== 'object' || input.attributes === null || Array.isArray(input.attributes))) {
    throw new ProfileInputError('attributes must be an object');
  }
  if (input.attributes && JSON.stringify(input.attributes).length > 32_000) throw new ProfileInputError('attributes are too large (max 32 KB)');
}

/** Set the active identifier of a type: no-op if unchanged, otherwise deactivate the old value and insert the new. */
async function setIdentifier(c: PoolClient, orgId: string, profileId: string, type: IdentifierType, normalized: string): Promise<void> {
  const cur = await c.query<{ id: string; value_normalized: string }>(
    `SELECT id, value_normalized FROM engage.identifiers WHERE organization_id = $1 AND profile_id = $2 AND type = $3 AND is_active FOR UPDATE`,
    [orgId, profileId, type]);
  if (cur.rows[0]?.value_normalized === normalized) return;
  const owner = await c.query<{ profile_id: string }>(
    `SELECT profile_id FROM engage.identifiers WHERE organization_id = $1 AND type = $2 AND value_normalized = $3 AND is_active`,
    [orgId, type, normalized]);
  if (owner.rows[0] && owner.rows[0].profile_id !== profileId) {
    throw new IdentifierConflictError(`That ${type} already belongs to another profile`);
  }
  if (cur.rows[0]) {
    await c.query(`UPDATE engage.identifiers SET is_active = false, deactivated_at = now() WHERE id = $1`, [cur.rows[0].id]);
  }
  // A previously used value of this same profile is reactivated as a new row; history rows stay as they were.
  await c.query(
    `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized) VALUES ($1, $2, $3, $4)`,
    [orgId, profileId, type, normalized]);
}

async function loadView(c: PoolClient, orgId: string, profileId: string): Promise<ProfileView | null> {
  const p = await c.query(
    `SELECT id, external_id, attributes, timezone, locale, created_at, updated_at, erased_at
       FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, profileId]);
  const row = p.rows[0];
  if (!row) return null;
  const ids = await c.query<{ type: string; value_normalized: string }>(
    `SELECT type, value_normalized FROM engage.identifiers WHERE organization_id = $1 AND profile_id = $2 AND is_active AND type <> 'external'`,
    [orgId, profileId]);
  const st = await c.query<{ channel: ConsentChannel; status: 'granted' | 'revoked' }>(
    `SELECT channel, status FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND purpose = 'marketing'`,
    [orgId, profileId]);
  return {
    id: row.id, externalId: row.external_id, attributes: row.attributes, timezone: row.timezone, locale: row.locale,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    erasedAt: row.erased_at?.toISOString() ?? null,
    identifiers: {
      email: ids.rows.find((r) => r.type === 'email')?.value_normalized ?? null,
      phone: ids.rows.find((r) => r.type === 'phone')?.value_normalized ?? null,
    },
    consents: Object.fromEntries(st.rows.map((r) => [r.channel, r.status])),
  };
}

/**
 * Create or update a profile by the tenant's external id. Attributes are merged (a key set to null is removed).
 * email/phone: undefined leaves it alone, null deactivates it, a string replaces it (old value kept as history).
 */
export async function upsertProfile(orgId: string, input: UpsertProfileInput): Promise<ProfileView> {
  parseUpsert(input);
  prepareIdentifiers(input);
  return withEngageTenant(orgId, (c) => upsertProfileOn(c, orgId, input));
}

function prepareIdentifiers(input: UpsertProfileInput): void {
  const email = input.email === undefined || input.email === null ? input.email : normalizeEmail(input.email);
  const phone = input.phone === undefined || input.phone === null ? input.phone : normalizePhone(input.phone);
  if (email === null && typeof input.email === 'string') throw new ProfileInputError('email is not a valid address');
  if (phone === null && typeof input.phone === 'string') throw new ProfileInputError('phone is not a valid number');
}

/** Same as upsertProfile, inside a transaction the caller already opened for this tenant (so it can be combined with other writes). */
export async function upsertProfileOn(c: PoolClient, orgId: string, input: UpsertProfileInput): Promise<ProfileView> {
  parseUpsert(input);
  const email = input.email === undefined || input.email === null ? input.email : normalizeEmail(input.email);
  const phone = input.phone === undefined || input.phone === null ? input.phone : normalizePhone(input.phone);
  if (email === null && typeof input.email === 'string') throw new ProfileInputError('email is not a valid address');
  if (phone === null && typeof input.phone === 'string') throw new ProfileInputError('phone is not a valid number');
  {
    const res = await c.query<{ id: string; erased_at: Date | null }>(
      `INSERT INTO engage.profiles (organization_id, external_id, attributes, timezone, locale)
       VALUES ($1, $2, '{}'::jsonb, $3, $4)
       ON CONFLICT (organization_id, external_id) DO UPDATE SET updated_at = now()
       RETURNING id, erased_at`,
      [orgId, input.externalId, input.timezone ?? null, input.locale ?? null]);
    const { id, erased_at } = res.rows[0]!;
    if (erased_at) throw new ProfileInputError('This profile was erased and cannot be modified');
    if (input.attributes) {
      await c.query(
        `UPDATE engage.profiles SET attributes = jsonb_strip_nulls(attributes || $3::jsonb), updated_at = now()
          WHERE organization_id = $1 AND id = $2`, [orgId, id, JSON.stringify(input.attributes)]);
    }
    if (input.timezone !== undefined || input.locale !== undefined) {
      await c.query(
        `UPDATE engage.profiles SET timezone = COALESCE($3, timezone), locale = COALESCE($4, locale)
          WHERE organization_id = $1 AND id = $2`, [orgId, id, input.timezone ?? null, input.locale ?? null]);
    }
    // The tenant's own id is also kept as an identifier row (unique through profiles.external_id already).
    await c.query(
      `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized) VALUES ($1, $2, 'external', $3)
       ON CONFLICT DO NOTHING`, [orgId, id, input.externalId]);
    for (const [type, value] of [['email', email], ['phone', phone]] as const) {
      if (value === undefined) continue;
      if (value === null) {
        await c.query(
          `UPDATE engage.identifiers SET is_active = false, deactivated_at = now()
            WHERE organization_id = $1 AND profile_id = $2 AND type = $3 AND is_active`, [orgId, id, type]);
      } else {
        await setIdentifier(c, orgId, id, type, value);
      }
    }
    return (await loadView(c, orgId, id))!;
  }
}

export async function getProfile(orgId: string, profileId: string): Promise<ProfileView> {
  if (!UUID_RE.test(profileId)) throw new ProfileNotFoundError('Profile not found');
  const view = await withEngageTenant(orgId, (c) => loadView(c, orgId, profileId));
  if (!view) throw new ProfileNotFoundError('Profile not found');
  return view;
}

export async function findProfileByExternalId(orgId: string, externalId: string): Promise<ProfileView | null> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string }>(`SELECT id FROM engage.profiles WHERE organization_id = $1 AND external_id = $2`, [orgId, externalId]);
    return r.rows[0] ? loadView(c, orgId, r.rows[0].id) : null;
  });
}

export interface ConsentInput {
  channel: ConsentChannel;
  status: 'granted' | 'revoked';
  source: ConsentSource;
  evidence?: Record<string, unknown>;
  recordedAt?: Date;
}

const OPT_OUT_SOURCES: ReadonlySet<ConsentSource> = new Set(['unsubscribe_link', 'stop_keyword']);

/** Which identifier an address-level suppression for this channel applies to. */
const CHANNEL_IDENTIFIER: Record<ConsentChannel, IdentifierType> = { email: 'email', sms: 'phone', whatsapp: 'phone', call: 'phone' };

/**
 * Append a consent decision. consent_state follows by trigger. A revocation that came from the recipient
 * (unsubscribe link, STOP keyword) also suppresses the address, in the same transaction.
 */
export async function recordConsent(orgId: string, profileId: string, input: ConsentInput): Promise<ProfileView> {
  if (!CONSENT_CHANNELS.includes(input.channel)) throw new ProfileInputError('unknown channel');
  if (input.status !== 'granted' && input.status !== 'revoked') throw new ProfileInputError('status must be granted or revoked');
  if (!CONSENT_SOURCES.includes(input.source)) throw new ProfileInputError('unknown source');
  const evidence = input.evidence ?? {};
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) throw new ProfileInputError('evidence must be an object');
  if (input.status === 'granted' && input.source !== 'iys' && Object.keys(evidence).length === 0) {
    throw new ProfileInputError('A consent that did not come through IYS needs evidence (source, text version, timestamp, IP or channel)');
  }
  if (!UUID_RE.test(profileId)) throw new ProfileNotFoundError('Profile not found');
  return withEngageTenant(orgId, (c) => recordConsentOn(c, orgId, profileId, input));
}

/** Same as recordConsent, inside a transaction the caller already opened for this tenant. Input must already be validated by recordConsent's rules. */
export async function recordConsentOn(c: PoolClient, orgId: string, profileId: string, input: ConsentInput): Promise<ProfileView> {
  const evidence = input.evidence ?? {};
  {
    const owned = await c.query(`SELECT 1 FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [orgId, profileId]);
    if (owned.rowCount === 0) throw new ProfileNotFoundError('Profile not found');
    await c.query(
      `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, now()))`,
      [orgId, profileId, input.channel, input.status, input.source, JSON.stringify(evidence), input.recordedAt ?? null]);
    if (input.status === 'revoked' && OPT_OUT_SOURCES.has(input.source)) {
      const type = CHANNEL_IDENTIFIER[input.channel];
      const addr = await c.query<{ value_normalized: string }>(
        `SELECT value_normalized FROM engage.identifiers WHERE organization_id = $1 AND profile_id = $2 AND type = $3 AND is_active`,
        [orgId, profileId, type]);
      if (addr.rows[0]) await addSuppressionOn(c, orgId, input.channel, addr.rows[0].value_normalized, 'opt_out');
    }
    return (await loadView(c, orgId, profileId))!;
  }
}

async function addSuppressionOn(c: PoolClient, orgId: string, channel: ConsentChannel, normalized: string, reason: SuppressionReason): Promise<void> {
  await c.query(
    `INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, channel, value_normalized) DO NOTHING`, [orgId, channel, normalized, reason]);
}

export async function addSuppression(orgId: string, channel: ConsentChannel, rawValue: string, reason: SuppressionReason): Promise<void> {
  if (!CONSENT_CHANNELS.includes(channel)) throw new ProfileInputError('unknown channel');
  const value = CHANNEL_IDENTIFIER[channel] === 'email' ? normalizeEmail(rawValue) : normalizePhone(rawValue);
  if (!value) throw new ProfileInputError('value is not a valid address for that channel');
  await withEngageTenant(orgId, (c) => addSuppressionOn(c, orgId, channel, value, reason));
}

export async function isSuppressed(orgId: string, channel: ConsentChannel, rawValue: string): Promise<boolean> {
  const value = CHANNEL_IDENTIFIER[channel] === 'email' ? normalizeEmail(rawValue) : normalizePhone(rawValue);
  if (!value) return true; // fail closed: an address we cannot normalize is not sendable
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(
      `SELECT 1 FROM engage.suppressions WHERE organization_id = $1 AND channel = $2 AND value_normalized = $3`, [orgId, channel, value]);
    return (r.rowCount ?? 0) > 0;
  });
}

/** Fail closed: anything but an explicit current grant is "no consent". */
export async function hasConsent(orgId: string, profileId: string, channel: ConsentChannel): Promise<boolean> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ status: string }>(
      `SELECT status FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND channel = $3 AND purpose = 'marketing'`,
      [orgId, profileId, channel]);
    return r.rows[0]?.status === 'granted';
  });
}
