import { withEngageScheduler, withEngageTenant } from '../db.js';
import { loadAccountSecrets, messagingChannel } from '../credentials.js';
import { AdapterError, templateLister } from '../messaging/index.js';
import { describeError, logInfo, logWarn } from '../log.js';
import { applyRemoteTemplates, getTemplateCheckState, type TemplateCheckState } from './templateStatus.js';

/**
 * The template check (WP-40a, ADR-025): reads the tenant's WhatsApp templates from Meta and updates the mirror the send gate reads.
 * It runs hourly for every tenant with an active WhatsApp account that names its WhatsApp Business Account (config waba_id), and on
 * demand from Settings. A failed check changes no status: it records a code (wa_190, waba_missing, whatsapp_unreachable ...) and
 * the number of failures in a row, so the screen and the ops check can say so. Nothing from Meta's error text is kept.
 */

export interface TemplateCheckOutcome { ok: boolean; seen: number; changed: number; error: string | null; state: TemplateCheckState }

const ERROR_CODE_RE = /^[a-z0-9_]{1,64}$/;

export async function runTemplateCheck(orgId: string, now: () => Date = () => new Date()): Promise<TemplateCheckOutcome> {
  const started = now();
  const record = async (ok: boolean, error: string | null, seen: number) => {
    await withEngageTenant(orgId, (c) => c.query(
      `INSERT INTO engage.whatsapp_template_checks (organization_id, last_attempt_at, last_ok_at, last_error, consecutive_failures, templates_seen)
       VALUES ($1, $2::timestamptz, CASE WHEN $3::boolean THEN $2::timestamptz END, $4::text, CASE WHEN $3::boolean THEN 0 ELSE 1 END, $5::integer)
       ON CONFLICT (organization_id) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at,
         last_ok_at = COALESCE(EXCLUDED.last_ok_at, engage.whatsapp_template_checks.last_ok_at), last_error = EXCLUDED.last_error,
         consecutive_failures = CASE WHEN $3::boolean THEN 0 ELSE engage.whatsapp_template_checks.consecutive_failures + 1 END,
         templates_seen = CASE WHEN $3::boolean THEN EXCLUDED.templates_seen ELSE engage.whatsapp_template_checks.templates_seen END`,
      [orgId, started, ok, error, seen]));
  };
  const fail = async (code: string): Promise<TemplateCheckOutcome> => {
    const safe = ERROR_CODE_RE.test(code) ? code : 'check_failed';
    await record(false, safe, 0);
    return { ok: false, seen: 0, changed: 0, error: safe, state: await getTemplateCheckState(orgId) };
  };

  // The tenant's WhatsApp account that names a WhatsApp Business Account; the oldest one if there are several (v1: one per tenant).
  const account = (await withEngageTenant(orgId, (c) => c.query<{ id: string }>(
    `SELECT id FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'whatsapp' AND status = 'active'
      ORDER BY (config ? 'waba_id') DESC, created_at LIMIT 1`, [orgId]))).rows[0];
  if (!account) return fail('no_whatsapp_account');
  let list;
  try {
    const { account: meta, secrets } = await loadAccountSecrets(orgId, account.id);
    if (!('waba_id' in meta.config)) return fail('waba_missing');
    const lister = templateLister(meta.provider);
    if (!lister) return fail('provider_has_no_templates');
    list = await lister({ id: meta.id, channel: messagingChannel(meta), provider: meta.provider, mode: meta.mode, config: meta.config, secrets });
  } catch (err) {
    if (err instanceof AdapterError) { logWarn('whatsapp template check failed', { orgId, code: err.code }); return fail(err.code); }
    logWarn('whatsapp template check failed', { orgId, error: describeError(err) });
    return fail('check_failed');
  }
  const applied = await withEngageTenant(orgId, (c) => applyRemoteTemplates(c, orgId, list, started, true));
  await record(true, null, applied.seen);
  if (applied.changed) logInfo('whatsapp templates changed', { orgId, seen: applied.seen, changed: applied.changed });
  return { ok: true, seen: applied.seen, changed: applied.changed, error: null, state: await getTemplateCheckState(orgId) };
}

export interface DueChecksSummary { due: number; ok: number; failed: number }

/** Every tenant whose last check is older than `staleMinutes` (ids from the database, each check in the tenant's own transaction). */
export async function runDueTemplateChecks(opts: { limit?: number; staleMinutes?: number; onlyOrganizations?: string[] } = {}): Promise<DueChecksSummary> {
  const due = (await withEngageScheduler((c) => c.query<{ organization_id: string }>(
    `SELECT organization_id FROM engage.whatsapp_sync_work($1, make_interval(mins => $2), $3::uuid[])`,
    [opts.limit ?? 500, opts.staleMinutes ?? 55, opts.onlyOrganizations ?? null]))).rows.map((r) => r.organization_id);
  const s: DueChecksSummary = { due: due.length, ok: 0, failed: 0 };
  for (const orgId of due) {
    try {
      const r = await runTemplateCheck(orgId);
      if (r.ok) s.ok++; else s.failed++;
    } catch (err) {
      s.failed++;
      logWarn('whatsapp template check error', { orgId, error: describeError(err) });
    }
  }
  return s;
}
