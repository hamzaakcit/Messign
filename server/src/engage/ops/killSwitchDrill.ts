import { performance } from 'perf_hooks';
import { withEngageTenant } from '../db.js';
import { getAccount } from '../credentials.js';
import { getSendReadiness } from '../campaigns/campaigns.js';
import { setSendEnabled } from '../settings/settings.js';
import { upsertProfile } from '../profiles.js';
import { addAllowlistEntry, removeAllowlistEntry, createMessage, dispatchMessage } from '../messaging/index.js';

/**
 * The kill-switch drill (WP-33, pilot gate 6, docs/runbooks/pilot-runbook.md): proves, with a timer, that the two switches stop
 * sending and that nothing is lost or sent twice when they are switched back.
 *
 *   global switch   SEND_MODE=off, flipped in THIS process between two messages of a running batch
 *   tenant switch   engage.tenant_settings.send_enabled=false, written through the Settings code (the same call as the Settings
 *                   screen), between two messages of the same batch
 *
 * What it uses: a dedicated drill tenant with exactly one active email account of provider `mock` in mode `test`. The mock adapter
 * hands nothing to any provider, and the drill forces SEND_MODE=sandbox in its own process, so no real message can leave. Its
 * 16 messages are addressed to `@example.com` profiles it creates, and are moved out of the server's own dispatcher's reach
 * (next_attempt_at one hour ahead, made due one message at a time as the drill sends it) so only the drill dispatches them.
 *
 * What it does not prove: the SEND_MODE it flips is this process's. The server's variable lives in Railway and changing it
 * redeploys the server; that time is measured by hand (the stopwatch mode of the script). The tenant switch is a database row the
 * server reads for every message, so this measurement is the same code and the same table the server uses.
 */

export const DRILL_MESSAGES = 16;
const BASELINE = 3;
const GLOBAL_HELD = 4;
const BETWEEN = 2;
const TENANT_HELD = 4;

export class DrillRefusedError extends Error {}
export class DrillFailedError extends Error {}

export interface DrillStep { name: string; ok: boolean; detail: string; ms?: number }
export interface DrillResult {
  ok: boolean;
  runId: string;
  steps: DrillStep[];
  timings: { globalHeldMs: number; tenantWriteMs: number; tenantHeldMs: number };
}
export interface DrillOptions {
  orgId: string;
  accountId: string;
  log?: (line: string) => void;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function runKillSwitchDrill(opts: DrillOptions): Promise<DrillResult> {
  const log = opts.log ?? (() => undefined);
  const { orgId } = opts;
  const runId = Date.now().toString(36);
  const steps: DrillStep[] = [];
  const step = (name: string, ok: boolean, detail: string, ms?: number): void => { steps.push({ name, ok, detail, ...(ms !== undefined ? { ms } : {}) }); log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}${ms !== undefined ? ` (${ms} ms)` : ''}`); };

  const savedMode = process.env.SEND_MODE;
  process.env.SEND_MODE = 'sandbox'; // never live from here
  let originalEnabled: boolean | null = null;
  const allowlistIds: string[] = [];
  try {
    // ---- preconditions: refuse anything that is not a drill tenant on a mock account
    const account = await getAccount(orgId, opts.accountId).catch(() => null);
    if (!account) throw new DrillRefusedError('The account was not found for this organization.');
    if (account.channel !== 'email' || account.provider !== 'mock' || account.mode !== 'test' || account.status !== 'active') {
      throw new DrillRefusedError(`The drill only runs on an active email account of provider "mock" in mode "test" (this one is ${account.channel}/${account.provider}/${account.mode}/${account.status}). It never touches a real provider.`);
    }
    originalEnabled = (await withEngageTenant(orgId, (c) => c.query<{ send_enabled: boolean }>(
      'SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1', [orgId]))).rows[0]?.send_enabled ?? null;
    if (originalEnabled === null) throw new DrillRefusedError('This organization has no tenant settings.');
    const readiness = await getSendReadiness(orgId, 'sandbox', 'email');
    const problems = readiness.problems.filter((p) => p.code !== 'tenant_send_disabled');
    if (problems.length) throw new DrillRefusedError(`The drill tenant is not ready to send in sandbox mode: ${problems.map((p) => `${p.code} (${p.message})`).join('; ')}`);
    if (!originalEnabled) await setSendEnabled(orgId, 'kill-switch-drill', true);
    step('preconditions', true, `mock email account, sandbox readiness clean, sending was ${originalEnabled ? 'on' : 'off (turned on for the drill, restored at the end)'}`);

    // ---- messages
    const ids: string[] = [];
    for (let i = 0; i < DRILL_MESSAGES; i++) {
      const email = `drill-${runId}-${i}@example.com`;
      const profile = await upsertProfile(orgId, { externalId: `drill-${runId}-${i}`, email });
      allowlistIds.push((await addAllowlistEntry(orgId, 'email', email, { label: 'kill-switch drill' })).id);
      const { message } = await createMessage(orgId, {
        profileId: profile.id, channel: 'email', purpose: 'transactional', channelAccountId: opts.accountId,
        idempotencyKey: `kill-switch-drill-${runId}-${i}`, ttlSeconds: 3600,
        content: { subject: 'Kill-switch drill', text: 'This is a drill message. Nothing is sent to a provider.', html: '<p>This is a drill message. Nothing is sent to a provider.</p>' },
      });
      ids.push(message.id);
    }
    // Out of reach of the server's own dispatcher: only this script dispatches them (the claim needs a due date, set per message below).
    await withEngageTenant(orgId, (c) => c.query(
      `UPDATE engage.messages SET next_attempt_at = now() + interval '1 hour' WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [orgId, ids]));

    const statusOf = async (list: string[]): Promise<Record<string, number>> => {
      const rows = (await withEngageTenant(orgId, (c) => c.query<{ status: string; n: number }>(
        `SELECT status, count(*)::int AS n FROM engage.messages WHERE organization_id = $1 AND id = ANY($2::uuid[]) GROUP BY 1`, [orgId, list]))).rows;
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    };
    const denyCode = async (id: string): Promise<string> => (await withEngageTenant(orgId, (c) => c.query<{ code: string }>(
      'SELECT code FROM engage.send_decisions WHERE message_id = $1 ORDER BY id DESC LIMIT 1', [id]))).rows[0]?.code ?? 'no decision';
    // A message is made due only for the moment the drill sends it (the claim needs a due date); held attempts need no date at all.
    const sentOne = async (id: string): Promise<boolean> => {
      await withEngageTenant(orgId, (c) => c.query('UPDATE engage.messages SET next_attempt_at = now() WHERE organization_id = $1 AND id = $2', [orgId, id]));
      const r = await dispatchMessage(orgId, id);
      if (r.outcome === 'sent') return true;
      throw new DrillFailedError(`A drill message was not sent while sending was on: ${r.outcome}${'code' in r ? ` (${r.code})` : ''}${r.outcome === 'blocked' ? `, gate: ${await denyCode(id)}` : ''}. Fix the drill tenant (the sender name against the account's From name is a common cause) and run again.`);
    };

    let next = 0;
    // ---- baseline
    for (let k = 0; k < BASELINE; k++) await sentOne(ids[next++]!);
    step('baseline', true, `${BASELINE} messages sent through the gate and the mock adapter`);

    // ---- global switch
    const globalIds = ids.slice(next, next + GLOBAL_HELD);
    process.env.SEND_MODE = 'off';
    const g0 = performance.now();
    const firstGlobal = await dispatchMessage(orgId, ids[next++]!);
    const globalHeldMs = round2(performance.now() - g0);
    const globalOk = firstGlobal.outcome === 'held' && 'code' in firstGlobal && firstGlobal.code === 'send_mode_off';
    let globalRest = true;
    for (let k = 1; k < GLOBAL_HELD; k++) {
      const r = await dispatchMessage(orgId, ids[next++]!);
      if (!(r.outcome === 'held' && 'code' in r && r.code === 'send_mode_off')) globalRest = false;
    }
    process.env.SEND_MODE = 'sandbox';
    const globalState = await statusOf(globalIds);
    const globalClean = globalState.queued === GLOBAL_HELD && Object.keys(globalState).length === 1;
    step('global switch: the next message after SEND_MODE=off is held', globalOk, globalOk ? 'held with send_mode_off' : `got ${JSON.stringify(firstGlobal)}`, globalHeldMs);
    step('global switch: the rest of the batch is held and nothing left the queue', globalRest && globalClean, `${GLOBAL_HELD} messages, states ${JSON.stringify(globalState)}`);

    // ---- tenant switch
    for (let k = 0; k < BETWEEN; k++) await sentOne(ids[next++]!);
    const tenantIds = ids.slice(next, next + TENANT_HELD);
    const t0 = performance.now();
    await setSendEnabled(orgId, 'kill-switch-drill', false);
    const tenantWriteMs = round2(performance.now() - t0);
    const firstTenant = await dispatchMessage(orgId, ids[next++]!);
    const tenantHeldMs = round2(performance.now() - t0);
    const tenantOk = firstTenant.outcome === 'held' && 'code' in firstTenant && firstTenant.code === 'tenant_send_disabled';
    let tenantRest = true;
    for (let k = 1; k < TENANT_HELD; k++) {
      const r = await dispatchMessage(orgId, ids[next++]!);
      if (!(r.outcome === 'held' && 'code' in r && r.code === 'tenant_send_disabled')) tenantRest = false;
    }
    const tenantState = await statusOf(tenantIds);
    const tenantClean = tenantState.queued === TENANT_HELD && Object.keys(tenantState).length === 1;
    step('tenant switch: the write itself', true, 'send_enabled=false stored through the Settings code', tenantWriteMs);
    step('tenant switch: the next message after the write is held', tenantOk, tenantOk ? 'held with tenant_send_disabled (time includes the write)' : `got ${JSON.stringify(firstTenant)}`, tenantHeldMs);
    step('tenant switch: the rest of the batch is held and nothing left the queue', tenantRest && tenantClean, `${TENANT_HELD} messages, states ${JSON.stringify(tenantState)}`);

    // ---- switching back: nothing lost, nothing twice
    await setSendEnabled(orgId, 'kill-switch-drill', true);
    for (; next < ids.length; next++) await sentOne(ids[next]!);
    for (const id of [...globalIds, ...tenantIds]) await sentOne(id);
    const sentEvents = (await withEngageTenant(orgId, (c) => c.query<{ message_id: string; n: number }>(
      `SELECT message_id, count(*)::int AS n FROM engage.message_events WHERE organization_id = $1 AND type = 'sent' AND message_id = ANY($2::uuid[]) GROUP BY 1`, [orgId, ids]))).rows;
    const allOnce = sentEvents.length === DRILL_MESSAGES && sentEvents.every((e) => e.n === 1);
    step('switching back: every held message went out, once each', allOnce, `${sentEvents.length} of ${DRILL_MESSAGES} messages have exactly one sent event`);

    const ok = steps.every((s) => s.ok);
    return { ok, runId, steps, timings: { globalHeldMs, tenantWriteMs, tenantHeldMs } };
  } catch (err) {
    if (err instanceof DrillFailedError) { step('stopped', false, err.message); return { ok: false, runId, steps, timings: { globalHeldMs: NaN, tenantWriteMs: NaN, tenantHeldMs: NaN } }; }
    throw err;
  } finally {
    process.env.SEND_MODE = savedMode;
    if (savedMode === undefined) delete process.env.SEND_MODE;
    if (originalEnabled === false) await setSendEnabled(orgId, 'kill-switch-drill', false).catch(() => undefined);
    for (const id of allowlistIds) await removeAllowlistEntry(orgId, id).catch(() => false);
  }
}

/** The text the operator pastes into the weekly progress and the drill record. */
export function formatDrill(r: DrillResult): string {
  const lines = [`Kill-switch drill ${r.runId}: ${r.ok ? 'PASS' : 'FAIL'}`];
  for (const s of r.steps) lines.push(`  ${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.ms !== undefined ? `  ${s.ms} ms` : ''}  ${s.detail}`);
  if (r.ok) {
    lines.push(`  global: next message held ${r.timings.globalHeldMs} ms after the flip; tenant: write ${r.timings.tenantWriteMs} ms, next message held ${r.timings.tenantHeldMs} ms after the request started`);
    lines.push('  Reminder: the SEND_MODE flipped here is this process\'s. Time the Railway variable by hand (--stopwatch global).');
  }
  return lines.join('\n');
}

/** Human duration for the stopwatch mode: 83412 ms -> "1 min 23.4 s". */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${(s - m * 60).toFixed(1)} s`;
}
