import { describe, expect, it } from 'vitest';
import {
  CART_BEHAVIOURS, expectedCartOutcome, planCartSimulation, verifyCartSimulation, type CartObservation,
} from '../../engage/simulator/cartSimulator.js';
import { cartAbandonmentDefinition, CART_FIRST_DELAY_MINUTES as FIRST, CART_SECOND_DELAY_MINUTES as SECOND } from '../../engage/journeys/cartAbandonment.js';
import { validateDefinition } from '../../engage/journeys/definition.js';

const all = (plan: ReturnType<typeof planCartSimulation>) => [...plan.deliveriesByTick.values()].flat();

describe('cart-abandonment journey definition (WP-18)', () => {
  it('is a valid v1 definition: 1 h, reminder, 24 h, reminder, end; exits on order; re-entry after exit; 10% holdout', () => {
    const r = validateDefinition(cartAbandonmentDefinition());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.definition.steps.map((s) => s.type)).toEqual(['delay', 'message', 'delay', 'message', 'exit']);
    expect(r.definition).toMatchObject({ exit_when: [{ event: 'order_completed' }], re_entry: 'after_exit', holdout_percent: 10 });
    expect(r.templates.map((t) => t.key)).toEqual(['cart-reminder-1', 'cart-reminder-2']);
  });
});

describe('cart simulator (WP-18)', () => {
  it('is deterministic: the same seed gives the same plan, another seed a different one', () => {
    const a = planCartSimulation({ carts: 500, seed: 7 });
    const b = planCartSimulation({ carts: 500, seed: 7 });
    expect(JSON.stringify(all(a))).toBe(JSON.stringify(all(b)));
    expect(JSON.stringify(a.customers)).toBe(JSON.stringify(b.customers));
    expect(JSON.stringify(all(planCartSimulation({ carts: 500, seed: 8 })))).not.toBe(JSON.stringify(all(a)));
  });

  it('timelines match each behaviour, so the expectation follows from the scenario', () => {
    const plan = planCartSimulation({ carts: 5000, seed: 3 });
    const tick = plan.options.tickMinutes;
    const byCustomer = new Map<string, ReturnType<typeof all>>();
    for (const d of all(plan)) byCustomer.set(d.externalId, [...(byCustomer.get(d.externalId) ?? []), d]);
    for (const c of plan.customers) {
      const evs = byCustomer.get(c.externalId)!.filter((d) => !d.duplicate);
      const carts = evs.filter((d) => d.name === 'cart_updated');
      const orders = evs.filter((d) => d.name === 'order_completed');
      const C = c.cartTick;
      expect(C % tick).toBe(0);
      expect(carts).toHaveLength(c.cartEvents);
      for (const d of carts) { expect(d.arrivesAt).toBe(C); expect(d.at).toBeGreaterThan(C - tick); expect(d.at).toBeLessThanOrEqual(C); }
      const o = orders[0];
      switch (c.behaviour) {
        case 'abandons': expect(orders).toHaveLength(0); break;
        case 'buys_before_reminder': expect(o!.at).toBeGreaterThan(C); expect(o!.arrivesAt).toBeLessThanOrEqual(C + FIRST); break;
        case 'buys_between': expect(o!.at).toBeGreaterThan(C + FIRST); expect(o!.arrivesAt).toBeLessThanOrEqual(C + FIRST + SECOND); break;
        case 'buys_reported_late': expect(o!.at).toBeLessThanOrEqual(C + FIRST); expect(o!.arrivesAt).toBeGreaterThan(C + FIRST); expect(o!.arrivesAt).toBeLessThan(C + FIRST + SECOND); break;
      }
      for (const d of evs) expect(d.arrivesAt).toBeGreaterThanOrEqual(d.at);
    }
    expect(plan.endMinute).toBeGreaterThanOrEqual(Math.max(...plan.customers.map((c) => c.cartTick)) + FIRST + SECOND);
  });

  it('produces every behaviour, duplicates, customers without consent, and events the ingestion API accepts', () => {
    const plan = planCartSimulation({ carts: 10_000, seed: 11 });
    const share = (b: string) => plan.customers.filter((c) => c.behaviour === b).length / plan.customers.length;
    expect(share('abandons')).toBeCloseTo(0.4, 1);
    expect(share('buys_reported_late')).toBeCloseTo(0.1, 1);
    for (const b of CART_BEHAVIOURS) expect(share(b)).toBeGreaterThan(0);
    const deliveries = all(plan);
    const dup = deliveries.filter((d) => d.duplicate);
    expect(dup.length / (deliveries.length - dup.length)).toBeCloseTo(0.1, 1);
    for (const d of dup) expect(deliveries.some((x) => !x.duplicate && x.clientEventId === d.clientEventId && x.arrivesAt < d.arrivesAt)).toBe(true);
    expect(plan.customers.filter((c) => !c.consent).length / 10_000).toBeCloseTo(0.05, 1);
    for (const d of deliveries.slice(0, 2000)) {
      if (d.name === 'cart_updated') expect(d.properties).toMatchObject({ cart_id: expect.any(String), items: expect.any(Array) });
      else expect(d.properties).toMatchObject({ order_id: expect.any(String) });
      expect(d.externalId).toMatch(/^sim-s11-\d+$/);
    }
    expect(plan.customers.every((c) => /@example\.com$/.test(c.email))).toBe(true);
  });

  it('refuses bad options', () => {
    expect(() => planCartSimulation({ carts: 0 })).toThrow(/carts/);
    expect(() => planCartSimulation({ carts: 10, tickMinutes: 7 })).toThrow(/tickMinutes/);
    expect(() => planCartSimulation({ carts: 10, runId: 'Bad Id' })).toThrow(/runId/);
    expect(() => planCartSimulation({ carts: 10, mix: { abandons: 0, buys_before_reminder: 0, buys_between: 0, buys_reported_late: 0 } })).toThrow(/mix/);
  });

  it('verification accepts a correct run and names every kind of mismatch', () => {
    const plan = planCartSimulation({ carts: 200, seed: 5, noConsentRate: 0 });
    const ok = new Map<string, CartObservation>();
    for (const c of plan.customers) {
      const want = expectedCartOutcome(c.behaviour);
      const keys = Array.from({ length: want.reminders }, (_, i) => `journey:e-${c.index}:reminder-${i + 1}`);
      ok.set(c.externalId, { enrollments: 1, status: want.status, endReason: want.endReason, cohort: 'treatment', messages: want.reminders ? { sent: want.reminders } : {}, keys });
    }
    expect(verifyCartSimulation(plan, ok, { dispatched: true }).mismatches).toEqual([]);

    const abandoner = plan.customers.find((c) => c.behaviour === 'abandons')!;
    const buyer = plan.customers.find((c) => c.behaviour === 'buys_before_reminder')!;
    const bad = new Map(ok);
    bad.set(abandoner.externalId, { ...ok.get(abandoner.externalId)!, enrollments: 2 });
    bad.set(buyer.externalId, { ...ok.get(buyer.externalId)!, messages: { sent: 1 }, keys: ['k'] });
    const lateBuyer = plan.customers.find((c) => c.behaviour === 'buys_reported_late')!;
    bad.set(lateBuyer.externalId, { ...ok.get(lateBuyer.externalId)!, status: 'completed', endReason: 'exit_step' });
    const twice = plan.customers.find((c) => c.behaviour === 'abandons' && c !== abandoner)!;
    bad.set(twice.externalId, { ...ok.get(twice.externalId)!, keys: ['a', 'a'] });
    const v = verifyCartSimulation(plan, bad, { dispatched: true });
    expect(v.mismatches.join('\n')).toMatch(new RegExp(`${abandoner.externalId}.*1 enrollment`));
    expect(v.mismatches.join('\n')).toMatch(new RegExp(`${buyer.externalId}.*0 message`));
    expect(v.mismatches.join('\n')).toMatch(new RegExp(`${lateBuyer.externalId}.*exited/exit_event`));
    expect(v.mismatches.join('\n')).toMatch(new RegExp(`${twice.externalId}.*duplicate`));

    // A holdout enrollment must have no message; an unsent message counts when dispatching.
    const held = new Map(ok);
    held.set(abandoner.externalId, { ...ok.get(abandoner.externalId)!, cohort: 'holdout' });
    expect(verifyCartSimulation(plan, held, { dispatched: true }).mismatches.join()).toMatch(/expected 0 message/);
    const queued = new Map(ok);
    queued.set(abandoner.externalId, { ...ok.get(abandoner.externalId)!, messages: { queued: 2 } });
    expect(verifyCartSimulation(plan, queued, { dispatched: true }).mismatches.join()).toMatch(/expected 2 sent/);
    expect(verifyCartSimulation(plan, queued, { dispatched: false }).mismatches).toEqual([]);
  });
});
