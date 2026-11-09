import { describe, expect, it } from 'vitest';
import { evaluateCondition, matches } from '../../engage/journeys/conditions.js';
import type { Condition } from '../../engage/journeys/definition.js';

const ctx = {
  attributes: { tier: 'gold', age: 30, vip: true, tags: ['a', 'b'], city: 'İstanbul', nothing: null },
  event: { total: 150, cart_id: 'c1', placed: '2026-11-09T10:00:00Z' },
  payload: { order_id: 'o1' },
};
const ev = (c: Condition) => evaluateCondition(c, ctx);

describe('journey conditions (WP-16)', () => {
  it.each([
    [{ field: 'attributes.tier', op: 'eq', value: 'gold' }, true],
    [{ field: 'attributes.tier', op: 'eq', value: 'Gold' }, false],
    [{ field: 'attributes.age', op: 'eq', value: '30' }, false],
    [{ field: 'attributes.tier', op: 'neq', value: 'silver' }, true],
    [{ field: 'attributes.tier', op: 'neq', value: 'gold' }, false],
    [{ field: 'attributes.missing', op: 'neq', value: 'gold' }, false],
    [{ field: 'event.total', op: 'gt', value: 100 }, true],
    [{ field: 'event.total', op: 'gt', value: 150 }, false],
    [{ field: 'event.total', op: 'gte', value: 150 }, true],
    [{ field: 'event.total', op: 'lt', value: 150 }, false],
    [{ field: 'event.total', op: 'lte', value: 150 }, true],
    [{ field: 'event.total', op: 'gt', value: '100' }, false],
    [{ field: 'event.placed', op: 'gte', value: '2026-11-01' }, true],
    [{ field: 'event.placed', op: 'lt', value: '2026-11-01' }, false],
    [{ field: 'attributes.city', op: 'contains', value: 'stan' }, true],
    [{ field: 'attributes.tags', op: 'contains', value: 'b' }, true],
    [{ field: 'attributes.tags', op: 'contains', value: 'c' }, false],
    [{ field: 'attributes.age', op: 'contains', value: 3 }, false],
    [{ field: 'attributes.tier', op: 'in', value: ['silver', 'gold'] }, true],
    [{ field: 'attributes.tier', op: 'in', value: ['silver'] }, false],
    [{ field: 'attributes.tags', op: 'in', value: ['a'] }, false],
    [{ field: 'attributes.vip', op: 'exists' }, true],
    [{ field: 'attributes.nothing', op: 'exists' }, false],
    [{ field: 'attributes.nothing', op: 'not_exists' }, true],
    [{ field: 'attributes.missing', op: 'not_exists' }, true],
    [{ field: 'attributes.tier', op: 'not_exists' }, false],
    [{ field: 'payload.order_id', op: 'eq', value: 'o1' }, true],
    [{ field: 'event.order_id', op: 'eq', value: 'o1' }, false],
  ] as Array<[Condition, boolean]>)('%j -> %s', (c, want) => expect(ev(c)).toBe(want));

  it('a missing value never matches a comparison, and only not inverts that', () => {
    for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const) {
      expect(ev({ field: 'attributes.missing', op, value: 1 })).toBe(false);
    }
    expect(ev({ not: { field: 'attributes.missing', op: 'eq', value: 1 } })).toBe(true);
  });

  it('reads own properties only, never inherited ones', () => {
    expect(ev({ field: 'attributes.constructor', op: 'exists' })).toBe(false);
    expect(ev({ field: 'attributes.toString', op: 'exists' })).toBe(false);
    expect(ev({ field: 'attributes.__proto__', op: 'exists' })).toBe(false);
  });

  it('a scope that is not given (no event in a branch) reads as missing', () => {
    expect(evaluateCondition({ field: 'event.total', op: 'exists' }, { attributes: {} })).toBe(false);
    expect(evaluateCondition({ field: 'payload.order_id', op: 'exists' }, { attributes: {} })).toBe(false);
  });

  it('combines with all, any and not', () => {
    const yes = { field: 'attributes.tier', op: 'eq', value: 'gold' } as const;
    const no = { field: 'attributes.tier', op: 'eq', value: 'x' } as const;
    expect(ev({ all: [yes, yes] })).toBe(true);
    expect(ev({ all: [yes, no] })).toBe(false);
    expect(ev({ any: [no, yes] })).toBe(true);
    expect(ev({ any: [no, no] })).toBe(false);
    expect(ev({ not: no })).toBe(true);
    expect(ev({ not: { all: [yes, { any: [no, { not: no }] }] } })).toBe(false);
  });

  it('no condition matches everything', () => {
    expect(matches(undefined, { attributes: {} })).toBe(true);
    expect(matches({ field: 'attributes.x', op: 'exists' }, { attributes: {} })).toBe(false);
  });
});
