import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import { loadAccountSecrets, type Channel } from '../credentials.js';
import { logError, logInfo } from '../log.js';
import { getAdapter, type AdapterAccount } from './adapter.js';
import { currentSendMode, evaluateGate } from './gate.js';
import { listDueMessageIds } from './messages.js';

export { currentSendMode, type SendMode } from './gate.js';

/**
 * Dispatch: the ONLY code that calls an adapter's send() (a test enforces it). Every attempt goes through the send gate
 * (gate.ts) first; engage.claim_message then refuses to start without the gate's ALLOW decision for this message.
 * SEND_MODE is read again for every message, so switching it off stops a running batch at the next message.
 */

export type DispatchOutcome =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'retry_scheduled'; attempt: number; code: string }
  | { outcome: 'failed'; code: string }
  | { outcome: 'blocked'; code: string }
  | { outcome: 'held'; code: string }
  | { outcome: 'deferred'; code: 'quiet_hours'; retryAt: Date }
  | { outcome: 'skipped'; code: 'not_due_or_claimed' };

export interface DispatchOptions {
  /** A claim older than this is taken over (crashed worker). Default 5 minutes. */
  leaseSeconds?: number;
  /** Retry delay is base * 2^(attempt-1) seconds, capped at one hour. Default 30. */
  backoffBaseSeconds?: number;
}

interface Loaded {
  id: string; profile_id: string; channel: Channel; purpose: 'marketing' | 'transactional'; channel_account_id: string; provider: string;
  idempotency_key: string; content: Record<string, unknown>; status: string; attempt_count: number; max_attempts: number;
}

async function recordEvent(orgId: string, messageId: string, type: string, errorCode: string | null, detail: Record<string, unknown> = {}, after?: (c: PoolClient) => Promise<void>): Promise<void> {
  await withEngageTenant(orgId, async (c) => {
    if (after) await after(c);
    await c.query(
      `INSERT INTO engage.message_events (organization_id, message_id, type, source, error_code, detail) VALUES ($1, $2, $3, 'system', $4, $5::jsonb)`,
      [orgId, messageId, type, errorCode, JSON.stringify(detail)]);
  });
}

export async function dispatchMessage(orgId: string, messageId: string, opts: DispatchOptions = {}): Promise<DispatchOutcome> {
  if (currentSendMode() === 'off') return { outcome: 'held', code: 'send_mode_off' }; // before anything is read or claimed

  const m = await withEngageTenant(orgId, async (c) => (await c.query<Loaded>(
    `SELECT id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, content, status, attempt_count, max_attempts
       FROM engage.messages WHERE organization_id = $1 AND id = $2`, [orgId, messageId])).rows[0]);
  if (!m) return { outcome: 'skipped', code: 'not_due_or_claimed' };
  if (m.status !== 'queued' && m.status !== 'sending') return { outcome: 'skipped', code: 'not_due_or_claimed' };

  const gate = await evaluateGate(orgId, m.id);
  if (gate.kind === 'hold') return { outcome: 'held', code: gate.code };
  if (gate.kind === 'defer') return { outcome: 'deferred', code: gate.code, retryAt: gate.retryAt };
  if (gate.kind === 'deny') {
    await recordEvent(orgId, m.id, 'blocked', gate.code, { decision_id: gate.decisionId });
    return { outcome: 'blocked', code: gate.code };
  }
  const to = gate.recipient;

  const claimed = await withEngageTenant(orgId, async (c) =>
    (await c.query<{ ok: boolean }>('SELECT engage.claim_message($1, $2, make_interval(secs => $3), $4) AS ok',
      [orgId, m.id, opts.leaseSeconds ?? 300, gate.decisionId])).rows[0]!.ok);
  if (!claimed) return { outcome: 'skipped', code: 'not_due_or_claimed' };
  const attempt = m.attempt_count + 1;

  const adapter = getAdapter(m.provider);
  if (!adapter) { await recordEvent(orgId, m.id, 'failed', 'no_adapter'); return { outcome: 'failed', code: 'no_adapter' }; }
  if (!adapter.capabilities().channels.includes(m.channel)) { await recordEvent(orgId, m.id, 'failed', 'channel_unsupported'); return { outcome: 'failed', code: 'channel_unsupported' }; }

  try {
    const { account, secrets } = await loadAccountSecrets(orgId, m.channel_account_id);
    const adapterAccount: AdapterAccount = { id: account.id, channel: account.channel, provider: account.provider, mode: account.mode, config: account.config, secrets };
    const res = await adapter.send({ idempotencyKey: m.idempotency_key, channel: m.channel, to, content: m.content }, adapterAccount);
    await recordEvent(orgId, m.id, 'sent', null, { attempt }, async (c) => {
      await c.query(`UPDATE engage.messages SET provider_message_id = $3 WHERE organization_id = $1 AND id = $2`, [orgId, m.id, res.providerMessageId]);
    });
    return { outcome: 'sent', providerMessageId: res.providerMessageId };
  } catch (err) {
    const n = adapter.normalizeError(err);
    if (n.kind === 'transient' && attempt < m.max_attempts) {
      const base = opts.backoffBaseSeconds ?? 30;
      const delay = Math.min(3600, base * 2 ** (attempt - 1));
      await recordEvent(orgId, m.id, 'retry_scheduled', n.code, { attempt, delay_seconds: delay }, async (c) => {
        await c.query(`UPDATE engage.messages SET next_attempt_at = now() + make_interval(secs => $3) WHERE organization_id = $1 AND id = $2`, [orgId, m.id, delay]);
      });
      return { outcome: 'retry_scheduled', attempt, code: n.code };
    }
    await recordEvent(orgId, m.id, 'failed', n.code, { attempt });
    logInfo('message failed', { messageId: m.id, code: n.code, attempt });
    return { outcome: 'failed', code: n.code };
  }
}

/** Dispatches every due message of one tenant once. Errors on one message never stop the rest. */
export async function dispatchDue(orgId: string, limit = 100, opts: DispatchOptions = {}): Promise<Record<string, number>> {
  const tally: Record<string, number> = {};
  for (const id of await listDueMessageIds(orgId, limit)) {
    let key: string;
    try { key = (await dispatchMessage(orgId, id, opts)).outcome; } catch (err) { key = 'error'; logError('dispatch error', { messageId: id, name: err instanceof Error ? err.name : 'error' }); }
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}
