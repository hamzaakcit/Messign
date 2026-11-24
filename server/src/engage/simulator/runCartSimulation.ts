import { withEngageTenant } from '../db.js';
import { MAX_BATCH, trackEvents } from '../ingest.js';
import { runTenantTick } from '../journeys/engine.js';
import { dispatchDue } from '../messaging/dispatch.js';
import type { CartObservation, CartSimPlan } from './cartSimulator.js';

/**
 * Runs a cart simulation plan against ONE tenant through the real pipeline (WP-18): customers are created with an
 * email identifier (and consent and a sandbox allow-list entry where the plan says so), events go through trackEvents
 * (dedup, partitions, trigger outbox), the tenant's journeys run on the simulation clock (runTenantTick, this tenant
 * only), and with `dispatch` the due messages go through the send gate and the tenant's adapter. Nothing here touches
 * another tenant. The cart-abandonment journey must already be active, and sending needs the tenant's own setup
 * (send_enabled, rate card, budget, one active email account), exactly as in production.
 *
 * The simulation clock starts in the past (`start`), so every event has already happened by the wall clock, as the
 * ingestion API requires; each tick's events are delivered before the tick runs.
 */

export interface CartRunOptions {
  /** Minute 0 of the simulation. Default: early enough that the last event is a few minutes in the past. */
  start?: Date;
  dispatch?: boolean;
  concurrency?: number;
  onTick?: (minute: number, total: number) => void;
}

export interface CartRunSummary {
  start: string; ticks: number; accepted: number; duplicates: number; rejected: number;
  triggers: number; enrolled: number; runs: number; dispatch: Record<string, number>;
}

export function defaultStart(plan: CartSimPlan, now = Date.now()): Date {
  return new Date(now - (plan.endMinute + 10) * 60_000);
}

async function seedCustomers(orgId: string, plan: CartSimPlan): Promise<void> {
  for (let i = 0; i < plan.customers.length; i += 1000) {
    const chunk = plan.customers.slice(i, i + 1000);
    await withEngageTenant(orgId, async (c) => {
      const p = await c.query<{ id: string; external_id: string }>(
        `INSERT INTO engage.profiles (organization_id, external_id, attributes)
         SELECT $1, t.ext, jsonb_build_object('first_name', t.fname) FROM unnest($2::text[], $3::text[]) AS t(ext, fname)
         RETURNING id, external_id`,
        [orgId, chunk.map((x) => x.externalId), chunk.map((x) => x.firstName)]);
      const idOf = new Map(p.rows.map((r) => [r.external_id, r.id]));
      const ids = chunk.map((x) => idOf.get(x.externalId)!);
      await c.query(
        `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized)
         SELECT $1, t.pid, 'email', t.email FROM unnest($2::uuid[], $3::text[]) AS t(pid, email)`,
        [orgId, ids, chunk.map((x) => x.email)]);
      const consenting = chunk.filter((x) => x.consent);
      await c.query(
        `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence)
         SELECT $1, pid, 'email', 'granted', 'import', '{"source":"cart_simulator"}'::jsonb FROM unnest($2::uuid[]) AS pid`,
        [orgId, consenting.map((x) => idOf.get(x.externalId)!)]);
      await c.query(
        `INSERT INTO engage.send_allowlist (organization_id, channel, value_normalized, label)
         SELECT $1, 'email', email, 'cart simulator' FROM unnest($2::text[]) AS email ON CONFLICT DO NOTHING`,
        [orgId, chunk.map((x) => x.email)]);
    });
  }
}

export async function runCartSimulation(orgId: string, plan: CartSimPlan, opts: CartRunOptions = {}): Promise<CartRunSummary> {
  const start = opts.start ?? defaultStart(plan);
  const at = (minute: number) => new Date(start.getTime() + minute * 60_000);
  await seedCustomers(orgId, plan);
  const s: CartRunSummary = { start: start.toISOString(), ticks: 0, accepted: 0, duplicates: 0, rejected: 0, triggers: 0, enrolled: 0, runs: 0, dispatch: {} };
  const tick = plan.options.tickMinutes;
  for (let minute = 0; minute <= plan.endMinute; minute += tick) {
    const due = plan.deliveriesByTick.get(minute) ?? [];
    for (let i = 0; i < due.length; i += MAX_BATCH) {
      const results = await trackEvents(orgId, due.slice(i, i + MAX_BATCH).map((d) => ({
        client_event_id: d.clientEventId, external_id: d.externalId, name: d.name, occurred_at: at(d.at).toISOString(), properties: d.properties,
      })));
      for (const r of results) {
        if (r.status === 'accepted') s.accepted++;
        else if (r.status === 'duplicate') s.duplicates++;
        else s.rejected++;
      }
    }
    const t = await runTenantTick(orgId, at(minute), { concurrency: opts.concurrency });
    s.triggers += t.triggers; s.enrolled += t.enrolled; s.runs += t.runs; s.ticks++;
    if (opts.dispatch) {
      for (;;) {
        const tally = await dispatchDue(orgId, 1000);
        let n = 0;
        for (const [k, v] of Object.entries(tally)) { s.dispatch[k] = (s.dispatch[k] ?? 0) + v; n += v; }
        // Held or deferred messages stay due; one pass is all a tick does for them.
        if (n < 1000 || (tally.held ?? 0) + (tally.deferred ?? 0) === n) break;
      }
    }
    opts.onTick?.(minute, plan.endMinute);
  }
  return s;
}

/** Per customer of the plan: enrollments, end, cohort, messages by status and their keys. */
export async function observeCartSimulation(orgId: string, plan: CartSimPlan): Promise<Map<string, CartObservation>> {
  const prefix = `sim-${plan.options.runId}-`;
  const out = new Map<string, CartObservation>();
  const get = (ext: string) => {
    let o = out.get(ext);
    if (!o) { o = { enrollments: 0, status: null, endReason: null, cohort: null, messages: {}, keys: [] }; out.set(ext, o); }
    return o;
  };
  await withEngageTenant(orgId, async (c) => {
    const e = await c.query<{ external_id: string; status: string; end_reason: string | null; cohort: string }>(
      `SELECT p.external_id, e.status, e.end_reason, e.cohort FROM engage.enrollments e
         JOIN engage.profiles p ON p.organization_id = e.organization_id AND p.id = e.profile_id
        WHERE e.organization_id = $1 AND p.external_id LIKE $2`, [orgId, `${prefix}%`]);
    for (const r of e.rows) { const o = get(r.external_id); o.enrollments++; o.status = r.status; o.endReason = r.end_reason; o.cohort = r.cohort; }
    const m = await c.query<{ external_id: string; status: string; idempotency_key: string }>(
      `SELECT p.external_id, m.status, m.idempotency_key FROM engage.messages m
         JOIN engage.profiles p ON p.organization_id = m.organization_id AND p.id = m.profile_id
        WHERE m.organization_id = $1 AND p.external_id LIKE $2`, [orgId, `${prefix}%`]);
    for (const r of m.rows) { const o = get(r.external_id); o.messages[r.status] = (o.messages[r.status] ?? 0) + 1; o.keys.push(r.idempotency_key); }
  });
  return out;
}
