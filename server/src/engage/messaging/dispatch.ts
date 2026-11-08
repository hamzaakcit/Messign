import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import { loadAccountSecrets, type Channel } from '../credentials.js';
import { hasConsent, isSuppressed, type ConsentChannel } from '../profiles.js';
import { logError, logInfo } from '../log.js';
import { getAdapter, type AdapterAccount } from './adapter.js';
import { listDueMessageIds } from './messages.js';

/**
 * Dispatch (WP-10): the ONLY code that calls an adapter's send(). A lint test enforces that.
 *
 * INTERIM GATE. The full send gate (rules, `send_decisions`, readiness, quiet hours, caps, budget, kill switch) arrives
 * with WP-11 and replaces `interimGate` below. Until then the rules here are deliberately stricter than needed:
 *   - SEND_MODE off (the default, also when unset or invalid): nothing leaves the queue.
 *   - sandbox: only the mock adapter on a test-mode account.
 *   - live: refused outright, because the full gate does not exist yet.
 *   - marketing needs a current consent grant; any message to a suppressed address is blocked.
 */

export type DispatchOutcome =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'retry_scheduled'; attempt: number; code: string }
  | { outcome: 'failed'; code: string }
  | { outcome: 'blocked'; code: string }
  | { outcome: 'held'; code: string }
  | { outcome: 'skipped'; code: 'not_due_or_claimed' };

export interface DispatchOptions {
  /** A claim older than this is taken over (crashed worker). Default 5 minutes. */
  leaseSeconds?: number;
  /** Retry delay is base * 2^(attempt-1) seconds, capped at one hour. Default 30. */
  backoffBaseSeconds?: number;
}

const CHANNEL_IDENTIFIER: Record<Channel, 'email' | 'phone'> = { email: 'email', sms: 'phone', whatsapp: 'phone' };
const CONSENT_CHANNEL: Record<Channel, ConsentChannel> = { email: 'email', sms: 'sms', whatsapp: 'whatsapp' };

export type SendMode = 'off' | 'sandbox' | 'live';
export function currentSendMode(env: NodeJS.ProcessEnv = process.env): SendMode {
  const v = env.SEND_MODE;
  return v === 'sandbox' || v === 'live' ? v : 'off';
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

async function resolveRecipient(orgId: string, profileId: string, channel: Channel): Promise<string | null> {
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ value_normalized: string }>(
      `SELECT i.value_normalized FROM engage.identifiers i JOIN engage.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
        WHERE i.organization_id = $1 AND i.profile_id = $2 AND i.type = $3 AND i.is_active AND p.erased_at IS NULL`,
      [orgId, profileId, CHANNEL_IDENTIFIER[channel]]);
    return r.rows[0]?.value_normalized ?? null;
  });
}

/** Returns a denial code, or null to proceed. Replaced by the full gate in WP-11. */
async function interimGate(orgId: string, m: Loaded, to: string | null, accountMode: string | null): Promise<{ kind: 'hold' | 'block'; code: string } | null> {
  const mode = currentSendMode();
  if (mode === 'off') return { kind: 'hold', code: 'send_mode_off' };
  if (mode === 'live') return { kind: 'block', code: 'live_not_available' };
  if (m.provider !== 'mock' || accountMode !== 'test') return { kind: 'block', code: 'sandbox_mock_only' };
  if (!to) return { kind: 'block', code: 'no_recipient' };
  if (await isSuppressed(orgId, CONSENT_CHANNEL[m.channel], to)) return { kind: 'block', code: 'suppressed' };
  if (m.purpose === 'marketing' && !(await hasConsent(orgId, m.profile_id, CONSENT_CHANNEL[m.channel]))) return { kind: 'block', code: 'no_consent' };
  return null;
}

export async function dispatchMessage(orgId: string, messageId: string, opts: DispatchOptions = {}): Promise<DispatchOutcome> {
  if (currentSendMode() === 'off') return { outcome: 'held', code: 'send_mode_off' }; // before anything is read or claimed

  const m = await withEngageTenant(orgId, async (c) => (await c.query<Loaded>(
    `SELECT id, profile_id, channel, purpose, channel_account_id, provider, idempotency_key, content, status, attempt_count, max_attempts
       FROM engage.messages WHERE organization_id = $1 AND id = $2`, [orgId, messageId])).rows[0]);
  if (!m) return { outcome: 'skipped', code: 'not_due_or_claimed' };
  if (m.status !== 'queued' && m.status !== 'sending') return { outcome: 'skipped', code: 'not_due_or_claimed' };

  const to = await resolveRecipient(orgId, m.profile_id, m.channel);
  const acct = await withEngageTenant(orgId, async (c) => (await c.query<{ mode: string }>(
    `SELECT mode FROM engage.channel_accounts WHERE organization_id = $1 AND id = $2 AND status = 'active'`, [orgId, m.channel_account_id])).rows[0]);
  const denial = await interimGate(orgId, m, to, acct?.mode ?? null);
  if (denial?.kind === 'hold') return { outcome: 'held', code: denial.code };
  if (denial) {
    await recordEvent(orgId, m.id, 'blocked', denial.code);
    return { outcome: 'blocked', code: denial.code };
  }

  const claimed = await withEngageTenant(orgId, async (c) =>
    (await c.query<{ ok: boolean }>('SELECT engage.claim_message($1, $2, make_interval(secs => $3)) AS ok', [orgId, m.id, opts.leaseSeconds ?? 300])).rows[0]!.ok);
  if (!claimed) return { outcome: 'skipped', code: 'not_due_or_claimed' };
  const attempt = m.attempt_count + 1;

  const adapter = getAdapter(m.provider);
  if (!adapter) { await recordEvent(orgId, m.id, 'failed', 'no_adapter'); return { outcome: 'failed', code: 'no_adapter' }; }
  if (!adapter.capabilities().channels.includes(m.channel)) { await recordEvent(orgId, m.id, 'failed', 'channel_unsupported'); return { outcome: 'failed', code: 'channel_unsupported' }; }

  try {
    const { account, secrets } = await loadAccountSecrets(orgId, m.channel_account_id);
    const adapterAccount: AdapterAccount = { id: account.id, channel: account.channel, provider: account.provider, mode: account.mode, config: account.config, secrets };
    const res = await adapter.send({ idempotencyKey: m.idempotency_key, channel: m.channel, to: to!, content: m.content }, adapterAccount);
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
