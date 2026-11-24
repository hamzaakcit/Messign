import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Envelope encryption for tenant credentials (ADR-006). Failures throw and never return partial or plaintext data,
 * so callers (the send gate) deny on any exception.
 *
 *   secrets JSON --AES-256-GCM(data key)--> secret_ciphertext
 *   data key    --AES-256-GCM(master key)--> wrapped_data_key   (master key named by key_id)
 *
 * Both layers are bound to the tenant and account through the GCM additional data, so a ciphertext copied to another
 * tenant's row, or another row, fails to decrypt.
 */
export class CredentialKeyError extends Error {}
export class CredentialDecryptError extends Error {}

const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_ID_RE = /^[a-z0-9_-]{1,16}$/;

export interface Keyring {
  currentId: string;
  keys: Map<string, Buffer>;
}

export interface EncryptedSecrets {
  secretCiphertext: Buffer;
  wrappedDataKey: Buffer;
  keyId: string;
  fingerprint: string;
  hint: string | null;
}

export interface StoredSecrets {
  secretCiphertext: Buffer;
  wrappedDataKey: Buffer;
  keyId: string;
}

export interface Binding {
  organizationId: string;
  accountId: string;
}

function parseKey(hex: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new CredentialKeyError(`${label} must be 64 hex characters (32 bytes).`);
  const key = Buffer.from(hex, 'hex');
  if (key.every((b) => b === key[0])) throw new CredentialKeyError(`${label} is not a usable key (all bytes identical).`);
  return key;
}

/**
 * ENGAGE_MASTER_KEY is the current key; ENGAGE_MASTER_KEY_ID names it (default k1). ENGAGE_MASTER_KEYS_OLD lists
 * earlier keys as "id:hex,id:hex" so existing rows stay readable until they are re-wrapped.
 */
export function loadKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
  const current = env.ENGAGE_MASTER_KEY?.trim();
  if (!current) throw new CredentialKeyError('ENGAGE_MASTER_KEY is not set.');
  const currentId = (env.ENGAGE_MASTER_KEY_ID?.trim() || 'k1');
  if (!KEY_ID_RE.test(currentId)) throw new CredentialKeyError('ENGAGE_MASTER_KEY_ID must be 1-16 of a-z, 0-9, _ or -.');
  const keys = new Map<string, Buffer>([[currentId, parseKey(current, 'ENGAGE_MASTER_KEY')]]);
  for (const entry of (env.ENGAGE_MASTER_KEYS_OLD ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, hex] = entry.split(':');
    if (!id || !hex || !KEY_ID_RE.test(id)) throw new CredentialKeyError('ENGAGE_MASTER_KEYS_OLD must look like "id:hex,id:hex".');
    if (keys.has(id)) throw new CredentialKeyError(`Duplicate master key id "${id}".`);
    keys.set(id, parseKey(hex, `ENGAGE_MASTER_KEYS_OLD[${id}]`));
  }
  return { currentId, keys };
}

/** Production must have a valid key before engage mounts. Elsewhere a missing key just makes credential operations fail. */
export function assertMasterKeyForMount(env: NodeJS.ProcessEnv = process.env): void {
  const hasKey = Boolean(env.ENGAGE_MASTER_KEY?.trim());
  if (!hasKey && env.NODE_ENV !== 'production') return;
  loadKeyring(env);
}

function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 1 + IV_LEN + TAG_LEN || blob[0] !== VERSION) throw new CredentialDecryptError('Unrecognized credential format.');
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = blob.subarray(1 + IV_LEN + TAG_LEN);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new CredentialDecryptError('Credential could not be decrypted.');
  }
}

const secretAad = (b: Binding) => `engage:secret:v1:${b.organizationId}:${b.accountId}`;
const wrapAad = (b: Binding, keyId: string) => `engage:wrap:v1:${b.organizationId}:${b.accountId}:${keyId}`;

export function fingerprintOf(secrets: Record<string, string>): string {
  const canonical = JSON.stringify(Object.keys(secrets).sort().map((k) => [k, secrets[k]]));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/** Last four characters of the longest secret (the main credential), only when it is long enough that they reveal little. */
export function hintOf(secrets: Record<string, string>): string | null {
  const longest = Object.keys(secrets).sort().map((k) => secrets[k]!).reduce<string>((a, v) => (v.length > a.length ? v : a), '');
  return longest.length >= 16 ? longest.slice(-4) : null;
}

export function encryptSecrets(secrets: Record<string, string>, binding: Binding, keyring: Keyring = loadKeyring()): EncryptedSecrets {
  const masterKey = keyring.keys.get(keyring.currentId)!;
  const dataKey = randomBytes(32);
  return {
    secretCiphertext: seal(dataKey, Buffer.from(JSON.stringify(secrets)), secretAad(binding)),
    wrappedDataKey: seal(masterKey, dataKey, wrapAad(binding, keyring.currentId)),
    keyId: keyring.currentId,
    fingerprint: fingerprintOf(secrets),
    hint: hintOf(secrets),
  };
}

function unwrapDataKey(stored: StoredSecrets, binding: Binding, keyring: Keyring): Buffer {
  const masterKey = keyring.keys.get(stored.keyId);
  if (!masterKey) throw new CredentialDecryptError(`Master key "${stored.keyId}" is not available.`);
  return open(masterKey, stored.wrappedDataKey, wrapAad(binding, stored.keyId));
}

export function decryptSecrets(stored: StoredSecrets, binding: Binding, keyring: Keyring = loadKeyring()): Record<string, string> {
  const dataKey = unwrapDataKey(stored, binding, keyring);
  const plaintext = open(dataKey, stored.secretCiphertext, secretAad(binding));
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new CredentialDecryptError('Credential payload is corrupt.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== 'string')) {
    throw new CredentialDecryptError('Credential payload is corrupt.');
  }
  return parsed as Record<string, string>;
}

/** Re-wraps the data key under the current master key. The secret ciphertext is untouched. */
export function rewrapDataKey(stored: StoredSecrets, binding: Binding, keyring: Keyring = loadKeyring()): { wrappedDataKey: Buffer; keyId: string } {
  const dataKey = unwrapDataKey(stored, binding, keyring);
  const masterKey = keyring.keys.get(keyring.currentId)!;
  return { wrappedDataKey: seal(masterKey, dataKey, wrapAad(binding, keyring.currentId)), keyId: keyring.currentId };
}
