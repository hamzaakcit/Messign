import { createHmac, timingSafeEqual } from 'crypto';
import { withEngageTenant } from './db.js';
import { loadKeyring, type Keyring } from './crypto.js';
import { recordConsentOn, type ConsentChannel } from './profiles.js';

/**
 * Unsubscribe (WP-13). A recipient's opt-out must work from the email alone, without signing in, and must never wait
 * for anything: it writes the consent ledger, the consent state and the address suppression in one transaction (R-3),
 * so the send gate denies the very next message.
 *
 * The link carries a signed token naming the tenant, the profile and the channel. The signature is what makes the
 * tenant context trustworthy before any database access, so no pre-authentication policy is needed. The token has no
 * personal data (opaque ids only) and no expiry: an unsubscribe link has to keep working.
 */

const TOKEN_VERSION = 1;
const SUBKEY_LABEL = 'engage-unsubscribe-token-v1';
const MAX_TOKEN_LENGTH = 400;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSUBSCRIBE_CHANNELS: readonly ConsentChannel[] = ['email'];

export class UnsubscribeConfigError extends Error {}

export interface UnsubscribeContext {
  organizationId: string;
  profileId: string;
  channel: ConsentChannel;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const subkey = (master: Buffer) => createHmac('sha256', master).update(SUBKEY_LABEL).digest();
const mac = (master: Buffer, payload: string) => createHmac('sha256', subkey(master)).update(payload).digest();

export function createUnsubscribeToken(ctx: UnsubscribeContext, keyring: Keyring = loadKeyring()): string {
  if (!UUID_RE.test(ctx.organizationId) || !UUID_RE.test(ctx.profileId)) throw new UnsubscribeConfigError('organization and profile ids must be UUIDs');
  if (!UNSUBSCRIBE_CHANNELS.includes(ctx.channel)) throw new UnsubscribeConfigError(`unsubscribe links are not supported for channel ${ctx.channel}`);
  const payload = b64(JSON.stringify({ v: TOKEN_VERSION, k: keyring.currentId, o: ctx.organizationId, p: ctx.profileId, c: ctx.channel }));
  return `${payload}.${b64(mac(keyring.keys.get(keyring.currentId)!, payload))}`;
}

/** The context a token vouches for, or null for anything else (never throws on bad input). Keys from the keyring only. */
export function verifyUnsubscribeToken(token: unknown, keyring?: Keyring): UnsubscribeContext | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const ring = keyring ?? loadKeyring();
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims) || claims.v !== TOKEN_VERSION) return null;
    const master = typeof claims.k === 'string' ? ring.keys.get(claims.k) : undefined;
    if (!master) return null;
    const given = Buffer.from(parts[1], 'base64url');
    const expected = mac(master, parts[0]);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { o, p, c } = claims;
    if (typeof o !== 'string' || typeof p !== 'string' || !UUID_RE.test(o) || !UUID_RE.test(p)) return null;
    if (typeof c !== 'string' || !UNSUBSCRIBE_CHANNELS.includes(c as ConsentChannel)) return null;
    return { organizationId: o.toLowerCase(), profileId: p.toLowerCase(), channel: c as ConsentChannel };
  } catch {
    return null; // malformed base64/JSON, or no master key configured: the link simply does not verify
  }
}

export interface UnsubscribeLinks {
  /** The page a person lands on from the body link (asks for confirmation; a GET never unsubscribes). */
  pageUrl: string;
  /** The RFC 8058 one-click target for the List-Unsubscribe header (POST). */
  oneClickUrl: string;
}

function httpsOrigin(value: string | undefined, name: string): string {
  const raw = value?.trim();
  if (!raw) throw new UnsubscribeConfigError(`${name} is not set`);
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsubscribeConfigError(`${name} is not a valid URL`); }
  if (u.protocol !== 'https:') throw new UnsubscribeConfigError(`${name} must be an https URL`);
  return u.origin;
}

/**
 * The two links for one recipient. Fails closed when the public origins are not configured: a marketing email without
 * a working unsubscribe link must not be created. ENGAGE_PUBLIC_APP_URL is where the page is served (the web app),
 * ENGAGE_PUBLIC_API_URL where this API is reachable from the internet.
 */
export function buildUnsubscribeLinks(ctx: UnsubscribeContext, env: NodeJS.ProcessEnv = process.env, keyring?: Keyring): UnsubscribeLinks {
  const token = createUnsubscribeToken(ctx, keyring);
  return {
    pageUrl: `${httpsOrigin(env.ENGAGE_PUBLIC_APP_URL, 'ENGAGE_PUBLIC_APP_URL')}/u/${token}`,
    oneClickUrl: `${httpsOrigin(env.ENGAGE_PUBLIC_API_URL, 'ENGAGE_PUBLIC_API_URL')}/api/engage/unsubscribe/${token}`,
  };
}

export interface UnsubscribeInfo {
  channel: ConsentChannel;
  /** The address with most of it hidden, never the full address. */
  addressHint: string | null;
  /** Display name of the sender, from the tenant's active email account. */
  senderName: string | null;
  unsubscribed: boolean;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}${'*'.repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

/** The client withEngageTenant hands out (only engage/db.ts may import pg itself). */
type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

interface Snapshot { exists: boolean; address: string | null; revoked: boolean; suppressed: boolean }

async function snapshot(c: Tx, ctx: UnsubscribeContext): Promise<Snapshot> {
  const owned = await c.query(`SELECT 1 FROM engage.profiles WHERE organization_id = $1 AND id = $2`, [ctx.organizationId, ctx.profileId]);
  if (owned.rowCount === 0) return { exists: false, address: null, revoked: false, suppressed: false };
  const addr = await c.query<{ value_normalized: string }>(
    `SELECT value_normalized FROM engage.identifiers WHERE organization_id = $1 AND profile_id = $2 AND type = 'email' AND is_active`,
    [ctx.organizationId, ctx.profileId]);
  const address = addr.rows[0]?.value_normalized ?? null;
  const state = await c.query<{ status: string }>(
    `SELECT status FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND channel = $3 AND purpose = 'marketing'`,
    [ctx.organizationId, ctx.profileId, ctx.channel]);
  const suppressed = address
    ? (await c.query(`SELECT 1 FROM engage.suppressions WHERE organization_id = $1 AND channel = $2 AND value_normalized = $3`, [ctx.organizationId, ctx.channel, address])).rowCount! > 0
    : false;
  return { exists: true, address, revoked: state.rows[0]?.status === 'revoked', suppressed };
}

/** Read-only: what the page shows. Null when the profile does not exist in that tenant (same answer as a bad token). */
export async function getUnsubscribeInfo(ctx: UnsubscribeContext): Promise<UnsubscribeInfo | null> {
  return withEngageTenant(ctx.organizationId, async (c) => {
    const s = await snapshot(c, ctx);
    if (!s.exists) return null;
    const sender = await c.query<{ from_name: string | null }>(
      `SELECT config->>'from_name' AS from_name FROM engage.channel_accounts
        WHERE organization_id = $1 AND channel = $2 AND status = 'active' ORDER BY created_at LIMIT 1`,
      [ctx.organizationId, ctx.channel]);
    return {
      channel: ctx.channel,
      addressHint: s.address ? maskEmail(s.address) : null,
      senderName: sender.rows[0]?.from_name?.trim() || null,
      unsubscribed: s.revoked || s.suppressed,
    };
  });
}

export type UnsubscribeVia = 'one_click' | 'page';

export interface UnsubscribeResult {
  /** True when the person was already unsubscribed: nothing new was written. */
  alreadyUnsubscribed: boolean;
}

/**
 * The opt-out itself. Appends a revocation to the consent ledger (source unsubscribe_link), which updates the state and
 * suppresses the profile's active address in the same transaction. Repeats write nothing, so a mail client that
 * retries or a person who clicks twice leaves one ledger row. Null when the profile is not in that tenant.
 */
export async function applyUnsubscribe(ctx: UnsubscribeContext, via: UnsubscribeVia): Promise<UnsubscribeResult | null> {
  return withEngageTenant(ctx.organizationId, async (c) => {
    // Two requests for the same person (a mail client retrying, a double click) must not both write.
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`engage-unsubscribe:${ctx.organizationId}:${ctx.profileId}:${ctx.channel}`]);
    const s = await snapshot(c, ctx);
    if (!s.exists) return null;
    // Already done: the revocation is recorded and the address (when there is one) is suppressed.
    if (s.revoked && (s.suppressed || s.address === null)) return { alreadyUnsubscribed: true };
    await recordConsentOn(c, ctx.organizationId, ctx.profileId, {
      channel: ctx.channel, status: 'revoked', source: 'unsubscribe_link', evidence: { via, token_version: TOKEN_VERSION },
    });
    return { alreadyUnsubscribed: false };
  });
}
