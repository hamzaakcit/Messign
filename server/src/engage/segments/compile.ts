import type { SegmentCondition, SegmentDefinition } from './definition.js';

/**
 * Segment definition -> SQL (WP-36). Pure. Every value, and every attribute name, travels as a bound parameter; the
 * only text put into the statement is fixed (operators from a table, column expressions below). Each leaf is wrapped
 * in COALESCE(..., false), so a missing value never matches a comparison and `not` of it matches, which is the
 * behaviour of the journey condition evaluator (journeys/conditions.ts); a test runs both on the same data.
 *
 * The statement works over p (engage.profiles), o (per-customer order totals, one scan of the tenant's order_completed
 * events up to the evaluation time $2) and cs (the customer's email marketing consent state).
 */

type Scalar = string | number | boolean;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;
const castOf = (v: Scalar): 'text' | 'numeric' | 'boolean' => (typeof v === 'string' ? 'text' : typeof v === 'number' ? 'numeric' : 'boolean');

const METRICS: Record<string, string> = {
  count: 'COALESCE(o.cnt, 0)::numeric',
  count_30d: 'COALESCE(o.cnt30, 0)::numeric',
  count_90d: 'COALESCE(o.cnt90, 0)::numeric',
  count_365d: 'COALESCE(o.cnt365, 0)::numeric',
  total_spent: 'COALESCE(o.total, 0)::numeric',
  total_spent_365d: 'COALESCE(o.total365, 0)::numeric',
  days_since_last: 'CASE WHEN o.last_at IS NULL THEN NULL ELSE floor(extract(epoch FROM ($2::timestamptz - o.last_at)) / 86400)::numeric END',
  days_since_first: 'CASE WHEN o.first_at IS NULL THEN NULL ELSE floor(extract(epoch FROM ($2::timestamptz - o.first_at)) / 86400)::numeric END',
};

export interface Compiled { where: string; params: unknown[] }

export function compileCondition(root: SegmentCondition, firstParam: number): Compiled {
  const params: unknown[] = [];
  const bind = (v: unknown): string => { params.push(v); return `$${firstParam + params.length - 1}`; };

  const metric = (c: { field: string; op: string; value?: Scalar | Scalar[] }): string => {
    const expr = METRICS[c.field.slice('orders.'.length)]!;
    if (c.op === 'exists') return `((${expr}) IS NOT NULL)`;
    if (c.op === 'not_exists') return `((${expr}) IS NULL)`;
    if (c.op === 'in') return `COALESCE((${expr}) = ANY(${bind(c.value)}::numeric[]), false)`;
    return `COALESCE((${expr}) ${OPS[c.op as keyof typeof OPS]} ${bind(c.value)}::numeric, false)`;
  };

  const consent = (c: { op: string; value?: Scalar | Scalar[] }): string => {
    if (c.op === 'exists') return '(cs.status IS NOT NULL)';
    if (c.op === 'not_exists') return '(cs.status IS NULL)';
    if (c.op === 'in') return `COALESCE(cs.status = ANY(${bind(c.value)}::text[]), false)`;
    return `COALESCE(cs.status ${OPS[c.op as keyof typeof OPS]} ${bind(c.value)}::text, false)`;
  };

  const attribute = (c: { field: string; op: string; value?: Scalar | Scalar[] }): string => {
    const a = `(p.attributes -> ${bind(c.field.slice('attributes.'.length))}::text)`;
    const eq = (v: Scalar) => `${a} = to_jsonb(${bind(v)}::${castOf(v)})`;
    switch (c.op) {
      case 'exists': return `COALESCE(${a} IS NOT NULL AND ${a} <> 'null'::jsonb, false)`;
      case 'not_exists': return `NOT COALESCE(${a} IS NOT NULL AND ${a} <> 'null'::jsonb, false)`;
      case 'eq': return `COALESCE(${eq(c.value as Scalar)}, false)`;
      case 'neq': return `COALESCE(jsonb_typeof(${a}) IN ('string', 'number', 'boolean') AND ${a} <> to_jsonb(${bind(c.value)}::${castOf(c.value as Scalar)}), false)`;
      case 'in': return `COALESCE(${(c.value as Scalar[]).map((v) => `(${eq(v)})`).join(' OR ')}, false)`;
      case 'contains': {
        const v = c.value as Scalar;
        const inArray = `${a} @> jsonb_build_array(to_jsonb(${bind(v)}::${castOf(v)}))`;
        if (typeof v !== 'string') return `COALESCE(CASE WHEN jsonb_typeof(${a}) = 'array' THEN ${inArray} END, false)`;
        const needle = bind(v);
        return `COALESCE(CASE jsonb_typeof(${a}) WHEN 'string' THEN position(${needle}::text IN (${a} #>> '{}')) > 0 WHEN 'array' THEN ${inArray} END, false)`;
      }
      default: {
        const v = c.value as Scalar;
        const sym = OPS[c.op as keyof typeof OPS];
        // Booleans are not ordered: never a match. The attribute name stays referenced so its parameter keeps a type.
        if (typeof v === 'boolean') return `COALESCE(${a} IS NULL AND false, false)`;
        if (typeof v === 'number') return `COALESCE(CASE WHEN jsonb_typeof(${a}) = 'number' THEN (${a})::numeric ${sym} ${bind(v)}::numeric END, false)`;
        return `COALESCE(CASE WHEN jsonb_typeof(${a}) = 'string' THEN ((${a} #>> '{}') COLLATE "C") ${sym} (${bind(v)}::text COLLATE "C") END, false)`;
      }
    }
  };

  const walk = (c: SegmentCondition): string => {
    if ('all' in c) return `(${c.all.map(walk).join(' AND ')})`;
    if ('any' in c) return `(${c.any.map(walk).join(' OR ')})`;
    if ('not' in c) return `(NOT ${walk(c.not)})`;
    const scope = c.field.slice(0, c.field.indexOf('.'));
    if (scope === 'orders') return metric(c);
    if (scope === 'consent') return consent(c);
    return attribute(c);
  };
  return { where: walk(root), params };
}

/** Order totals of the tenant, per customer, up to the evaluation time $2 (windows end at $2). */
const ORDERS_CTE = `
WITH o AS (
  SELECT e.profile_id,
         count(*)::int AS cnt,
         count(*) FILTER (WHERE e.occurred_at > $2::timestamptz - interval '30 days')::int AS cnt30,
         count(*) FILTER (WHERE e.occurred_at > $2::timestamptz - interval '90 days')::int AS cnt90,
         count(*) FILTER (WHERE e.occurred_at > $2::timestamptz - interval '365 days')::int AS cnt365,
         COALESCE(sum(e.total), 0) AS total,
         COALESCE(sum(e.total) FILTER (WHERE e.occurred_at > $2::timestamptz - interval '365 days'), 0) AS total365,
         max(e.occurred_at) AS last_at, min(e.occurred_at) AS first_at
    FROM (SELECT profile_id, occurred_at,
                 CASE WHEN properties->>'total' ~ '^[0-9]{1,12}(\\.[0-9]{1,6})?$' THEN (properties->>'total')::numeric END AS total
            FROM engage.events WHERE organization_id = $1 AND name = 'order_completed' AND occurred_at <= $2::timestamptz) e
   GROUP BY e.profile_id)`;

const FROM = `
  FROM engage.profiles p
  LEFT JOIN o ON o.profile_id = p.id
  LEFT JOIN engage.consent_state cs ON cs.organization_id = p.organization_id AND cs.profile_id = p.id AND cs.channel = 'email' AND cs.purpose = 'marketing'
 WHERE p.organization_id = $1 AND p.erased_at IS NULL`;

export type SegmentQueryMode = { mode: 'count' } | { mode: 'sample'; limit: number } | { mode: 'ids'; afterId: string | null; limit: number };

/** $1 organization id, $2 evaluation time; the rest are the segment's own values. */
export function buildSegmentQuery(definition: SegmentDefinition, orgId: string, at: Date, q: SegmentQueryMode): { text: string; params: unknown[] } {
  const c = compileCondition(definition.where, 3);
  const params: unknown[] = [orgId, at.toISOString(), ...c.params];
  const cond = `AND (${c.where})`;
  if (q.mode === 'count') return { text: `${ORDERS_CTE}\nSELECT count(*)::int AS n ${FROM} ${cond}`, params };
  if (q.mode === 'sample') {
    params.push(Math.min(Math.max(Math.trunc(q.limit), 1), 100));
    return { text: `${ORDERS_CTE}\nSELECT p.id, p.external_id ${FROM} ${cond} ORDER BY p.created_at DESC, p.id DESC LIMIT $${params.length}`, params };
  }
  params.push(q.afterId, Math.min(Math.max(Math.trunc(q.limit), 1), 5000));
  return { text: `${ORDERS_CTE}\nSELECT p.id ${FROM} ${cond} AND ($${params.length - 1}::uuid IS NULL OR p.id > $${params.length - 1}::uuid) ORDER BY p.id LIMIT $${params.length}`, params };
}
