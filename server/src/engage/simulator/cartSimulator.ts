import { mulberry32, SYNTHETIC_FIRST_NAMES } from '../import/synthetic.js';
import { CART_FIRST_DELAY_MINUTES, CART_SECOND_DELAY_MINUTES } from '../journeys/cartAbandonment.js';

/**
 * Cart-abandonment event simulator (WP-18). Pure: a seed gives the same customers, the same event stream (with
 * duplicates and late deliveries) and the same expected outcome per customer. The expectation is derived from the
 * scenario alone, not from the engine, so a run can be checked against it (verifyCartSimulation).
 *
 * Time is in minutes from the start of the simulation; ticks run every `tickMinutes`. Each customer's cart events
 * happen in the tick window before their cart tick C and are delivered at C. Behaviours:
 *   abandons              no order                                  -> reminder 1 at C+60, reminder 2 at C+1500, completed
 *   buys_before_reminder  order in (C, C+60], delivered by C+60      -> no reminder, exited
 *   buys_between          order in (C+60, C+1500]                    -> reminder 1 only, exited
 *   buys_reported_late    order in (C, C+60] but delivered after C+60 -> reminder 1 (the order was not known yet), exited
 * Some customers update their cart again (more cart_updated events: still one enrollment), some events are delivered
 * twice (same client_event_id: stored once), and some customers have no email consent (the gate blocks their mail).
 */

export type CartBehaviour = 'abandons' | 'buys_before_reminder' | 'buys_between' | 'buys_reported_late';
export const CART_BEHAVIOURS: readonly CartBehaviour[] = ['abandons', 'buys_before_reminder', 'buys_between', 'buys_reported_late'];

export interface CartSimOptions {
  carts: number;
  seed?: number;
  /** Distinguishes runs on the same tenant (external ids, event ids). Default: derived from the seed. */
  runId?: string;
  tickMinutes?: number;
  /** Carts are spread over this many minutes from the start. */
  cartWindowMinutes?: number;
  duplicateRate?: number;
  noConsentRate?: number;
  mix?: Partial<Record<CartBehaviour, number>>;
}

export interface SimCustomer {
  index: number; externalId: string; email: string; firstName: string; consent: boolean;
  behaviour: CartBehaviour; cartTick: number; cartEvents: number;
}

export interface SimDelivery {
  clientEventId: string; externalId: string; name: 'cart_updated' | 'order_completed';
  /** When it happened and when it reaches the API, in minutes. */
  at: number; arrivesAt: number; properties: Record<string, unknown>; duplicate: boolean;
}

export interface CartSimPlan {
  options: Required<Omit<CartSimOptions, 'mix'>> & { mix: Record<CartBehaviour, number> };
  customers: SimCustomer[];
  /** Grouped by arrival tick; within a tick the order is shuffled. */
  deliveriesByTick: Map<number, SimDelivery[]>;
  endMinute: number;
}

export interface CartExpectation { reminders: 0 | 1 | 2; status: 'completed' | 'exited'; endReason: 'exit_step' | 'exit_event' }

const DEFAULT_MIX: Record<CartBehaviour, number> = { abandons: 0.4, buys_before_reminder: 0.25, buys_between: 0.25, buys_reported_late: 0.1 };
const FIRST = CART_FIRST_DELAY_MINUTES;
const SECOND_DUE = CART_FIRST_DELAY_MINUTES + CART_SECOND_DELAY_MINUTES;

export function expectedCartOutcome(b: CartBehaviour): CartExpectation {
  switch (b) {
    case 'abandons': return { reminders: 2, status: 'completed', endReason: 'exit_step' };
    case 'buys_before_reminder': return { reminders: 0, status: 'exited', endReason: 'exit_event' };
    case 'buys_between': case 'buys_reported_late': return { reminders: 1, status: 'exited', endReason: 'exit_event' };
  }
}

export function planCartSimulation(input: CartSimOptions): CartSimPlan {
  const seed = input.seed ?? 1;
  const tick = input.tickMinutes ?? 30;
  if (!Number.isInteger(input.carts) || input.carts < 1 || input.carts > 100_000) throw new Error('carts must be 1 to 100000');
  if (!Number.isInteger(tick) || tick < 1 || FIRST % tick !== 0 || CART_SECOND_DELAY_MINUTES % tick !== 0) {
    throw new Error(`tickMinutes must divide ${FIRST} and ${CART_SECOND_DELAY_MINUTES}`);
  }
  const window = input.cartWindowMinutes ?? 6 * 60;
  const mix = { ...DEFAULT_MIX, ...input.mix };
  const total = CART_BEHAVIOURS.reduce((s, b) => s + mix[b], 0);
  if (!(total > 0)) throw new Error('mix must have a positive weight');
  const options = {
    carts: input.carts, seed, runId: input.runId ?? `s${seed}`, tickMinutes: tick, cartWindowMinutes: window,
    duplicateRate: input.duplicateRate ?? 0.1, noConsentRate: input.noConsentRate ?? 0.05, mix,
  };
  if (!/^[a-z0-9]{1,20}$/.test(options.runId)) throw new Error('runId must be 1-20 of a-z, 0-9');

  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const grid = (m: number) => Math.ceil(m / tick) * tick;
  const ticksInWindow = Math.max(1, Math.floor(window / tick));
  const pickBehaviour = (): CartBehaviour => {
    let r = rnd() * total;
    for (const b of CART_BEHAVIOURS) { r -= mix[b]; if (r < 0) return b; }
    return 'abandons';
  };

  const customers: SimCustomer[] = [];
  const deliveries: SimDelivery[] = [];
  for (let i = 0; i < options.carts; i++) {
    const id = `sim-${options.runId}-${i}`;
    const c: SimCustomer = {
      index: i, externalId: id, email: `${id}@example.com`, firstName: SYNTHETIC_FIRST_NAMES[int(0, SYNTHETIC_FIRST_NAMES.length - 1)]!,
      consent: rnd() >= options.noConsentRate, behaviour: pickBehaviour(), cartTick: int(1, ticksInWindow) * tick, cartEvents: int(1, 3),
    };
    customers.push(c);
    const C = c.cartTick;
    const cartId = `cart-${options.runId}-${i}`;
    // Cart events happen in the tick window before C and reach the API at C.
    for (let k = 0; k < c.cartEvents; k++) {
      deliveries.push({
        clientEventId: `${id}-cart-${k}`, externalId: id, name: 'cart_updated', at: C - int(0, tick - 1), arrivesAt: C,
        properties: { cart_id: cartId, items: [{ sku: `book-${int(1, 40)}`, qty: int(1, 3) }] }, duplicate: false,
      });
    }
    let order: { at: number; arrivesAt: number } | null = null;
    if (c.behaviour === 'buys_before_reminder') { const at = C + int(1, FIRST); order = { at, arrivesAt: grid(at) }; }
    if (c.behaviour === 'buys_between') { const at = C + int(FIRST + 1, SECOND_DUE); order = { at, arrivesAt: grid(at) }; }
    if (c.behaviour === 'buys_reported_late') order = { at: C + int(1, FIRST), arrivesAt: C + FIRST + tick * int(1, 20) };
    if (order) {
      deliveries.push({ clientEventId: `${id}-order`, externalId: id, name: 'order_completed', ...order, properties: { order_id: `order-${options.runId}-${i}` }, duplicate: false });
    }
  }
  // Some deliveries are repeated later (a client retry): same client_event_id.
  for (const d of [...deliveries]) {
    if (rnd() < options.duplicateRate) deliveries.push({ ...d, arrivesAt: d.arrivesAt + tick * int(1, 4), duplicate: true });
  }

  const deliveriesByTick = new Map<number, SimDelivery[]>();
  for (const d of deliveries) {
    const list = deliveriesByTick.get(d.arrivesAt) ?? [];
    list.push(d);
    deliveriesByTick.set(d.arrivesAt, list);
  }
  for (const list of deliveriesByTick.values()) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j]!, list[i]!]; }
  }
  const lastArrival = Math.max(...deliveries.map((d) => d.arrivesAt));
  const endMinute = Math.max(ticksInWindow * tick + SECOND_DUE, lastArrival) + tick;
  return { options, customers, deliveriesByTick, endMinute };
}

/** What a run produced for one customer (collected from the database by the harness). */
export interface CartObservation {
  enrollments: number; status: string | null; endReason: string | null; cohort: string | null;
  /** Messages by status, and their idempotency keys. */
  messages: Record<string, number>; keys: string[];
}

export interface CartVerification {
  mismatches: string[];
  totals: { customers: number; enrolled: number; holdout: number; created: number; sent: number; blocked: number; exited: number; completed: number };
}

/**
 * Compares a run with the plan. Expected per customer: exactly one enrollment with the behaviour's end; messages
 * created = reminders, or none in holdout; with `dispatched`, all of them sent with consent and blocked without.
 */
export function verifyCartSimulation(plan: CartSimPlan, observed: Map<string, CartObservation>, o: { dispatched: boolean }): CartVerification {
  const mismatches: string[] = [];
  const totals = { customers: plan.customers.length, enrolled: 0, holdout: 0, created: 0, sent: 0, blocked: 0, exited: 0, completed: 0 };
  const note = (c: SimCustomer, what: string) => { if (mismatches.length < 50) mismatches.push(`${c.externalId} (${c.behaviour}${c.consent ? '' : ', no consent'}): ${what}`); };
  for (const c of plan.customers) {
    const want = expectedCartOutcome(c.behaviour);
    const got = observed.get(c.externalId);
    if (!got || got.enrollments !== 1) { note(c, `expected 1 enrollment, got ${got?.enrollments ?? 0}`); continue; }
    totals.enrolled++;
    if (got.status === 'exited') totals.exited++;
    if (got.status === 'completed') totals.completed++;
    if (got.status !== want.status || got.endReason !== want.endReason) note(c, `expected ${want.status}/${want.endReason}, got ${got.status}/${got.endReason}`);
    const holdout = got.cohort === 'holdout';
    if (holdout) totals.holdout++;
    const created = Object.values(got.messages).reduce((s, n) => s + n, 0);
    totals.created += created;
    totals.sent += (got.messages.sent ?? 0) + (got.messages.delivered ?? 0);
    totals.blocked += got.messages.blocked ?? 0;
    const wantCreated = holdout ? 0 : want.reminders;
    if (created !== wantCreated) note(c, `expected ${wantCreated} message(s), got ${created}`);
    if (new Set(got.keys).size !== got.keys.length) note(c, 'duplicate message idempotency keys');
    if (o.dispatched && created === wantCreated && wantCreated > 0) {
      const done = c.consent ? (got.messages.sent ?? 0) + (got.messages.delivered ?? 0) : got.messages.blocked ?? 0;
      if (done !== wantCreated) note(c, `expected ${wantCreated} ${c.consent ? 'sent' : 'blocked'}, got ${JSON.stringify(got.messages)}`);
    }
  }
  return { mismatches, totals };
}
