import type { Condition } from './definition.js';

/**
 * Evaluates a journey condition (WP-16). Pure. Fields read only an object's own properties (never inherited ones such
 * as `constructor`), and a comparison with a missing value is false, like NULL in SQL: missing data never makes a
 * filter match. `not` inverts the result of what it wraps, so `not` over a missing field is true.
 *
 *   attributes.<name>  the profile's attributes
 *   event.<name>       the evaluated event's properties (trigger filters, exit_when filters, wait_until filters)
 *   payload.<name>     the enrollment's payload (the API trigger payload, or the trigger event's properties)
 */
export interface ConditionContext {
  attributes: Record<string, unknown>;
  event?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

type Scalar = string | number | boolean;

function read(ctx: ConditionContext, field: string): unknown {
  const dot = field.indexOf('.');
  const scope = field.slice(0, dot);
  const name = field.slice(dot + 1);
  const source = scope === 'attributes' ? ctx.attributes : scope === 'event' ? ctx.event : scope === 'payload' ? ctx.payload : undefined;
  if (!source || typeof source !== 'object' || !Object.prototype.hasOwnProperty.call(source, name)) return undefined;
  return (source as Record<string, unknown>)[name];
}

const present = (v: unknown) => v !== undefined && v !== null;
const isScalar = (v: unknown): v is Scalar => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean';

function compare(a: unknown, b: Scalar): number | null {
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a)) return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

export function evaluateCondition(c: Condition, ctx: ConditionContext): boolean {
  if ('all' in c) return c.all.every((x) => evaluateCondition(x, ctx));
  if ('any' in c) return c.any.some((x) => evaluateCondition(x, ctx));
  if ('not' in c) return !evaluateCondition(c.not, ctx);
  const v = read(ctx, c.field);
  switch (c.op) {
    case 'exists': return present(v);
    case 'not_exists': return !present(v);
    case 'eq': return isScalar(v) && v === c.value;
    case 'neq': return isScalar(v) && v !== c.value;
    case 'in': return c.value.includes(v as Scalar);
    case 'contains':
      if (typeof v === 'string' && typeof c.value === 'string') return v.includes(c.value);
      return Array.isArray(v) && v.some((x) => x === c.value);
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const d = compare(v, c.value);
      if (d === null) return false;
      return c.op === 'gt' ? d > 0 : c.op === 'gte' ? d >= 0 : c.op === 'lt' ? d < 0 : d <= 0;
    }
    default: return false;
  }
}

/** No condition means everything matches. */
export const matches = (c: Condition | undefined, ctx: ConditionContext): boolean => (c ? evaluateCondition(c, ctx) : true);
