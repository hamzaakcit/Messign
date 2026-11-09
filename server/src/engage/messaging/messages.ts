import { createHash } from 'crypto';
import { withEngageTenant } from '../db.js';
import type { Channel } from '../credentials.js';
import { getAdapter, type RawWebhook, type ProviderEvent } from './adapter.js';
import { loadAccountSecrets } from '../credentials.js';
import { normalizeEmail } from '../profiles.js';

/**
 * The messages ledger (WP-10). Creating a message only records the intent; nothing is sent until dispatch (dispatch.ts),
 * and dispatch is the only code that calls an adapter. Idempotency: a repeated key with the same request returns the
 * existing row, with a different request it is an error (a bug or an attack, never a silent overwrite).
 */

export const PURPOSES = ['marketing', 'transactional'] as const;
export type Purpose = (typeof PURPOSES)[number];
export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'blocked';
export type MessageEventType = 'sending' | 'retry_scheduled' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'blocked';

export class MessageInputError extends Error {}
export class MessageNotFoundError extends Error {}
export class IdempotencyConflictError extends Error {
  constructor() { super('This idempotency key was already used for a different message request'); this.name = 'IdempotencyConflictError'; }
}

export interface CreateMessageInput {
  profileId: string;
  channel: Channel;
  purpose: Purpose;
  channelAccountId: string;
  idempotencyKey: string;
  /** Already rendered (WP-14). Email: {subject, html?, text?}. SMS and WhatsApp: {text} or {template, variables}. */
  content: Record<string, unknown>;
  maxAttempts?: number;
  /** The gate refuses to send after this many seconds (default 24 h, 60 s to 30 days). A message held by a kill switch
   *  is therefore not sent days later. */
  ttlSeconds?: number;
  /**
   * What the idempotency check compares instead of `content` (WP-14). A templated message is rendered from profile
   * attributes that may change between a first attempt and a retry; the request (template, version, payload) is what
   * identifies it, not the rendered text.
   */
  requestBasis?: unknown;
}

export interface MessageRow {
  id: string;
  profileId: string;
  channel: Channel;
  purpose: Purpose;
  channelAccountId: string;
  provider: string;
  idempotencyKey: string;
  status: MessageStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  providerMessageId: string | null;
  errorCode: string | null;
  createdAt: string;
  statusChangedAt: string;
}

export interface MessageEventRow {
  id: string;
  type: MessageEventType;
  source: 'system' | 'provider' | 'simulator';
  providerEventId: string | null;
  occurredAt: string;
  errorCode: string | null;
  applied: boolean;
}

const COLS = `id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, status, attempt_count, max_attempts,
  next_attempt_at, provider_message_id, error_code, created_at, status_changed_at`;

function toRow(r: Record<string, unknown>): MessageRow {
  return {
    id: r.id as string, profileId: r.profile_id as string, channel: r.channel as Channel, purpose: r.purpose as Purpose,
    channelAccountId: r.channel_account_id as string, provider: r.provider as string, idempotencyKey: r.idempotency_key as string,
    status: r.status as MessageStatus, attemptCount: r.attempt_count as number, maxAttempts: r.max_attempts as number,
    nextAttemptAt: new Date(r.next_attempt_at as string).toISOString(), providerMessageId: (r.provider_message_id as string | null) ?? null,
    errorCode: (r.error_code as string | null) ?? null, createdAt: new Date(r.created_at as string).toISOString(),
    statusChangedAt: new Date(r.status_changed_at as string).toISOString(),
  };
}

/** JSON with sorted keys, so equal requests hash equally (also used by the journey trigger API). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function requestHash(input: CreateMessageInput): string {
  return createHash('sha256').update(canonical({
    profileId: input.profileId, channel: input.channel, purpose: input.purpose, channelAccountId: input.channelAccountId,
    content: input.requestBasis === undefined ? input.content : { requestBasis: input.requestBasis },
  })).digest('hex');
}

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

export async function createMessage(orgId: string, input: CreateMessageInput): Promise<{ message: MessageRow; created: boolean }> {
  return withEngageTenant(orgId, (c) => createMessageOn(c, orgId, input));
}

/** createMessage inside the caller's tenant transaction (WP-17: a journey step records its message atomically). */
export async function createMessageOn(c: Tx, orgId: string, input: CreateMessageInput): Promise<{ message: MessageRow; created: boolean }> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new MessageInputError('idempotencyKey must be 1 to 200 characters');
  if (!PURPOSES.includes(input.purpose)) throw new MessageInputError('purpose must be marketing or transactional');
  if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10)) {
    throw new MessageInputError('maxAttempts must be an integer from 1 to 10');
  }
  if (input.ttlSeconds !== undefined && (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 30 * 86400)) {
    throw new MessageInputError('ttlSeconds must be an integer from 60 to 2592000');
  }
  if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)) throw new MessageInputError('content must be an object');
  const hash = requestHash(input);
  {
    const acct = await c.query<{ provider: string }>(
      `SELECT provider FROM engage.channel_accounts WHERE organization_id = $1 AND id = $2 AND channel = $3 AND status = 'active'`,
      [orgId, input.channelAccountId, input.channel]);
    if (!acct.rows[0]) throw new MessageInputError('No active account of that channel for this tenant');
    const ins = await c.query(
      `INSERT INTO engage.messages (organization_id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, request_hash, content, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, COALESCE($10, 5), now() + make_interval(secs => COALESCE($11, 86400)))
       ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING ${COLS}`,
      [orgId, input.profileId, input.channel, input.purpose, input.channelAccountId, acct.rows[0].provider, input.idempotencyKey, hash,
        JSON.stringify(input.content), input.maxAttempts ?? null, input.ttlSeconds ?? null]);
    if (ins.rows[0]) return { message: toRow(ins.rows[0]), created: true };
    const existing = await c.query(
      `SELECT ${COLS}, request_hash FROM engage.messages WHERE organization_id = $1 AND idempotency_key = $2`, [orgId, input.idempotencyKey]);
    if (existing.rows[0].request_hash !== hash) throw new IdempotencyConflictError();
    return { message: toRow(existing.rows[0]), created: false };
  }
}

export async function getMessage(orgId: string, messageId: string): Promise<{ message: MessageRow; events: MessageEventRow[] }> {
  return withEngageTenant(orgId, async (c) => {
    const m = await c.query(`SELECT ${COLS} FROM engage.messages WHERE organization_id = $1 AND id = $2`, [orgId, messageId]);
    if (!m.rows[0]) throw new MessageNotFoundError('Message not found');
    const e = await c.query(
      `SELECT id, type, source, provider_event_id, occurred_at, error_code, applied FROM engage.message_events
        WHERE organization_id = $1 AND message_id = $2 ORDER BY id`, [orgId, messageId]);
    return {
      message: toRow(m.rows[0]),
      events: e.rows.map((r): MessageEventRow => ({
        id: String(r.id), type: r.type, source: r.source, providerEventId: r.provider_event_id ?? null,
        occurredAt: new Date(r.occurred_at).toISOString(), errorCode: r.error_code ?? null, applied: r.applied,
      })),
    };
  });
}

export async function listDueMessageIds(orgId: string, limit = 100): Promise<string[]> {
  const n = Math.min(Math.max(Math.trunc(limit), 1), 1000);
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT id FROM engage.messages WHERE organization_id = $1 AND status = 'queued' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT $2`,
      [orgId, n]);
    return r.rows.map((x) => x.id);
  });
}

export interface IngestResult {
  received: number;
  applied: number;
  duplicates: number;
  /** Reports for a message this tenant does not have (stale, forged id or another account). They are dropped. */
  unmatched: number;
  /** Stored but changed nothing (already further along, for example a late "sent" after "delivered"). */
  ignored: number;
  /** Addresses suppressed because of these reports (hard bounces, complaints). */
  suppressed: number;
}

/**
 * Stores provider reports. Safe to call with duplicates, with reports out of order, and with the same batch twice.
 * The status follows from the events (trigger), never from the order they arrive in, except for two conflicting final
 * reports, where the first to arrive wins.
 */
export async function ingestProviderEvents(orgId: string, provider: string, events: ProviderEvent[], source: 'provider' | 'simulator' = 'provider'): Promise<IngestResult> {
  const out: IngestResult = { received: events.length, applied: 0, duplicates: 0, unmatched: 0, ignored: 0, suppressed: 0 };
  if (events.length === 0) return out;
  await withEngageTenant(orgId, async (c) => {
    for (const [i, ev] of events.entries()) {
      const m = await c.query<{ id: string; channel: string }>(
        `SELECT id, channel FROM engage.messages WHERE organization_id = $1 AND provider = $2 AND provider_message_id = $3`,
        [orgId, provider, ev.providerMessageId]);
      if (!m.rows[0]) { out.unmatched++; continue; }
      // A repeat of a known provider event id is skipped by the unique index. The apply trigger runs first but cannot
      // change anything for a repeat, because a status only moves forward.
      const sp = `pe${i}`;
      await c.query(`SAVEPOINT ${sp}`);
      const ins = await c.query<{ applied: boolean }>(
        `INSERT INTO engage.message_events (organization_id, message_id, type, provider_event_id, source, occurred_at, error_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (organization_id, message_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
         RETURNING applied`,
        [orgId, m.rows[0].id, ev.type, ev.providerEventId, source, ev.occurredAt, ev.errorCode ?? null]);
      // A hard bounce or complaint suppresses the address at once for this tenant and channel (R-3), whatever the
      // message status ended up as. Repeats are harmless (unique per tenant, channel and address).
      for (const address of ins.rows[0] ? ev.suppress?.addresses ?? [] : []) {
        const value = normalizeEmail(address);
        if (!value || m.rows[0].channel !== 'email') continue;
        await c.query(
          `INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, $3)
           ON CONFLICT (organization_id, channel, value_normalized) DO NOTHING`, [orgId, value, ev.suppress!.reason]);
        out.suppressed++;
      }
      await c.query(`RELEASE SAVEPOINT ${sp}`);
      if (!ins.rows[0]) out.duplicates++;
      else if (ins.rows[0].applied) out.applied++;
      else out.ignored++;
    }
  });
  return out;
}

/** Verify and ingest one webhook delivery for an account. Throws WebhookSignatureError on a bad signature. */
export async function ingestWebhook(orgId: string, accountId: string, raw: RawWebhook): Promise<IngestResult> {
  const { account, secrets } = await loadAccountSecrets(orgId, accountId);
  const adapter = getAdapter(account.provider);
  if (!adapter) throw new MessageInputError('No adapter registered for this account provider');
  const events = await adapter.parseWebhook(raw, {
    id: account.id, channel: account.channel, provider: account.provider, mode: account.mode, config: account.config, secrets,
  });
  return ingestProviderEvents(orgId, account.provider, events);
}
