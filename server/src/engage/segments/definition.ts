import { z } from 'zod';

/**
 * Segment definition, schema version 1 (WP-36). Pure: no database. A segment is one condition tree over a customer's
 * attributes, order history and email consent; the compiler (compile.ts) turns it into SQL and nothing else evaluates it.
 *
 *   attributes.<name>   the customer's attributes (any operator; a missing value never matches a comparison)
 *   orders.<metric>     from the customer's order_completed events, counted up to the moment of evaluation:
 *                         count, count_30d, count_90d, count_365d          number of orders (all time / in the window)
 *                         total_spent, total_spent_365d                    sum of the orders' `total` (orders without one add 0)
 *                         days_since_last, days_since_first                whole days; empty (no match) for a customer who never ordered
 *   consent.email       'granted' | 'revoked' (empty for a customer without a record)
 *
 * Operators: eq neq gt gte lt lte in contains exists not_exists, combined with all / any / not (nesting at most four
 * levels). Erased customers are never in a segment.
 */

export const SEGMENT_SCHEMA_VERSION = 1;
const MAX_DEPTH = 4;

export const ORDER_METRICS = ['count', 'count_30d', 'count_90d', 'count_365d', 'total_spent', 'total_spent_365d', 'days_since_last', 'days_since_first'] as const;
export type OrderMetric = (typeof ORDER_METRICS)[number];
export const CONSENT_FIELDS = ['email'] as const;

const scalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);
const attributeField = z.string().regex(/^attributes\.[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const orderField = z.string().regex(new RegExp(`^orders\\.(${ORDER_METRICS.join('|')})$`));
const consentField = z.string().regex(/^consent\.email$/);

export type SegmentCondition =
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'; value: string | number | boolean }
  | { field: string; op: 'exists' | 'not_exists' }
  | { field: string; op: 'in'; value: Array<string | number | boolean> }
  | { all: SegmentCondition[] }
  | { any: SegmentCondition[] }
  | { not: SegmentCondition };

const anyField = z.union([attributeField, orderField, consentField]);
const condition: z.ZodType<SegmentCondition> = z.lazy(() => z.union([
  z.object({ field: anyField, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']), value: scalar }).strict(),
  z.object({ field: anyField, op: z.enum(['exists', 'not_exists']) }).strict(),
  z.object({ field: anyField, op: z.literal('in'), value: z.array(scalar).min(1).max(50) }).strict(),
  z.object({ all: z.array(condition).min(1).max(10) }).strict(),
  z.object({ any: z.array(condition).min(1).max(10) }).strict(),
  z.object({ not: condition }).strict(),
]));

const definitionSchema = z.object({ where: condition }).strict();
export type SegmentDefinition = z.infer<typeof definitionSchema>;
export interface SegmentIssue { path: string; message: string }
export type SegmentValidation = { ok: true; definition: SegmentDefinition } | { ok: false; errors: SegmentIssue[] };

const pathOf = (p: Array<string | number>) => p.map((x) => (typeof x === 'number' ? `[${x}]` : `.${x}`)).join('').replace(/^\./, '') || '(root)';

function problems(c: SegmentCondition, at: string, depth: number, out: SegmentIssue[]): void {
  if (depth > MAX_DEPTH) { out.push({ path: at, message: `conditions may nest at most ${MAX_DEPTH} levels` }); return; }
  if ('all' in c) return c.all.forEach((x, i) => problems(x, `${at}.all[${i}]`, depth + 1, out));
  if ('any' in c) return c.any.forEach((x, i) => problems(x, `${at}.any[${i}]`, depth + 1, out));
  if ('not' in c) return problems(c.not, `${at}.not`, depth + 1, out);
  const scope = c.field.slice(0, c.field.indexOf('.'));
  if (scope === 'orders') {
    const numeric = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'in'];
    if (!numeric.includes(c.op)) out.push({ path: `${at}.op`, message: `${c.field} is a number: use eq, neq, gt, gte, lt, lte, in, exists or not_exists` });
    else if ('value' in c) {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      if (values.some((v) => typeof v !== 'number')) out.push({ path: `${at}.value`, message: `${c.field} is compared with numbers` });
    }
  } else if (scope === 'consent') {
    if (!['eq', 'neq', 'in', 'exists', 'not_exists'].includes(c.op)) out.push({ path: `${at}.op`, message: 'consent.email supports eq, neq, in, exists and not_exists' });
    else if ('value' in c) {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      if (values.some((v) => v !== 'granted' && v !== 'revoked')) out.push({ path: `${at}.value`, message: 'consent.email is "granted" or "revoked"' });
    }
  }
}

export function validateSegmentDefinition(input: unknown): SegmentValidation {
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 50).map((i) => ({ path: pathOf(i.path), message: i.message })) };
  const errors: SegmentIssue[] = [];
  problems(parsed.data.where, 'where', 1, errors);
  return errors.length ? { ok: false, errors } : { ok: true, definition: parsed.data };
}
