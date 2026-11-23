import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import { readinessOn, type SendReadiness } from '../campaigns/campaigns.js';
import { currentSendMode } from '../messaging/gate.js';
import { dailyRecipientLimit } from './format.js';
import { getTemplateCheckState, type TemplateCheckState } from './templateStatus.js';

/**
 * Operating WhatsApp (WP-40c, ADR-025): what a tenant admin needs to see to set the channel up and keep it working, and what the
 * ops check watches. Everything is read from state the server already keeps (the account, the template mirror, the check, the
 * send decisions); nothing here calls Meta. Codes, counts, template names and ids only: no phone number, no message text.
 */

type Tx = PoolClient;

/** The webhook fields Meta must send for everything Messign reads: delivery statuses and replies, STOP from the app, template changes. */
export const WEBHOOK_FIELDS = ['messages', 'user_preferences', 'message_template_status_update'] as const;

/** Meta statuses that mean a template in use can no longer be sent (or never could). PENDING is not one: it is still in review. */
export const UNHEALTHY_STATUSES: ReadonlySet<string> = new Set(['PAUSED', 'DISABLED', 'REJECTED', 'DELETED', 'PENDING_DELETION', 'ARCHIVED', 'LIMIT_EXCEEDED']);

/** How far back a template counts as "in use" by messages (a campaign or a journey that sent it recently). */
export const IN_USE_DAYS = 7;

export interface TemplateInUse {
  metaName: string;
  language: string;
  /** The Messign template keys registered for it that an active journey uses (campaigns are journeys too). */
  journeyKeys: string[];
  /** WhatsApp messages made from it and allowed by the gate in the last IN_USE_DAYS days. */
  recentMessages: number;
  /** Meta's word, or null when the check has never seen it. */
  status: string | null;
  quality: string | null;
  rejectedReason: string | null;
}

/** A template in use that Meta stopped (paused, disabled, rejected, deleted) or rates RED: sends with it fail or soon will. */
export const isUnhealthy = (t: Pick<TemplateInUse, 'status' | 'quality'>): boolean =>
  (t.status !== null && UNHEALTHY_STATUSES.has(t.status)) || t.quality === 'RED';

/**
 * Every WhatsApp template an active journey sends (its pinned version's Meta name, else the newest version's) or that messages
 * were allowed with in the last week, with Meta's current status. Ordered by name.
 */
export async function templatesInUseOn(c: Tx, orgId: string, now: Date = new Date()): Promise<TemplateInUse[]> {
  const rows = (await c.query<{
    meta_name: string; language: string; journey_keys: string[] | null; recent: number; status: string | null; quality: string | null; rejected_reason: string | null;
  }>(
    `WITH steps AS (
        SELECT DISTINCT s->>'template' AS key,
               CASE WHEN jsonb_typeof(s->'template_version') = 'number' THEN (s->>'template_version')::int END AS version
          FROM engage.journey_versions v CROSS JOIN LATERAL jsonb_array_elements(COALESCE(v.definition->'steps', '[]'::jsonb)) s
         WHERE v.organization_id = $1 AND v.activated_at IS NOT NULL AND v.deactivated_at IS NULL
           AND s->>'type' = 'message' AND s->>'channel' = 'whatsapp'),
      journey_refs AS (
        SELECT DISTINCT ON (st.key, st.version) st.key, w.meta_name, w.language
          FROM steps st
          JOIN engage.templates t ON t.organization_id = $1 AND t.key = st.key AND t.channel = 'whatsapp'
          JOIN engage.whatsapp_template_versions w ON w.organization_id = $1 AND w.template_id = t.id AND (st.version IS NULL OR w.version = st.version)
         ORDER BY st.key, st.version, w.version DESC),
      message_refs AS (
        SELECT content->>'template' AS meta_name, content->>'language' AS language, count(*)::int AS n
          FROM engage.messages
         WHERE organization_id = $1 AND channel = 'whatsapp' AND gate_allowed_at > $2::timestamptz - make_interval(days => $3)
           AND content ? 'template' AND content ? 'language'
         GROUP BY 1, 2),
      used AS (
        SELECT meta_name, language FROM journey_refs UNION SELECT meta_name, language FROM message_refs)
     SELECT u.meta_name, u.language,
            (SELECT array_agg(DISTINCT j.key ORDER BY j.key) FROM journey_refs j WHERE j.meta_name = u.meta_name AND j.language = u.language) AS journey_keys,
            COALESCE((SELECT m.n FROM message_refs m WHERE m.meta_name = u.meta_name AND m.language = u.language), 0) AS recent,
            s.status, s.quality, s.rejected_reason
       FROM used u
       LEFT JOIN engage.whatsapp_template_status s ON s.organization_id = $1 AND s.meta_name = u.meta_name AND s.language = u.language
      ORDER BY u.meta_name, u.language`,
    [orgId, now, IN_USE_DAYS])).rows;
  return rows.map((r) => ({
    metaName: r.meta_name, language: r.language, journeyKeys: r.journey_keys ?? [], recentMessages: Number(r.recent),
    status: r.status, quality: r.quality, rejectedReason: r.rejected_reason,
  }));
}

export interface PacingState {
  /** The account's daily limit of new customers, and whether it is the default because the tenant has not set it. */
  limit: number;
  limitIsDefault: boolean;
  /** Distinct customers the gate allowed a message to through this account in the last 24 hours. */
  contacted24h: number;
  /** Messages waiting because of that limit (their latest gate decision is an `account_pacing` deferral). */
  waiting: number;
  /** Of those, the ones first held more than a day ago. */
  waitingOverADay: number;
}

export async function pacingStateOn(c: Tx, orgId: string, accountId: string, config: Record<string, unknown>, now: Date = new Date()): Promise<PacingState> {
  const limit = dailyRecipientLimit(config);
  const contacted = (await c.query<{ n: number }>(
    `SELECT count(DISTINCT profile_id)::int AS n FROM engage.messages
      WHERE organization_id = $1 AND channel_account_id = $2 AND gate_allowed_at > $3::timestamptz - interval '24 hours'
        AND NOT (status = 'blocked' OR (status = 'failed' AND provider_message_id IS NULL))`, [orgId, accountId, now])).rows[0]!.n;
  const held = (await c.query<{ waiting: number; over_day: number }>(
    `SELECT count(*)::int AS waiting, count(*) FILTER (WHERE x.first_held < $3::timestamptz - interval '24 hours')::int AS over_day
       FROM (
         SELECT (SELECT d.code FROM engage.send_decisions d WHERE d.organization_id = m.organization_id AND d.message_id = m.id ORDER BY d.id DESC LIMIT 1) AS last_code,
                (SELECT min(d.created_at) FROM engage.send_decisions d
                  WHERE d.organization_id = m.organization_id AND d.message_id = m.id AND d.decision = 'defer' AND d.code = 'account_pacing') AS first_held
           FROM engage.messages m
          WHERE m.organization_id = $1 AND m.channel_account_id = $2 AND m.status = 'queued') x
      WHERE x.last_code = 'account_pacing'`, [orgId, accountId, now])).rows[0]!;
  // The config value is used only when it is a valid whole number (dailyRecipientLimit); anything else means the default applies.
  const raw = config.daily_recipient_limit;
  const set = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) && Number(raw) === limit;
  return {
    limit, limitIsDefault: !set,
    contacted24h: Number(contacted), waiting: Number(held.waiting), waitingOverADay: Number(held.over_day),
  };
}

// --- the Settings card ------------------------------------------------------------------------------------------------------------

export type SetupStep = 'account' | 'waba_id' | 'webhook_url' | 'template_check' | 'templates_in_use' | 'sending_ready';

export interface WhatsappSetup {
  account: {
    id: string; label: string; provider: string; mode: string; phoneNumberId: string | null; wabaId: string | null;
  } | null;
  accountProblem: 'no_whatsapp_account' | 'whatsapp_account_ambiguous' | null;
  webhook: {
    /** What to paste into Meta's Callback URL; null until ENGAGE_PUBLIC_API_URL is set to an https URL on the server. */
    url: string | null;
    urlProblem: 'public_api_url_not_set' | 'public_api_url_invalid' | null;
    fields: readonly string[];
    /** The newest delivery report Meta sent for a message of this account, and the newest template change Meta announced. */
    lastDeliveryReportAt: string | null;
    lastTemplateUpdateAt: string | null;
  };
  check: TemplateCheckState;
  pacing: PacingState | null;
  templatesInUse: TemplateInUse[];
  /** What sending WhatsApp needs now in this server's mode (account, rate card, budget cap, readiness items in live mode). */
  readiness: SendReadiness;
  /** The checklist, in order; `done` is decided here so the screen and the runbook say the same thing. */
  steps: Array<{ step: SetupStep; done: boolean }>;
}

/** The public origin of this API, as the webhook URL needs it: an https origin, or the reason there is none. */
export function publicApiOrigin(env: NodeJS.ProcessEnv = process.env): { origin: string | null; problem: WhatsappSetup['webhook']['urlProblem'] } {
  const raw = env.ENGAGE_PUBLIC_API_URL?.trim();
  if (!raw) return { origin: null, problem: 'public_api_url_not_set' };
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? { origin: u.origin, problem: null } : { origin: null, problem: 'public_api_url_invalid' };
  } catch { return { origin: null, problem: 'public_api_url_invalid' }; }
}

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null);

export async function getWhatsappSetup(orgId: string, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): Promise<WhatsappSetup> {
  const { origin, problem } = publicApiOrigin(env);
  const check = await getTemplateCheckState(orgId);
  return withEngageTenant(orgId, async (c) => {
    const accounts = (await c.query<{ id: string; label: string; provider: string; mode: string; config: Record<string, string | number | boolean> }>(
      `SELECT id, label, provider, mode, config FROM engage.channel_accounts
        WHERE organization_id = $1 AND channel = 'whatsapp' AND status = 'active' ORDER BY created_at, id LIMIT 2`, [orgId])).rows;
    const a = accounts.length === 1 ? accounts[0]! : null;
    const accountProblem = accounts.length === 0 ? 'no_whatsapp_account' : accounts.length > 1 ? 'whatsapp_account_ambiguous' : null;
    const lastReport = a ? (await c.query<{ at: Date | null }>(
      `SELECT max(e.received_at) AS at FROM engage.message_events e
         JOIN engage.messages m ON m.organization_id = e.organization_id AND m.id = e.message_id
        WHERE e.organization_id = $1 AND m.channel_account_id = $2 AND e.source = 'provider'`, [orgId, a.id])).rows[0]?.at : null;
    const lastTemplateUpdate = (await c.query<{ at: Date | null }>(
      `SELECT max(recorded_at) AS at FROM engage.whatsapp_template_events WHERE organization_id = $1 AND source = 'webhook'`, [orgId])).rows[0]?.at;
    const pacing = a ? await pacingStateOn(c, orgId, a.id, a.config, now) : null;
    const templatesInUse = await templatesInUseOn(c, orgId, now);
    const readiness = await readinessOn(c, orgId, currentSendMode(), 'whatsapp');
    const wabaId = a ? text(a.config.waba_id) : null;
    const steps: WhatsappSetup['steps'] = [
      { step: 'account', done: a !== null },
      { step: 'waba_id', done: wabaId !== null },
      { step: 'webhook_url', done: a !== null && origin !== null },
      { step: 'template_check', done: check.lastOkAt !== null && check.consecutiveFailures === 0 },
      { step: 'templates_in_use', done: templatesInUse.every((t) => t.status === 'APPROVED' && t.quality !== 'RED') },
      // Sending enabled for the tenant is the Sending card's switch, not part of setting WhatsApp up.
      { step: 'sending_ready', done: readiness.problems.every((p) => p.code === 'tenant_send_disabled') },
    ];
    return {
      account: a ? { id: a.id, label: a.label, provider: a.provider, mode: a.mode, phoneNumberId: text(a.config.phone_number_id), wabaId } : null,
      accountProblem,
      webhook: {
        url: a && origin ? `${origin}/api/engage/webhooks/${a.id}` : null,
        urlProblem: problem,
        fields: WEBHOOK_FIELDS,
        lastDeliveryReportAt: iso(lastReport),
        lastTemplateUpdateAt: iso(lastTemplateUpdate),
      },
      check,
      pacing,
      templatesInUse,
      readiness,
      steps,
    };
  });
}
