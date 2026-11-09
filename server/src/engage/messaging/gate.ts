import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import type { Channel } from '../credentials.js';
import { describeError, logError } from '../log.js';

/**
 * The send gate (WP-11, ADR-004). `evaluateGate` is the only writer of engage.send_decisions (a test enforces it),
 * and engage.claim_message refuses to start a send without a recent ALLOW decision, so no path reaches an adapter
 * without passing here. Every rule is evaluated and every failure is recorded; the first failure is the decision code.
 *
 * Rule order (ADR-004 item 4, plus expiry and the sandbox allow-list):
 *   SEND_MODE off -> hold (no row)           tenant send_enabled false -> hold (no row)
 *   expiry -> account active and mode-compatible -> readiness (live only) -> recipient -> allow-list (sandbox only)
 *   -> suppression -> consent (marketing) -> quiet hours (marketing, defers) -> frequency cap (marketing)
 *   -> rate card + monthly budget -> content checks
 * Fails closed: an exception records a `gate_error` denial, and if even that cannot be written, the message is held.
 */

export type SendMode = 'off' | 'sandbox' | 'live';
export function currentSendMode(env: NodeJS.ProcessEnv = process.env): SendMode {
  const v = env.SEND_MODE;
  return v === 'sandbox' || v === 'live' ? v : 'off';
}

/** Legal readiness items a tenant must have recorded before a live send on a channel (ADR-004 item 2). */
export const REQUIRED_READINESS: Record<Channel, readonly string[]> = {
  email: ['dpa_signed', 'email_domain_authenticated'],
  sms: ['dpa_signed', 'btk_sender_id', 'iys_brand_code'],
  whatsapp: ['dpa_signed', 'waba_verified'],
};

const CHANNEL_IDENTIFIER: Record<Channel, 'email' | 'phone'> = { email: 'email', sms: 'phone', whatsapp: 'phone' };

export interface GateReason {
  rule: string;
  code: string;
  [k: string]: string | number | string[];
}

export type GateResult =
  | { kind: 'hold'; code: 'send_mode_off' | 'tenant_send_disabled' | 'gate_unavailable' }
  | { kind: 'allow'; decisionId: string; recipient: string }
  | { kind: 'defer'; decisionId: string; code: 'quiet_hours'; retryAt: Date }
  | { kind: 'deny'; decisionId: string; code: string; reasons: GateReason[] };

export interface GateOptions {
  /** Evaluate as of this instant (tests). Defaults to the database clock. */
  now?: Date;
}

/** Content rules. Codes only. These are checks for an obvious omission, not a statement that a message is lawful. */
export function checkContent(channel: Channel, purpose: 'marketing' | 'transactional', content: Record<string, unknown>, accountConfig: Record<string, unknown>): string[] {
  const codes: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  // A templated message whose render failed (WP-14): denied with the render's own reason, never sent blank.
  const renderError = content.render_error as { code?: unknown } | undefined;
  if (renderError && typeof renderError === 'object') {
    const code = typeof renderError.code === 'string' && /^[a-z_]{1,40}$/.test(renderError.code) ? renderError.code : 'failed';
    return [`render_${code}`];
  }
  if (channel === 'email') {
    if (!str(content.subject)) codes.push('content_missing_subject');
    const body = `${str(content.html) ?? ''}\n${str(content.text) ?? ''}`;
    if (!str(content.html) && !str(content.text)) codes.push('content_missing_body');
    if (purpose === 'marketing') {
      const url = str(content.unsubscribe_url);
      if (!url || !/^https:\/\/\S+$/.test(url) || !body.includes(url)) codes.push('content_no_unsubscribe');
      // The RFC 8058 target that goes into the List-Unsubscribe header (WP-13): mailbox providers ask bulk senders for it.
      const oneClick = str(content.unsubscribe_one_click_url);
      if (!oneClick || !/^https:\/\/\S+$/.test(oneClick)) codes.push('content_no_one_click_unsubscribe');
    }
  } else if (channel === 'sms') {
    const text = str(content.text);
    if (!text) codes.push('content_missing_body');
    const sender = str(content.sender_id) ?? str(accountConfig.sender_id);
    if (!sender || !/^[A-Za-z0-9 .-]{3,11}$/.test(sender)) codes.push('sender_id_invalid');
    if (purpose === 'marketing' && text) {
      const folded = text.toLocaleLowerCase('tr').replace(/ı/g, 'i');
      if (!/(^|[^a-z0-9])(iptal|stop)([^a-z0-9]|$)/.test(folded)) codes.push('content_no_opt_out');
    }
  } else if (channel === 'whatsapp') {
    if (purpose === 'marketing' && !str(content.template)) codes.push('content_no_template');
    if (!str(content.template) && !str(content.text)) codes.push('content_missing_body');
  }
  return codes;
}

interface MessageRow {
  id: string; profile_id: string; channel: Channel; purpose: 'marketing' | 'transactional'; channel_account_id: string;
  content: Record<string, unknown>; status: string; expired: boolean; gate_allowed_at: Date | null;
  cost_estimate_minor: string | null; currency: string | null; rate_card_id: string | null;
}

async function recordDecision(c: PoolClient, orgId: string, messageId: string, d: {
  decision: 'allow' | 'deny' | 'defer'; code: string; reasons: GateReason[]; mode: 'sandbox' | 'live';
  cost?: string | null; currency?: string | null; rateCardId?: string | null; retryAt?: Date | null;
}): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO engage.send_decisions (organization_id, message_id, decision, code, reasons, send_mode, cost_estimate_minor, currency, rate_card_id, retry_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10) RETURNING id`,
    [orgId, messageId, d.decision, d.code, JSON.stringify(d.reasons), d.mode, d.cost ?? null, d.currency ?? null, d.rateCardId ?? null, d.retryAt ?? null]);
  return String(r.rows[0]!.id);
}

export async function evaluateGate(orgId: string, messageId: string, opts: GateOptions = {}): Promise<GateResult> {
  const mode = currentSendMode();
  if (mode === 'off') return { kind: 'hold', code: 'send_mode_off' };
  try {
    return await withEngageTenant(orgId, (c) => evaluateIn(c, orgId, messageId, mode, opts));
  } catch (err) {
    logError('send gate error, denying', { messageId, error: describeError(err) });
    try {
      const id = await withEngageTenant(orgId, (c) => recordDecision(c, orgId, messageId, {
        decision: 'deny', code: 'gate_error', reasons: [{ rule: 'gate', code: 'gate_error' }], mode }));
      return { kind: 'deny', decisionId: id, code: 'gate_error', reasons: [{ rule: 'gate', code: 'gate_error' }] };
    } catch {
      return { kind: 'hold', code: 'gate_unavailable' };
    }
  }
}

async function evaluateIn(c: PoolClient, orgId: string, messageId: string, mode: 'sandbox' | 'live', opts: GateOptions): Promise<GateResult> {
  const now = (opts.now ?? (await c.query<{ now: Date }>('SELECT now() AS now')).rows[0]!.now).toISOString();
  const settings = (await c.query<{ send_enabled: boolean; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null; frequency_cap_max: number; frequency_cap_window_hours: number }>(
    `SELECT send_enabled, timezone, quiet_hours_start::text, quiet_hours_end::text, frequency_cap_max, frequency_cap_window_hours
       FROM engage.tenant_settings WHERE organization_id = $1`, [orgId])).rows[0];
  if (!settings?.send_enabled) return { kind: 'hold', code: 'tenant_send_disabled' };

  const m = (await c.query<MessageRow>(
    `SELECT id, profile_id, channel, purpose, channel_account_id, content, status, expires_at <= $3::timestamptz AS expired,
            gate_allowed_at, cost_estimate_minor::text, currency, rate_card_id
       FROM engage.messages WHERE organization_id = $1 AND id = $2`, [orgId, messageId, now])).rows[0];
  if (!m) throw new Error('message not found');
  // Budget and frequency are counted against other messages: serialise decisions per tenant and channel.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 7041101))', [`${orgId}:${m.channel}`]);

  const reasons: GateReason[] = [];
  const marketing = m.purpose === 'marketing';

  if (m.expired) reasons.push({ rule: 'expiry', code: 'expired' });

  const acct = (await c.query<{ mode: string; status: string; config: Record<string, unknown> }>(
    `SELECT mode, status, config FROM engage.channel_accounts WHERE organization_id = $1 AND id = $2`, [orgId, m.channel_account_id])).rows[0];
  if (!acct || acct.status !== 'active') reasons.push({ rule: 'account', code: 'account_inactive' });
  else if (acct.mode !== (mode === 'sandbox' ? 'test' : 'live')) reasons.push({ rule: 'account', code: 'account_mode_mismatch' });

  if (mode === 'live') {
    const have = new Set((await c.query<{ item: string }>(
      `SELECT item FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = $2`, [orgId, m.channel])).rows.map((r) => r.item));
    const missing = REQUIRED_READINESS[m.channel].filter((i) => !have.has(i));
    if (missing.length) reasons.push({ rule: 'readiness', code: 'readiness_missing', missing });
  }

  const to = (await c.query<{ value_normalized: string }>(
    `SELECT i.value_normalized FROM engage.identifiers i JOIN engage.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
      WHERE i.organization_id = $1 AND i.profile_id = $2 AND i.type = $3 AND i.is_active AND p.erased_at IS NULL`,
    [orgId, m.profile_id, CHANNEL_IDENTIFIER[m.channel]])).rows[0]?.value_normalized ?? null;
  if (!to) {
    reasons.push({ rule: 'recipient', code: 'no_recipient' });
  } else {
    if (mode === 'sandbox') {
      const listed = await c.query(
        `SELECT 1 FROM engage.send_allowlist WHERE organization_id = $1 AND channel = $2 AND value_normalized = $3 AND removed_at IS NULL`, [orgId, m.channel, to]);
      if (!listed.rowCount) reasons.push({ rule: 'allowlist', code: 'not_allowlisted' });
    }
    // Address-level: applies to every purpose and to every profile that ever holds this address.
    const sup = await c.query(
      `SELECT 1 FROM engage.suppressions WHERE organization_id = $1 AND channel = $2 AND value_normalized = $3`, [orgId, m.channel, to]);
    if (sup.rowCount) reasons.push({ rule: 'suppression', code: 'suppressed' });
  }

  if (marketing) {
    const consent = await c.query<{ status: string }>(
      `SELECT status FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND channel = $3 AND purpose = 'marketing'`,
      [orgId, m.profile_id, m.channel]);
    if (consent.rows[0]?.status !== 'granted') reasons.push({ rule: 'consent', code: 'no_consent' });
  }

  let quietEnd: Date | null = null;
  if (marketing) {
    quietEnd = (await c.query<{ e: Date | null }>('SELECT engage.quiet_hours_end($1::timestamptz, $2, $3::time, $4::time) AS e',
      [now, settings.timezone, settings.quiet_hours_start, settings.quiet_hours_end])).rows[0]!.e;
    if (quietEnd) reasons.push({ rule: 'quiet_hours', code: 'quiet_hours' });

    const recent = (await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM engage.messages
        WHERE organization_id = $1 AND profile_id = $2 AND channel = $3 AND purpose = 'marketing' AND id <> $4
          AND gate_allowed_at > $5::timestamptz - make_interval(hours => $6)
          AND NOT (status = 'blocked' OR (status = 'failed' AND provider_message_id IS NULL))`,
      [orgId, m.profile_id, m.channel, m.id, now, settings.frequency_cap_window_hours])).rows[0]!.n;
    if (recent >= settings.frequency_cap_max) reasons.push({ rule: 'frequency', code: 'frequency_cap', recent, max: settings.frequency_cap_max });
  }

  // Cost: a message the gate already allowed keeps its reservation (a retry is not charged twice).
  const route = typeof acct?.config?.route === 'string' && /^[a-z0-9_]{1,32}$/.test(acct.config.route) ? acct.config.route : 'default';
  const card = m.gate_allowed_at
    ? (m.rate_card_id ? { id: m.rate_card_id, unit_cost_minor: m.cost_estimate_minor!, currency: m.currency! } : undefined)
    : (await c.query<{ id: string; unit_cost_minor: string; currency: string }>(
      `SELECT id, unit_cost_minor::text, currency FROM engage.rate_cards
        WHERE organization_id = $1 AND channel = $2 AND category = $3 AND route = $4 AND effective_from <= $5::timestamptz
        ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [orgId, m.channel, m.purpose, route, now])).rows[0];
  const cap = (await c.query<{ monthly_cap_minor: string; currency: string }>(
    `SELECT monthly_cap_minor::text, currency FROM engage.budget_caps WHERE organization_id = $1 AND channel = $2`, [orgId, m.channel])).rows[0];
  if (!card) reasons.push({ rule: 'budget', code: 'no_rate_card' });
  if (!cap) reasons.push({ rule: 'budget', code: 'no_budget_cap' });
  if (card && cap) {
    if (card.currency !== cap.currency) {
      reasons.push({ rule: 'budget', code: 'currency_mismatch' });
    } else {
      const spent = BigInt((await c.query<{ s: string }>(
        `SELECT COALESCE(sum(cost_estimate_minor), 0)::text AS s FROM engage.messages
          WHERE organization_id = $1 AND channel = $2 AND id <> $3 AND currency = $4
            AND gate_allowed_at >= (date_trunc('month', $5::timestamptz AT TIME ZONE $6) AT TIME ZONE $6)
            AND NOT (status = 'blocked' OR (status = 'failed' AND provider_message_id IS NULL))`,
        [orgId, m.channel, m.id, cap.currency, now, settings.timezone])).rows[0]!.s);
      const estimate = BigInt(card.unit_cost_minor);
      if (spent + estimate > BigInt(cap.monthly_cap_minor)) {
        reasons.push({ rule: 'budget', code: 'budget_exceeded', spent_minor: spent.toString(), estimate_minor: estimate.toString(), cap_minor: cap.monthly_cap_minor });
      }
    }
  }

  for (const code of checkContent(m.channel, m.purpose, m.content, acct?.config ?? {})) reasons.push({ rule: 'content', code });

  if (reasons.length === 0) {
    const decisionId = await recordDecision(c, orgId, m.id, { decision: 'allow', code: 'allowed', reasons, mode, cost: card!.unit_cost_minor, currency: card!.currency, rateCardId: card!.id });
    await c.query(
      `UPDATE engage.messages SET gate_allowed_at = $3::timestamptz, cost_estimate_minor = $4, currency = $5, rate_card_id = $6
        WHERE organization_id = $1 AND id = $2 AND gate_allowed_at IS NULL`, [orgId, m.id, now, card!.unit_cost_minor, card!.currency, card!.id]);
    return { kind: 'allow', decisionId, recipient: to! };
  }
  if (quietEnd && reasons.every((r) => r.rule === 'quiet_hours')) {
    const decisionId = await recordDecision(c, orgId, m.id, { decision: 'defer', code: 'quiet_hours', reasons, mode, retryAt: quietEnd });
    await c.query(`UPDATE engage.messages SET next_attempt_at = $3 WHERE organization_id = $1 AND id = $2`, [orgId, m.id, quietEnd]);
    return { kind: 'defer', decisionId, code: 'quiet_hours', retryAt: quietEnd };
  }
  const code = reasons[0]!.code;
  const decisionId = await recordDecision(c, orgId, m.id, { decision: 'deny', code, reasons, mode });
  return { kind: 'deny', decisionId, code, reasons };
}
