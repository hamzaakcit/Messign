import { describe, expect, it } from 'vitest';
import { defaultNext, successors, validateDefinition, type JourneyStep } from '../../engage/journeys/definition.js';

/** The flagship journey (D-01): cart abandonment, exits when an order arrives. */
const CART_ABANDONMENT = {
  trigger: { type: 'event', event: 'cart_updated', filter: { field: 'event.item_count', op: 'gt', value: 0 } },
  exit_when: [{ event: 'order_completed' }],
  steps: [
    { id: 'wait-1h', type: 'delay', minutes: 60 },
    { id: 'first', type: 'message', channel: 'email', template: 'cart-reminder', purpose: 'marketing' },
    { id: 'wait-order', type: 'wait_until', event: 'order_completed', timeout_minutes: 1440, on_timeout: 'next', next: 'vip' },
    { id: 'vip', type: 'branch', branches: [{ when: { field: 'attributes.tier', op: 'eq', value: 'gold' }, next: 'gold-offer' }], otherwise: 'done' },
    { id: 'gold-offer', type: 'message', channel: 'email', template: 'cart-gold', template_version: 2, purpose: 'marketing', next: 'done' },
    { id: 'done', type: 'exit' },
  ],
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const withSteps = (steps: unknown[]) => ({ ...clone(CART_ABANDONMENT), steps });
const errorsOf = (input: unknown) => { const r = validateDefinition(input); return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`); };

describe('journey definition v1', () => {
  it('accepts cart abandonment, fills defaults, and lists the templates it needs', () => {
    const r = validateDefinition(CART_ABANDONMENT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.definition.re_entry).toBe('never');
    expect(r.definition.holdout_percent).toBe(10);
    expect(r.templates).toEqual([{ key: 'cart-reminder', version: null, stepId: 'first' }, { key: 'cart-gold', version: 2, stepId: 'gold-offer' }]);
  });

  it('holdout_percent is a whole number from 0 to 50', () => {
    for (const ok of [0, 25, 50]) expect(validateDefinition({ ...clone(CART_ABANDONMENT), holdout_percent: ok }).ok).toBe(true);
    for (const bad of [-1, 51, 10.5, '10']) expect(errorsOf({ ...clone(CART_ABANDONMENT), holdout_percent: bad }).join()).toMatch(/holdout_percent/);
  });

  it('accepts the other two triggers', () => {
    expect(validateDefinition({ trigger: { type: 'api' }, steps: [{ id: 'm', type: 'message', channel: 'email', template: 't', purpose: 'transactional' }] }).ok).toBe(true);
    expect(validateDefinition({
      trigger: { type: 'date_attribute', attribute: 'anniversary', offset_days: -3, at_local_time: '10:00' },
      steps: [{ id: 'm', type: 'message', channel: 'email', template: 'occasion', purpose: 'marketing' }],
    }).ok).toBe(true);
  });

  it('follows steps in order, honours next, and ends after the last step', () => {
    const steps = CART_ABANDONMENT.steps as unknown as JourneyStep[];
    expect(defaultNext(steps, 0)).toBe('first');
    expect(defaultNext(steps, 2)).toBe('vip');
    expect(successors(steps, 3).sort()).toEqual(['done', 'gold-offer']);
    expect(defaultNext(steps, 5)).toBeNull();
    expect(defaultNext([{ id: 'only', type: 'delay', minutes: 5 }] as JourneyStep[], 0)).toBeNull();
  });

  describe('rejects', () => {
    it.each<[string, unknown, RegExp]>([
      ['no steps', withSteps([]), /steps/],
      ['unknown keys (typos are not silently ignored)', { ...clone(CART_ABANDONMENT), exitWhen: [] }, /Unrecognized key/],
      ['unknown step type (webhooks are not in v1)', withSteps([{ id: 'w', type: 'webhook', url: 'https://x.example.com' }]), /type/],
      ['a channel other than email', withSteps([{ id: 'm', type: 'message', channel: 'sms', template: 't', purpose: 'marketing' }]), /channel/],
      ['a message without a purpose', withSteps([{ id: 'm', type: 'message', channel: 'email', template: 't' }]), /purpose/],
      ['a bad event name', { ...clone(CART_ABANDONMENT), trigger: { type: 'event', event: 'Cart Updated' } }, /trigger\.event/],
      ['a zero delay', withSteps([{ id: 'd', type: 'delay', minutes: 0 }]), /minutes/],
      ['a delay over a year', withSteps([{ id: 'd', type: 'delay', minutes: 600000 }]), /minutes/],
      ['a fractional delay', withSteps([{ id: 'd', type: 'delay', minutes: 1.5 }]), /minutes/],
      ['a wait without on_timeout', withSteps([{ id: 'w', type: 'wait_until', event: 'order_completed', timeout_minutes: 10 }]), /on_timeout/],
      ['next on a branch', withSteps([{ id: 'b', type: 'branch', branches: [{ when: { field: 'attributes.a', op: 'exists' }, next: 'e' }], otherwise: 'e', next: 'e' }, { id: 'e', type: 'exit' }]), /Unrecognized key/],
      ['next on an exit', withSteps([{ id: 'e', type: 'exit', next: 'x' }]), /Unrecognized key/],
      ['a bad time of day', { trigger: { type: 'date_attribute', attribute: 'a', offset_days: 0, at_local_time: '24:00' }, steps: [{ id: 'e', type: 'exit' }] }, /at_local_time/],
      ['an unknown condition operator', withSteps([{ id: 'b', type: 'branch', branches: [{ when: { field: 'attributes.a', op: 'like', value: 'x' } }], otherwise: 'e' }, { id: 'e', type: 'exit' }]), /branches/],
      ['a condition on an unknown namespace', withSteps([{ id: 'b', type: 'branch', branches: [{ when: { field: 'profile.a', op: 'exists' }, next: 'e' }], otherwise: 'e' }, { id: 'e', type: 'exit' }]), /field/],
      ['more than 50 steps', withSteps(Array.from({ length: 51 }, (_, i) => ({ id: `d${i}`, type: 'delay', minutes: 1 }))), /steps/],
    ])('%s', (_n, input, expected) => {
      expect(errorsOf(input).join('\n')).toMatch(expected);
    });

    it('a target that does not exist', () => {
      expect(errorsOf(withSteps([{ id: 'a', type: 'delay', minutes: 1, next: 'nowhere' }]))).toEqual(['steps[0]: goes to unknown step "nowhere"']);
    });
    it('duplicate step ids', () => {
      expect(errorsOf(withSteps([{ id: 'a', type: 'delay', minutes: 1 }, { id: 'a', type: 'exit' }]))).toContain('steps[1].id: duplicate step id "a"');
    });
    it('a step that goes to itself', () => {
      expect(errorsOf(withSteps([{ id: 'a', type: 'delay', minutes: 1, next: 'a' }]))).toEqual(['steps[0]: a step cannot go to itself']);
    });
    it('a loop (a journey that could message someone forever)', () => {
      expect(errorsOf(withSteps([
        { id: 'a', type: 'delay', minutes: 60 },
        { id: 'm', type: 'message', channel: 'email', template: 't', purpose: 'marketing', next: 'a' },
      ]))).toEqual(['steps: the steps loop back to "a"; journeys must not loop']);
    });
    it('a loop through a branch', () => {
      expect(errorsOf(withSteps([
        { id: 'a', type: 'delay', minutes: 60 },
        { id: 'b', type: 'branch', branches: [{ when: { field: 'attributes.x', op: 'exists' }, next: 'a' }], otherwise: 'e' },
        { id: 'e', type: 'exit' },
      ]))).toEqual(['steps: the steps loop back to "a"; journeys must not loop']);
    });
    it('a step that can never be reached', () => {
      expect(errorsOf(withSteps([{ id: 'e', type: 'exit' }, { id: 'm', type: 'message', channel: 'email', template: 't', purpose: 'marketing' }])))
        .toEqual(['steps[1]: step "m" can never be reached']);
    });
    it('event fields in a branch (there is no event there), but allows them in event filters', () => {
      expect(errorsOf(withSteps([
        { id: 'b', type: 'branch', branches: [{ when: { field: 'event.total', op: 'gt', value: 1 }, next: 'e' }], otherwise: 'e' }, { id: 'e', type: 'exit' },
      ]))).toEqual(['steps[0].branches[0].when.field: event.* fields can only be used in event filters']);
      expect(validateDefinition({ ...clone(CART_ABANDONMENT), exit_when: [{ event: 'order_completed', filter: { field: 'event.total', op: 'gt', value: 0 } }] }).ok).toBe(true);
    });
    it('conditions nested deeper than four levels', () => {
      const deep = { not: { not: { not: { not: { not: { field: 'attributes.a', op: 'exists' } } } } } };
      expect(errorsOf(withSteps([{ id: 'b', type: 'branch', branches: [{ when: deep, next: 'e' }], otherwise: 'e' }, { id: 'e', type: 'exit' }])).join()).toMatch(/at most 4 levels/);
      const ok = { not: { not: { not: { field: 'attributes.a', op: 'exists' } } } };
      expect(validateDefinition(withSteps([{ id: 'b', type: 'branch', branches: [{ when: ok, next: 'e' }], otherwise: 'e' }, { id: 'e', type: 'exit' }])).ok).toBe(true);
    });
    it('anything that is not an object, without throwing', () => {
      for (const junk of [null, undefined, 'x', 42, [], { steps: 'x' }]) expect(validateDefinition(junk).ok).toBe(false);
    });
  });
});
