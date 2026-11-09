import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { withEngageTenant } from './db.js';
import { decryptSecrets, encryptSecrets, loadKeyring, rewrapDataKey, type Keyring } from './crypto.js';
import { looksLikeSecretKey } from './redact.js';

export const CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export const MODES = ['test', 'live'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Mode = (typeof MODES)[number];

export class CredentialInputError extends Error {}
export class CredentialNotFoundError extends Error {}
export class CredentialConflictError extends Error {}

/** What the API may show. Never contains secrets, ciphertext, or wrapped keys. */
export interface AccountMeta {
  id: string;
  channel: Channel;
  provider: string;
  mode: Mode;
  label: string;
  config: Record<string, string | number | boolean>;
  fingerprint: string;
  hint: string | null;
  status: 'active' | 'disabled';
  supersedesId: string | null;
  createdAt: string;
  rotatedAt: string | null;
  disabledAt: string | null;
}

export interface CreateInput {
  channel: Channel;
  provider: string;
  mode: Mode;
  label: string;
  config: Record<string, string | number | boolean>;
  secrets: Record<string, string>;
}

const META_COLS = `id, channel, provider, mode, label, config, secret_fingerprint, secret_hint, status, supersedes_id, created_at, rotated_at, disabled_at`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MetaRow {
  id: string; channel: Channel; provider: string; mode: Mode; label: string; config: AccountMeta['config'];
  secret_fingerprint: string; secret_hint: string | null; status: 'active' | 'disabled'; supersedes_id: string | null;
  created_at: Date; rotated_at: Date | null; disabled_at: Date | null;
}

const toMeta = (r: MetaRow): AccountMeta => ({
  id: r.id, channel: r.channel, provider: r.provider, mode: r.mode, label: r.label, config: r.config,
  fingerprint: r.secret_fingerprint, hint: r.secret_hint, status: r.status, supersedesId: r.supersedes_id,
  createdAt: r.created_at.toISOString(),
  rotatedAt: r.rotated_at?.toISOString() ?? null,
  disabledAt: r.disabled_at?.toISOString() ?? null,
});

function plainObject(value: unknown, what: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new CredentialInputError(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function parseConfig(raw: unknown): AccountMeta['config'] {
  const obj = plainObject(raw, 'config');
  const entries = Object.entries(obj);
  if (entries.length > 20) throw new CredentialInputError('config has too many fields (max 20)');
  const out: AccountMeta['config'] = {};
  for (const [k, v] of entries) {
    if (!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(k)) throw new CredentialInputError(`config field "${k}" has an invalid name`);
    if (looksLikeSecretKey(k)) throw new CredentialInputError(`config field "${k}" looks like a secret; send it in "secrets" instead`);
    if (typeof v === 'string' ? v.length > 512 : typeof v !== 'number' && typeof v !== 'boolean') {
      throw new CredentialInputError(`config field "${k}" must be a short string, number or boolean`);
    }
    out[k] = v as string | number | boolean;
  }
  return out;
}

export function parseSecrets(raw: unknown, { required }: { required: boolean }): Record<string, string> {
  const obj = plainObject(raw, 'secrets');
  const entries = Object.entries(obj);
  if (required && entries.length === 0) throw new CredentialInputError('secrets must contain at least one value');
  if (entries.length > 10) throw new CredentialInputError('secrets has too many values (max 10)');
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) throw new CredentialInputError(`secret name "${k}" is invalid (lowercase letters, digits, _)`);
    if (typeof v !== 'string' || v.length === 0 || v.length > 4096) throw new CredentialInputError(`secret "${k}" must be a non-empty string up to 4096 characters`);
    out[k] = v;
  }
  return out;
}

export function parseCreateInput(body: unknown): CreateInput {
  const b = plainObject(body, 'body');
  const channel = b.channel as Channel;
  const mode = b.mode as Mode;
  const provider = typeof b.provider === 'string' ? b.provider.trim() : '';
  const label = typeof b.label === 'string' ? b.label.trim() : '';
  if (!(CHANNELS as readonly unknown[]).includes(channel)) throw new CredentialInputError(`channel must be one of ${CHANNELS.join(', ')}`);
  if (!(MODES as readonly unknown[]).includes(mode)) throw new CredentialInputError(`mode must be one of ${MODES.join(', ')}`);
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(provider)) throw new CredentialInputError('provider must be lowercase letters, digits and _ (2-32 chars)');
  if (label.length < 1 || label.length > 100) throw new CredentialInputError('label must be 1-100 characters');
  return { channel, provider, mode, label, config: parseConfig(b.config), secrets: parseSecrets(b.secrets, { required: false }) };
}

async function insertAccount(client: PoolClient, organizationId: string, createdBy: string | null, input: CreateInput, supersedesId: string | null, keyring: Keyring): Promise<AccountMeta> {
  const id = randomUUID();
  const enc = encryptSecrets(input.secrets, { organizationId, accountId: id }, keyring);
  try {
    const r = await client.query<MetaRow>(
      `INSERT INTO engage.channel_accounts
         (id, organization_id, channel, provider, mode, label, config, secret_ciphertext, wrapped_data_key, key_id,
          secret_fingerprint, secret_hint, supersedes_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${META_COLS}`,
      [id, organizationId, input.channel, input.provider, input.mode, input.label, JSON.stringify(input.config),
        enc.secretCiphertext, enc.wrappedDataKey, enc.keyId, enc.fingerprint, enc.hint, supersedesId, createdBy],
    );
    return toMeta(r.rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new CredentialConflictError('An active account with this channel and label already exists');
    throw err;
  }
}

export async function createAccount(organizationId: string, createdBy: string | null, input: CreateInput, keyring: Keyring = loadKeyring()): Promise<AccountMeta> {
  return withEngageTenant(organizationId, (client) => insertAccount(client, organizationId, createdBy, input, null, keyring));
}

export async function listAccounts(organizationId: string): Promise<AccountMeta[]> {
  return withEngageTenant(organizationId, async (client) =>
    (await client.query<MetaRow>(`SELECT ${META_COLS} FROM engage.channel_accounts ORDER BY created_at DESC`)).rows.map(toMeta));
}

export async function getAccount(organizationId: string, accountId: string): Promise<AccountMeta> {
  if (!UUID_RE.test(accountId)) throw new CredentialNotFoundError('Account not found');
  const row = await withEngageTenant(organizationId, async (client) =>
    (await client.query<MetaRow>(`SELECT ${META_COLS} FROM engage.channel_accounts WHERE id = $1`, [accountId])).rows[0]);
  if (!row) throw new CredentialNotFoundError('Account not found');
  return toMeta(row);
}

/** Rotation writes a new row with the new secrets and disables the old one, which stays for audit. */
export async function rotateAccount(
  organizationId: string, createdBy: string, accountId: string,
  input: { secrets: Record<string, string>; config?: AccountMeta['config'] },
  keyring: Keyring = loadKeyring(),
): Promise<AccountMeta> {
  if (!UUID_RE.test(accountId)) throw new CredentialNotFoundError('Account not found');
  if (Object.keys(input.secrets).length === 0) throw new CredentialInputError('secrets must contain at least one value');
  return withEngageTenant(organizationId, async (client) => {
    const old = (await client.query<MetaRow>(`SELECT ${META_COLS} FROM engage.channel_accounts WHERE id = $1 FOR UPDATE`, [accountId])).rows[0];
    if (!old) throw new CredentialNotFoundError('Account not found');
    if (old.status !== 'active') throw new CredentialConflictError('Only an active account can be rotated');
    await client.query(`UPDATE engage.channel_accounts SET status = 'disabled', disabled_at = now(), rotated_at = now() WHERE id = $1`, [accountId]);
    return insertAccount(client, organizationId, createdBy, {
      channel: old.channel, provider: old.provider, mode: old.mode, label: old.label,
      config: input.config ?? old.config, secrets: input.secrets,
    }, old.id, keyring);
  });
}

export async function disableAccount(organizationId: string, accountId: string): Promise<AccountMeta> {
  if (!UUID_RE.test(accountId)) throw new CredentialNotFoundError('Account not found');
  return withEngageTenant(organizationId, async (client) => {
    const r = await client.query<MetaRow>(
      `UPDATE engage.channel_accounts SET status = 'disabled', disabled_at = COALESCE(disabled_at, now()) WHERE id = $1 RETURNING ${META_COLS}`,
      [accountId]);
    if (!r.rows[0]) throw new CredentialNotFoundError('Account not found');
    return toMeta(r.rows[0]);
  });
}

/**
 * For adapters, server side only: never call this from a route. Throws if the account is missing or disabled, or if
 * decryption fails for any reason (wrong or missing key, tampering, a ciphertext from another tenant or row).
 */
export async function loadAccountSecrets(organizationId: string, accountId: string, keyring: Keyring = loadKeyring()): Promise<{ account: AccountMeta; secrets: Record<string, string> }> {
  const row = await withEngageTenant(organizationId, async (client) =>
    (await client.query<MetaRow & { secret_ciphertext: Buffer; wrapped_data_key: Buffer; key_id: string }>(
      `SELECT ${META_COLS}, secret_ciphertext, wrapped_data_key, key_id FROM engage.channel_accounts WHERE id = $1 AND status = 'active'`,
      [accountId])).rows[0]);
  if (!row) throw new CredentialNotFoundError('Active account not found');
  const secrets = decryptSecrets(
    { secretCiphertext: row.secret_ciphertext, wrappedDataKey: row.wrapped_data_key, keyId: row.key_id },
    { organizationId, accountId }, keyring);
  return { account: toMeta(row), secrets };
}

/** Master-key rotation for one tenant: re-wraps every row's data key under the current master key. */
export async function rewrapTenant(organizationId: string, keyring: Keyring = loadKeyring()): Promise<number> {
  return withEngageTenant(organizationId, async (client) => {
    const rows = (await client.query<{ id: string; secret_ciphertext: Buffer; wrapped_data_key: Buffer; key_id: string }>(
      `SELECT id, secret_ciphertext, wrapped_data_key, key_id FROM engage.channel_accounts WHERE key_id <> $1 FOR UPDATE`, [keyring.currentId])).rows;
    for (const r of rows) {
      const next = rewrapDataKey({ secretCiphertext: r.secret_ciphertext, wrappedDataKey: r.wrapped_data_key, keyId: r.key_id }, { organizationId, accountId: r.id }, keyring);
      await client.query(`UPDATE engage.channel_accounts SET wrapped_data_key = $1, key_id = $2, rewrapped_at = now() WHERE id = $3`, [next.wrappedDataKey, next.keyId, r.id]);
    }
    return rows.length;
  });
}
