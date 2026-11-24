import { withEngageScheduler, withEngageTenant } from '../db.js';
import { errorFields, logError, logInfo, logWarn } from '../log.js';
import { IysApiError, IysNetworkError, IysRateLimitError, MAX_CHANGES_PER_PAGE, type IysChange } from './client.js';
import { IysConfigError, iysDeps, loadConnection } from './connection.js';
import { IDENTIFIER_OF_TYPE, channelOfIysType, iysSourceOf, iysTypeOf, parseIysDate, reportDeadline, type IysStatus, type IysType, type LocalChannel, type LocalConsentSource } from './format.js';

/**
 * İYS sync (WP-26, ADR-022). Two directions, both by the tenant's own İYS credentials:
 *
 *   push  Opt-outs the tenant recorded (queued in engage.iys_outbox by the consent ledger's trigger, in the transaction
 *         that records them) are reported to İYS as RET, through the idempotent v2 method. Regulation: within three
 *         business days; İYS itself refuses a consent older than that (H467). A report ends as sent (registered, or İYS
 *         already had it), skipped (nothing to revoke in İYS, İYS holds a newer decision, or the opt-out was already too
 *         old to report when it was queued) or failed (rejected, or the deadline passed with the report still waiting).
 *   pull  What recipients did in İYS itself (their app, the 3338 number, the web page) is listed by İYS for the last 7 days
 *         and applied to the consent ledger as source `iys`, so the send gate sees a revocation before the next send. The
 *         marker İYS returns (`after`) is saved in the same transaction as the page it belongs to, so a page is applied
 *         once and a crash repeats at most the last page (each movement is recorded once by its transaction id).
 *
 * Logs carry tenant ids, counts, İYS's error codes and trace ids. Never an address, a name, a password or a token.
 */

const CLAIM_LEASE = `interval '5 minutes'`;
const PUSH_BATCH = 100;
const MAX_PAGES_PER_PULL = 20;
const MAX_PUSH_ATTEMPTS = 100;
const PER_RECIPIENT_DAILY_LIMIT_RETRY_MS = 6 * 3_600_000; // H453: two operations a day for one recipient

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];

// --- push ---------------------------------------------------------------------------------------------------------------

export interface PushSummary { claimed: number; sent: number; skipped: number; failed: number; retrying: number; error: string | null }
const emptyPush = (): PushSummary => ({ claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0, error: null });

interface OutboxRow { id: string; consent_id: string; channel: LocalChannel; consent_source: LocalConsentSource; recipient: string | null; consent_at: Date; created_at: Date; attempts: number }

type Verdict =
  | { status: 'sent' | 'skipped' | 'failed'; outcome: string; transactionId?: string; errorCode?: string }
  | { status: 'retry'; delayMs: number; errorCode: string; stop?: boolean };

/** What to do with an İYS error, from the documented error table (see ADR-022). */
export function verdictForError(err: unknown, attempts: number): Verdict {
  const backoff = Math.min(2 ** Math.max(attempts - 1, 0), 60) * 60_000; // 1, 2, 4 ... 60 minutes
  if (err instanceof IysRateLimitError) return { status: 'retry', delayMs: err.retryAfterMs, errorCode: err.code ?? 'rate_limited', stop: err.scope !== 'second' };
  if (err instanceof IysNetworkError) return { status: 'retry', delayMs: backoff, errorCode: 'unreachable' };
  if (err instanceof IysApiError) {
    switch (err.code) {
      case 'H174': return { status: 'sent', outcome: 'already_current', errorCode: err.code }; // İYS already holds RET
      case 'H175': return { status: 'skipped', outcome: 'not_in_iys', errorCode: err.code }; // nothing in İYS to revoke
      case 'H178': return { status: 'skipped', outcome: 'superseded', errorCode: err.code }; // İYS holds a newer decision
      case 'H467': return { status: 'failed', outcome: 'deadline_missed', errorCode: err.code };
      case 'H453': return { status: 'retry', delayMs: PER_RECIPIENT_DAILY_LIMIT_RETRY_MS, errorCode: err.code };
      default: break;
    }
    // Credentials or access: nothing else will work either, so the whole run waits.
    if (err.status === 401 || err.status === 403) return { status: 'retry', delayMs: 15 * 60_000, errorCode: err.code ?? `http_${err.status}`, stop: true };
    if (err.retryable) return { status: 'retry', delayMs: backoff, errorCode: err.code ?? `http_${err.status}` };
    return { status: 'failed', outcome: 'rejected', errorCode: err.code ?? `http_${err.status}` };
  }
  throw err;
}

async function release(orgId: string, ids: string[], nextAt: Date): Promise<void> {
  if (!ids.length) return;
  await withEngageTenant(orgId, (c) => c.query(
    `UPDATE engage.iys_outbox SET claimed_at = NULL, next_attempt_at = $3 WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending'`, [orgId, ids, nextAt]));
}

async function finish(orgId: string, row: OutboxRow, v: Extract<Verdict, { status: 'sent' | 'skipped' | 'failed' }>, now: Date): Promise<void> {
  await withEngageTenant(orgId, async (c) => {
    await c.query(
      `UPDATE engage.iys_outbox SET status = $3, outcome = $4, transaction_id = $5, last_error_code = $6, sent_at = CASE WHEN $3 = 'sent' THEN $7::timestamptz END,
              attempts = attempts + 1, claimed_at = NULL, recipient = NULL
        WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
      [orgId, row.id, v.status, v.outcome, v.transactionId ?? null, v.errorCode ?? null, now]);
    if (v.status === 'sent') await c.query(`UPDATE engage.consents SET iys_synced_at = $3 WHERE organization_id = $1 AND id = $2`, [orgId, row.consent_id, now]);
  });
}

/** Reports the tenant's queued opt-outs to İYS, oldest first. Returns counts; never throws for İYS or configuration problems. */
export async function pushPending(orgId: string, opts: { limit?: number } = {}): Promise<PushSummary> {
  const out = emptyPush();
  const now = iysDeps.now();
  let client;
  try { client = iysDeps.makeClient(await loadConnection(orgId)); } catch (err) {
    if (err instanceof IysConfigError) { out.error = err.code; return out; }
    throw err;
  }
  const rows = await withEngageTenant(orgId, async (c): Promise<OutboxRow[]> => {
    const r = await c.query<OutboxRow>(
      `SELECT id, consent_id, channel, consent_source, recipient, consent_at, created_at, attempts FROM engage.iys_outbox
        WHERE organization_id = $1 AND status = 'pending' AND next_attempt_at <= $2::timestamptz
          AND (claimed_at IS NULL OR claimed_at < $2::timestamptz - ${CLAIM_LEASE})
        ORDER BY consent_at LIMIT $3 FOR UPDATE SKIP LOCKED`, [orgId, now, opts.limit ?? PUSH_BATCH]);
    if (r.rows.length) await c.query(`UPDATE engage.iys_outbox SET claimed_at = $3 WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [orgId, r.rows.map((x) => x.id), now]);
    return r.rows;
  });
  out.claimed = rows.length;
  await withEngageTenant(orgId, (c) => c.query(
    `INSERT INTO engage.iys_sync_state (organization_id, last_push_attempt_at) VALUES ($1, $2)
     ON CONFLICT (organization_id) DO UPDATE SET last_push_attempt_at = EXCLUDED.last_push_attempt_at, updated_at = now()`, [orgId, now]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const deadline = reportDeadline(row.consent_at);
    const type = iysTypeOf(row.channel);
    const source = iysSourceOf(row.consent_source);
    let v: Verdict;
    if (now.getTime() > deadline.getTime()) {
      // İYS no longer accepts it. If the deadline had already passed when the opt-out was queued (an imported old opt-out),
      // there was never a chance to report it and that is not a breach; otherwise the report sat waiting too long.
      v = row.created_at.getTime() > deadline.getTime() ? { status: 'skipped', outcome: 'historical' } : { status: 'failed', outcome: 'deadline_missed' };
    } else if (!row.recipient || !type || !source) {
      v = { status: 'skipped', outcome: 'recipient_unavailable' };
    } else if (row.attempts >= MAX_PUSH_ATTEMPTS) {
      v = { status: 'failed', outcome: 'gave_up' };
    } else {
      try {
        const added = await client.addConsent({ recipient: row.recipient, type, status: 'RET', source, consentDate: new Date(Math.min(row.consent_at.getTime(), now.getTime())) });
        v = { status: 'sent', outcome: 'registered', transactionId: added.transactionId };
      } catch (err) {
        if (err instanceof IysApiError) logWarn('iys report refused', { organizationId: orgId, outboxId: row.id, status: err.status, code: err.code, traceId: err.traceId });
        v = verdictForError(err, row.attempts + 1);
      }
    }
    if (v.status === 'retry') {
      out.retrying++;
      out.error = v.errorCode;
      const at = new Date(now.getTime() + v.delayMs);
      await withEngageTenant(orgId, (c) => c.query(
        `UPDATE engage.iys_outbox SET attempts = attempts + 1, last_error_code = $3, claimed_at = NULL, next_attempt_at = $4 WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
        [orgId, row.id, v.errorCode, at]));
      if (v.stop) { await release(orgId, rows.slice(i + 1).map((x) => x.id), at); break; }
      continue;
    }
    await finish(orgId, row, v, now);
    out[v.status]++;
  }
  return out;
}

// --- pull ---------------------------------------------------------------------------------------------------------------

export interface PullSummary { pages: number; changes: number; applied: number; unmatched: number; ignored: number; duplicates: number; outcome: 'ok' | 'error' | 'rate_limited' | 'auth_error' | 'config_error'; errorCode: string | null }

const TYPES = new Set<string>(['ARAMA', 'MESAJ', 'EPOSTA']);
const STATUSES = new Set<string>(['ONAY', 'RET']);

function validChange(c: IysChange): c is IysChange & { type: IysType; status: IysStatus } {
  return !!c && typeof c.transactionId === 'string' && c.transactionId.length > 0 && c.transactionId.length <= 128 && TYPES.has(c.type) && STATUSES.has(c.status)
    && typeof c.source === 'string' && /^[A-Z0-9_]{1,40}$/.test(c.source) && typeof c.recipient === 'string' && c.recipient.length > 0 && c.recipient.length <= 300;
}

/** Applies one movement inside the page's transaction. Returns what happened to it. */
async function applyChange(c: Tx, orgId: string, change: IysChange, now: Date): Promise<'applied' | 'unmatched' | 'ignored' | 'duplicate'> {
  if (!validChange(change)) return 'ignored';
  const channel = channelOfIysType(change.type)!;
  // Only what a recipient did through İYS is ours to apply; what the provider sent (HS_…) came from us.
  const ours = change.source.startsWith('IYS_');
  const found = ours ? await c.query<{ profile_id: string }>(
    `SELECT i.profile_id FROM engage.identifiers i JOIN engage.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
      WHERE i.organization_id = $1 AND i.type = $2 AND i.value_normalized = $3 AND i.is_active AND p.erased_at IS NULL`,
    [orgId, IDENTIFIER_OF_TYPE[change.type], change.recipient.trim().toLowerCase()]) : null;
  const profileId = found?.rows[0]?.profile_id ?? null;
  const outcome = !ours ? 'ignored' : profileId ? 'applied' : 'unmatched';
  const consentAt = parseIysDate(change.consentDate) ?? parseIysDate(change.creationDate);
  const createdAt = parseIysDate(change.creationDate);
  const ins = await c.query(
    `INSERT INTO engage.iys_changes (organization_id, transaction_id, iys_type, iys_status, iys_source, consent_at, iys_created_at, profile_id, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (organization_id, transaction_id) DO NOTHING RETURNING id`,
    [orgId, change.transactionId, change.type, change.status, change.source, consentAt, createdAt, profileId, outcome]);
  if (!ins.rows[0]) return 'duplicate';
  if (outcome !== 'applied') return outcome;
  // The date the recipient acted orders the decision against ours (the consent state keeps the newest); never a date in the future.
  const at = new Date(Math.min((consentAt ?? now).getTime(), now.getTime()));
  await c.query(
    `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence, recorded_at, iys_synced_at)
     VALUES ($1, $2, $3, $4, 'iys', $5::jsonb, $6, $7)`,
    [orgId, profileId, channel, change.status === 'ONAY' ? 'granted' : 'revoked',
      JSON.stringify({ iys_transaction_id: change.transactionId, iys_source: change.source, iys_type: change.type }), at, now]);
  return 'applied';
}

async function recordPull(orgId: string, now: Date, p: { outcome: PullSummary['outcome']; errorCode: string | null; applied: number; after?: string | null }): Promise<void> {
  await withEngageTenant(orgId, (c) => c.query(
    `INSERT INTO engage.iys_sync_state (organization_id, changes_after, last_pull_at, last_pull_attempt_at, last_pull_outcome, last_pull_error_code, last_pull_applied)
     VALUES ($1, $2, CASE WHEN $3 = 'ok' THEN $4::timestamptz END, $4, $3, $5, $6)
     ON CONFLICT (organization_id) DO UPDATE SET
       changes_after = COALESCE($2, engage.iys_sync_state.changes_after),
       last_pull_at = CASE WHEN $3 = 'ok' THEN $4::timestamptz ELSE engage.iys_sync_state.last_pull_at END,
       last_pull_attempt_at = $4, last_pull_outcome = $3, last_pull_error_code = $5, last_pull_applied = $6, updated_at = now()`,
    [orgId, p.after ?? null, p.outcome, now, p.errorCode, p.applied]));
}

/** Pulls and applies recipients' consent changes from İYS, page by page. Returns counts; never throws for İYS or configuration problems. */
export async function pullChanges(orgId: string, opts: { maxPages?: number } = {}): Promise<PullSummary> {
  const out: PullSummary = { pages: 0, changes: 0, applied: 0, unmatched: 0, ignored: 0, duplicates: 0, outcome: 'ok', errorCode: null };
  const now = iysDeps.now();
  let client;
  try { client = iysDeps.makeClient(await loadConnection(orgId)); } catch (err) {
    if (err instanceof IysConfigError) { out.outcome = 'config_error'; out.errorCode = err.code; await recordPull(orgId, now, { outcome: out.outcome, errorCode: out.errorCode, applied: 0 }); return out; }
    throw err;
  }
  let after = (await withEngageTenant(orgId, (c) => c.query<{ changes_after: string | null }>(`SELECT changes_after FROM engage.iys_sync_state WHERE organization_id = $1`, [orgId]))).rows[0]?.changes_after ?? null;
  try {
    for (let page = 0; page < (opts.maxPages ?? MAX_PAGES_PER_PULL); page++) {
      const res = await client.listChanges({ after, limit: MAX_CHANGES_PER_PAGE, source: 'IYS' });
      if (res.list.length === 0) break;
      out.pages++;
      out.changes += res.list.length;
      // The page and the marker that follows it are one transaction.
      await withEngageTenant(orgId, async (c) => {
        for (const change of res.list) {
          const r = await applyChange(c, orgId, change, now);
          if (r === 'duplicate') out.duplicates++; else out[r === 'applied' ? 'applied' : r === 'unmatched' ? 'unmatched' : 'ignored']++;
        }
        await c.query(
          `INSERT INTO engage.iys_sync_state (organization_id, changes_after) VALUES ($1, $2)
           ON CONFLICT (organization_id) DO UPDATE SET changes_after = EXCLUDED.changes_after, updated_at = now()`, [orgId, res.after]);
      });
      after = res.after;
      if (res.list.length < MAX_CHANGES_PER_PAGE) break;
    }
  } catch (err) {
    if (err instanceof IysRateLimitError) { out.outcome = 'rate_limited'; out.errorCode = err.code ?? 'rate_limited'; }
    else if (err instanceof IysApiError) { out.outcome = err.status === 401 || err.status === 403 ? 'auth_error' : 'error'; out.errorCode = err.code ?? `http_${err.status}`; logWarn('iys pull refused', { organizationId: orgId, status: err.status, code: err.code, traceId: err.traceId }); }
    else if (err instanceof IysNetworkError) { out.outcome = 'error'; out.errorCode = 'unreachable'; }
    else throw err;
  }
  await recordPull(orgId, now, { outcome: out.outcome, errorCode: out.errorCode, applied: out.applied });
  return out;
}

// --- one run over every tenant ------------------------------------------------------------------------------------------

export interface SyncSummary { tenants: number; pushed: number; reported: number; applied: number; errors: number }

/** The scheduled run: every tenant with an İYS account, push first (the deadline is the tenant's), then pull. */
export async function runIysSync(opts: { onlyOrganizations?: string[] } = {}): Promise<SyncSummary> {
  const orgs = (await withEngageScheduler((c) => c.query<{ organization_id: string }>('SELECT organization_id FROM engage.iys_sync_work($1::uuid[])', [opts.onlyOrganizations ?? null]))).rows;
  const s: SyncSummary = { tenants: orgs.length, pushed: 0, reported: 0, applied: 0, errors: 0 };
  for (const o of orgs) {
    try {
      const push = await pushPending(o.organization_id);
      s.pushed += push.claimed; s.reported += push.sent;
      const pull = await pullChanges(o.organization_id);
      s.applied += pull.applied;
      if (push.error || pull.outcome !== 'ok') s.errors++;
      if (push.failed || pull.applied) logInfo('iys sync', { organizationId: o.organization_id, pushSent: push.sent, pushFailed: push.failed, pushRetrying: push.retrying, pullApplied: pull.applied, pullOutcome: pull.outcome });
    } catch (err) {
      s.errors++;
      logError('iys sync error', { organizationId: o.organization_id, ...errorFields(err) });
    }
  }
  return s;
}
