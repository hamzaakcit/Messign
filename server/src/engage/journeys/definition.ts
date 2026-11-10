import { z } from 'zod';

/**
 * Journey definition, schema version 1 (WP-15, target-state D). Pure: no database. The service checks what needs the
 * database (that referenced templates exist); everything else is checked here, before a version is stored.
 *
 *   trigger    event {event, filter?} | api | date_attribute {attribute, offset_days, at_local_time} |
 *              segment {segment, segment_version, every_days, at_local_time} (scheduled, WP-36)
 *   exit_when  events that end an enrollment early (for example order_completed for cart abandonment)
 *   re_entry   never (a profile enters once) | after_exit (again once its previous enrollment has ended)
 *   holdout_percent  share of enrollments that run every step but get no message (default 10, D-11)
 *   steps      delay · wait_until {event, filter?, timeout, on_timeout} · branch {branches[], otherwise} ·
 *              message {channel email, template key, version?, purpose} · exit
 *
 * Steps run in order: a step goes to `next`, or to the following step, or exits after the last one. Branches name their
 * targets. The graph must be acyclic (no loops that could message someone forever), every target must exist, and every
 * step must be reachable. Webhook steps are not in v1: no customer needs them yet, and calling arbitrary URLs from the
 * engine needs its own protection (SSRF).
 */

export const DEFINITION_SCHEMA_VERSION = 1;
/** D-11: 10% of enrollments are a randomized holdout, so the uplift of a journey can be measured. */
export const DEFAULT_HOLDOUT_PERCENT = 10;
const MAX_STEPS = 50;
const MAX_CONDITION_DEPTH = 4;
const MINUTES_PER_YEAR = 365 * 24 * 60;

const eventName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be lower_snake_case, up to 64 characters');
const stepId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'must be 1-32 of a-z, 0-9, _ or -');
const templateKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'must be a template key');
const attributeName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'must be an attribute name');
const field = z.string().regex(/^(attributes|event|payload)\.[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'must be attributes.<name>, event.<name> or payload.<name>');
const scalar = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

export type Condition =
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'; value: string | number | boolean }
  | { field: string; op: 'exists' | 'not_exists' }
  | { field: string; op: 'in'; value: Array<string | number | boolean> }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

const condition: z.ZodType<Condition> = z.lazy(() => z.union([
  z.object({ field, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']), value: scalar }).strict(),
  z.object({ field, op: z.enum(['exists', 'not_exists']) }).strict(),
  z.object({ field, op: z.literal('in'), value: z.array(scalar).min(1).max(50) }).strict(),
  z.object({ all: z.array(condition).min(1).max(10) }).strict(),
  z.object({ any: z.array(condition).min(1).max(10) }).strict(),
  z.object({ not: condition }).strict(),
]));

const trigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('event'), event: eventName, filter: condition.optional() }).strict(),
  z.object({ type: z.literal('api') }).strict(),
  // A scheduled run over a segment (WP-36): every N days at a local time of the tenant, the customers in the pinned
  // segment version are enrolled once per run. The version is pinned so the audience changes only with a new, approved
  // journey version.
  z.object({
    type: z.literal('segment'), segment: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'must be a segment key'),
    segment_version: z.number().int().min(1).max(100000),
    every_days: z.number().int().min(1).max(365), at_local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM'),
  }).strict(),
  z.object({
    type: z.literal('date_attribute'), attribute: attributeName,
    offset_days: z.number().int().min(-365).max(365),
    at_local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM'),
  }).strict(),
]);

const next = stepId.optional();
const step = z.discriminatedUnion('type', [
  z.object({ id: stepId, type: z.literal('delay'), minutes: z.number().int().min(1).max(MINUTES_PER_YEAR), next }).strict(),
  z.object({
    id: stepId, type: z.literal('wait_until'), event: eventName, filter: condition.optional(),
    timeout_minutes: z.number().int().min(1).max(MINUTES_PER_YEAR), on_timeout: z.enum(['next', 'exit']), next,
  }).strict(),
  z.object({
    id: stepId, type: z.literal('branch'),
    branches: z.array(z.object({ when: condition, next: stepId }).strict()).min(1).max(10), otherwise: stepId,
  }).strict(),
  z.object({
    id: stepId, type: z.literal('message'), channel: z.literal('email'), template: templateKey,
    template_version: z.number().int().min(1).optional(), purpose: z.enum(['marketing', 'transactional']), next,
  }).strict(),
  z.object({ id: stepId, type: z.literal('exit') }).strict(),
]);

const definitionSchema = z.object({
  trigger,
  exit_when: z.array(z.object({ event: eventName, filter: condition.optional() }).strict()).max(10).default([]),
  re_entry: z.enum(['never', 'after_exit']).default('never'),
  holdout_percent: z.number().int().min(0).max(50).default(DEFAULT_HOLDOUT_PERCENT),
  steps: z.array(step).min(1).max(MAX_STEPS),
}).strict();

export type JourneyDefinition = z.infer<typeof definitionSchema>;
export type JourneyStep = JourneyDefinition['steps'][number];
export interface DefinitionIssue { path: string; message: string }
export interface TemplateRef { key: string; version: number | null; stepId: string }
export interface SegmentRef { key: string; version: number }
export type DefinitionResult =
  | { ok: true; definition: JourneyDefinition; templates: TemplateRef[]; segments: SegmentRef[] }
  | { ok: false; errors: DefinitionIssue[] };

const pathOf = (p: Array<string | number>) => p.map((x) => (typeof x === 'number' ? `[${x}]` : `.${x}`)).join('').replace(/^\./, '') || '(root)';

function conditionProblems(c: Condition, at: string, depth: number, allowEvent: boolean, out: DefinitionIssue[]): void {
  if (depth > MAX_CONDITION_DEPTH) { out.push({ path: at, message: `conditions may nest at most ${MAX_CONDITION_DEPTH} levels` }); return; }
  if ('all' in c) c.all.forEach((x, i) => conditionProblems(x, `${at}.all[${i}]`, depth + 1, allowEvent, out));
  else if ('any' in c) c.any.forEach((x, i) => conditionProblems(x, `${at}.any[${i}]`, depth + 1, allowEvent, out));
  else if ('not' in c) conditionProblems(c.not, `${at}.not`, depth + 1, allowEvent, out);
  else if (!allowEvent && c.field.startsWith('event.')) out.push({ path: `${at}.field`, message: 'event.* fields can only be used in event filters' });
}

/** The step a step continues to by default: its `next`, else the following step, else the end of the journey. */
export function defaultNext(steps: readonly JourneyStep[], index: number): string | null {
  const s = steps[index]!;
  if (s.type === 'exit' || s.type === 'branch') return null;
  return s.next ?? steps[index + 1]?.id ?? null;
}

/** Every step a step can go to. */
export function successors(steps: readonly JourneyStep[], index: number): string[] {
  const s = steps[index]!;
  if (s.type === 'branch') return [...new Set([...s.branches.map((b) => b.next), s.otherwise])];
  const n = defaultNext(steps, index);
  return n ? [n] : [];
}

export function validateDefinition(input: unknown): DefinitionResult {
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 50).map((i) => ({ path: pathOf(i.path), message: i.message })) };
  }
  const d = parsed.data;
  const errors: DefinitionIssue[] = [];

  // Conditions: depth, and event.* only where an event is being evaluated.
  if (d.trigger.type === 'event' && d.trigger.filter) conditionProblems(d.trigger.filter, 'trigger.filter', 1, true, errors);
  d.exit_when.forEach((e, i) => { if (e.filter) conditionProblems(e.filter, `exit_when[${i}].filter`, 1, true, errors); });
  d.steps.forEach((s, i) => {
    if (s.type === 'wait_until' && s.filter) conditionProblems(s.filter, `steps[${i}].filter`, 1, true, errors);
    if (s.type === 'branch') s.branches.forEach((b, j) => conditionProblems(b.when, `steps[${i}].branches[${j}].when`, 1, false, errors));
  });

  // Graph: unique ids, existing targets, no self-reference.
  const index = new Map<string, number>();
  d.steps.forEach((s, i) => {
    if (index.has(s.id)) errors.push({ path: `steps[${i}].id`, message: `duplicate step id "${s.id}"` });
    else index.set(s.id, i);
  });
  d.steps.forEach((s, i) => {
    for (const t of successors(d.steps, i)) {
      if (!index.has(t)) errors.push({ path: `steps[${i}]`, message: `goes to unknown step "${t}"` });
      else if (t === s.id) errors.push({ path: `steps[${i}]`, message: 'a step cannot go to itself' });
    }
  });
  if (errors.length) return { ok: false, errors };

  // No cycles (depth-first search with colours), and every step reachable from the first.
  const colour = new Map<string, 0 | 1 | 2>();
  let cycleAt: string | null = null;
  const visit = (id: string) => {
    if (cycleAt) return;
    colour.set(id, 1);
    for (const t of successors(d.steps, index.get(id)!)) {
      const c = colour.get(t) ?? 0;
      if (c === 1) { cycleAt = t; return; }
      if (c === 0) visit(t);
    }
    colour.set(id, 2);
  };
  visit(d.steps[0]!.id);
  if (cycleAt) return { ok: false, errors: [{ path: 'steps', message: `the steps loop back to "${cycleAt}"; journeys must not loop` }] };
  d.steps.forEach((s, i) => { if (!colour.has(s.id)) errors.push({ path: `steps[${i}]`, message: `step "${s.id}" can never be reached` }); });
  if (errors.length) return { ok: false, errors };

  const templates = d.steps.flatMap((s) => (s.type === 'message' ? [{ key: s.template, version: s.template_version ?? null, stepId: s.id }] : []));
  const segments = d.trigger.type === 'segment' ? [{ key: d.trigger.segment, version: d.trigger.segment_version }] : [];
  return { ok: true, definition: d, templates, segments };
}
