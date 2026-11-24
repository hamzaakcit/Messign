import { describe, expect, it } from 'vitest';
import { validateSegmentDefinition } from '../../engage/segments/definition.js';
import { buildSegmentQuery, compileCondition } from '../../engage/segments/compile.js';
import { validateDefinition } from '../../engage/journeys/definition.js';

const win = { where: { all: [
  { field: 'orders.count', op: 'gte', value: 1 },
  { field: 'orders.days_since_last', op: 'gte', value: 90 },
  { field: 'consent.email', op: 'eq', value: 'granted' },
  { field: 'attributes.city', op: 'in', value: ['İstanbul', 'Ankara'] },
] } };
const errs = (input: unknown) => { const r = validateSegmentDefinition(input); return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`); };
const w = (c: unknown) => ({ where: c });

describe('segment definition v1 (WP-36)', () => {
  it('accepts a win-back segment over order history, consent and attributes', () => {
    expect(validateSegmentDefinition(win).ok).toBe(true);
  });

  it('refuses unknown fields, scopes, operators and extra keys', () => {
    expect(errs(w({ field: 'orders.revenue', op: 'gt', value: 1 })).length).toBeGreaterThan(0);
    expect(errs(w({ field: 'payload.x', op: 'eq', value: 1 })).length).toBeGreaterThan(0);
    expect(errs(w({ field: 'event.x', op: 'eq', value: 1 })).length).toBeGreaterThan(0);
    expect(errs(w({ field: 'consent.sms', op: 'eq', value: 'granted' })).length).toBeGreaterThan(0);
    expect(errs(w({ field: 'attributes.x', op: 'like', value: 'a' })).length).toBeGreaterThan(0);
    expect(errs({ where: { field: 'attributes.x', op: 'eq', value: 1 }, limit: 5 }).length).toBeGreaterThan(0);
    expect(errs({}).length).toBeGreaterThan(0);
    expect(errs('x').length).toBeGreaterThan(0);
  });

  it('order metrics are numbers and consent is granted or revoked', () => {
    expect(errs(w({ field: 'orders.count', op: 'eq', value: '3' })).join()).toMatch(/compared with numbers/);
    expect(errs(w({ field: 'orders.count', op: 'in', value: [1, 'x'] })).join()).toMatch(/compared with numbers/);
    expect(errs(w({ field: 'orders.count', op: 'contains', value: 1 })).join()).toMatch(/is a number/);
    expect(errs(w({ field: 'orders.total_spent', op: 'exists' }))).toEqual([]);
    expect(errs(w({ field: 'consent.email', op: 'eq', value: 'maybe' })).join()).toMatch(/granted/);
    expect(errs(w({ field: 'consent.email', op: 'gt', value: 'granted' })).join()).toMatch(/supports/);
    expect(errs(w({ field: 'consent.email', op: 'not_exists' }))).toEqual([]);
  });

  it('conditions nest at most four levels and every list is bounded', () => {
    let c: unknown = { field: 'attributes.x', op: 'eq', value: 1 };
    for (let i = 0; i < 3; i++) c = { not: c };
    expect(errs(w(c))).toEqual([]);
    expect(errs(w({ not: c })).join()).toMatch(/at most 4 levels/);
    expect(errs(w({ all: [] })).length).toBeGreaterThan(0);
    expect(errs(w({ field: 'attributes.x', op: 'in', value: [] })).length).toBeGreaterThan(0);
  });
});

describe('segment compiler (WP-36)', () => {
  it('puts no value, attribute name or field into the statement text, only bound parameters', () => {
    const evil = "x'); DROP TABLE engage.profiles; --";
    const r = validateSegmentDefinition({ where: { all: [
      { field: 'attributes.zzattr', op: 'eq', value: evil },
      { field: 'attributes.tags', op: 'contains', value: evil },
      { field: 'attributes.city', op: 'in', value: [evil, 'a'] },
      { field: 'attributes.age', op: 'gt', value: 5 },
    ] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = buildSegmentQuery(r.definition, '00000000-0000-4000-8000-000000000001', new Date('2026-11-10T00:00:00Z'), { mode: 'count' });
    expect(q.text).not.toContain('DROP');
    expect(q.text).not.toContain('zzattr');
    expect(q.params).toContain('zzattr');
    expect(q.params.filter((p) => p === evil)).toHaveLength(4);
    // Placeholders are consecutive from $3 and every one has a value.
    const used = [...q.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...used)).toBe(q.params.length);
    for (let i = 1; i <= q.params.length; i++) expect(used).toContain(i);
  });

  it('leaves are wrapped so a missing value never matches, and `not` inverts the result', () => {
    const c = compileCondition({ not: { field: 'attributes.x', op: 'eq', value: 1 } }, 3);
    expect(c.where).toMatch(/^\(NOT COALESCE\(/);
    expect(compileCondition({ field: 'orders.count', op: 'gte', value: 1 }, 3).where).toMatch(/^COALESCE\(/);
  });

  it('ordered comparison with a boolean never matches (booleans are not ordered)', () => {
    const c = compileCondition({ field: 'attributes.x', op: 'gt', value: true }, 3);
    expect(c.where).toContain('AND false');
    expect(c.params).toEqual(['x']); // only the name; the statement uses $3, so Postgres can type it
  });

  it('modes: count, a sample of at most 100, and keyset pages of at most 5000', () => {
    const def = validateSegmentDefinition(win);
    if (!def.ok) throw new Error('invalid');
    const at = new Date('2026-11-10T00:00:00Z');
    expect(buildSegmentQuery(def.definition, 'o', at, { mode: 'count' }).text).toMatch(/SELECT count\(\*\)/);
    const s = buildSegmentQuery(def.definition, 'o', at, { mode: 'sample', limit: 10_000 });
    expect(s.params.at(-1)).toBe(100);
    const k = buildSegmentQuery(def.definition, 'o', at, { mode: 'ids', afterId: null, limit: 10_000 });
    expect(k.params.at(-1)).toBe(5000);
    expect(k.text).toMatch(/ORDER BY p\.id LIMIT/);
  });
});

describe('journey trigger: segment (WP-36)', () => {
  const trigger = { type: 'segment', segment: 'lapsed', segment_version: 1, every_days: 7, at_local_time: '10:00' };
  const steps = [{ id: 'm', type: 'message', channel: 'email', template: 'winback', purpose: 'marketing' }];

  it('accepts a scheduled segment trigger and lists the segment version it pins', () => {
    const r = validateDefinition({ trigger, steps });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segments).toEqual([{ key: 'lapsed', version: 1 }]);
  });

  it('refuses an unpinned or badly scheduled trigger', () => {
    const bad = (t: Record<string, unknown>) => { const r = validateDefinition({ trigger: t, steps }); return r.ok ? [] : r.errors.map((e) => e.path); };
    expect(bad({ ...trigger, segment_version: undefined })).toContain('trigger.segment_version');
    expect(bad({ ...trigger, every_days: 0 })).toContain('trigger.every_days');
    expect(bad({ ...trigger, every_days: 366 })).toContain('trigger.every_days');
    expect(bad({ ...trigger, at_local_time: '25:00' })).toContain('trigger.at_local_time');
    expect(bad({ ...trigger, segment: 'Bad Key' })).toContain('trigger.segment');
    expect(bad({ ...trigger, filter: { field: 'attributes.x', op: 'exists' } }).length).toBeGreaterThan(0);
  });

  it('other triggers list no segment', () => {
    const r = validateDefinition({ trigger: { type: 'api' }, steps });
    if (r.ok) expect(r.segments).toEqual([]);
  });
});
