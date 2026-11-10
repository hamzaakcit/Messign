/**
 * The journey builder's form model (WP-20). Pure: form state <-> journey definition (server schema v1,
 * server/src/engage/journeys/definition.ts). The form covers what a marketer needs day to day: one trigger, exit events,
 * re-entry, holdout, and steps whose conditions are single comparisons. Anything richer (all/any/not trees, exit
 * filters) is edited as JSON; definitionToForm says so instead of dropping it. The server validates either way.
 */

export const STEP_TYPES = ['delay', 'wait_until', 'branch', 'message', 'exit'] as const;
export type StepType = (typeof STEP_TYPES)[number];
export const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists', 'not_exists'] as const;
export type Op = (typeof OPS)[number];

export interface LeafForm { field: string; op: Op; value: string }
export interface StepForm {
  id: string;
  type: StepType;
  /** '' = the following step (or the end after the last one). Not used by branch and exit. */
  next: string;
  minutes: string;
  event: string;
  filter: LeafForm | null;
  timeoutMinutes: string;
  onTimeout: 'next' | 'exit';
  branches: Array<{ when: LeafForm; next: string }>;
  otherwise: string;
  template: string;
  templateVersion: string;
  purpose: 'marketing' | 'transactional';
}
export interface JourneyForm {
  trigger: {
    type: 'event' | 'api' | 'segment';
    event: string; filter: LeafForm | null;
    segment: string; segmentVersion: string; everyDays: string; atLocalTime: string;
  };
  exitEvents: string[];
  reEntry: 'never' | 'after_exit';
  holdoutPercent: string;
  steps: StepForm[];
}

export const emptyLeaf = (): LeafForm => ({ field: 'attributes.', op: 'eq', value: '' });

export function newStep(type: StepType, existing: readonly StepForm[]): StepForm {
  let n = existing.length + 1;
  const ids = new Set(existing.map((s) => s.id));
  while (ids.has(`${type.replace('_', '-')}-${n}`)) n++;
  return {
    id: `${type.replace('_', '-')}-${n}`, type, next: '', minutes: '60', event: '', filter: null, timeoutMinutes: '1440', onTimeout: 'next',
    branches: type === 'branch' ? [{ when: emptyLeaf(), next: '' }] : [], otherwise: '', template: '', templateVersion: '', purpose: 'marketing',
  };
}

export function emptyForm(): JourneyForm {
  return {
    trigger: { type: 'event', event: 'cart_updated', filter: null, segment: '', segmentVersion: '1', everyDays: '7', atLocalTime: '10:00' },
    exitEvents: [], reEntry: 'never', holdoutPercent: '10',
    steps: [{ ...newStep('delay', []), id: 'wait' }],
  };
}

/** Text from an input to a JSON scalar: true/false, a number, or a string ("quotes" keep text that looks like a number). */
export function parseValue(text: string): string | number | boolean {
  const t = text.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return text;
}
const valueText = (v: unknown): string => (typeof v === 'string' && (/^-?\d+(\.\d+)?$/.test(v.trim()) || v === 'true' || v === 'false') ? `"${v}"` : String(v));

export function leafToCondition(l: LeafForm): Record<string, unknown> {
  if (l.op === 'exists' || l.op === 'not_exists') return { field: l.field.trim(), op: l.op };
  if (l.op === 'in') return { field: l.field.trim(), op: 'in', value: l.value.split(',').map((x) => parseValue(x.trim())).filter((x) => x !== '') };
  return { field: l.field.trim(), op: l.op, value: parseValue(l.value) };
}

export function conditionToLeaf(c: unknown): LeafForm | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.field !== 'string' || typeof o.op !== 'string' || !(OPS as readonly string[]).includes(o.op)) return null;
  if (o.op === 'exists' || o.op === 'not_exists') return { field: o.field, op: o.op as Op, value: '' };
  if (o.op === 'in') return Array.isArray(o.value) ? { field: o.field, op: 'in', value: o.value.map(valueText).join(', ') } : null;
  return { field: o.field, op: o.op as Op, value: valueText(o.value) };
}

const int = (s: string): number => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

export function formToDefinition(f: JourneyForm): Record<string, unknown> {
  const t = f.trigger;
  const trigger =
    t.type === 'api' ? { type: 'api' }
      : t.type === 'segment' ? { type: 'segment', segment: t.segment.trim(), segment_version: int(t.segmentVersion), every_days: int(t.everyDays), at_local_time: t.atLocalTime.trim() }
        : { type: 'event', event: t.event.trim(), ...(t.filter ? { filter: leafToCondition(t.filter) } : {}) };
  const next = (s: StepForm) => (s.next ? { next: s.next } : {});
  const steps = f.steps.map((s) => {
    switch (s.type) {
      case 'delay': return { id: s.id, type: 'delay', minutes: int(s.minutes), ...next(s) };
      case 'wait_until': return {
        id: s.id, type: 'wait_until', event: s.event.trim(), ...(s.filter ? { filter: leafToCondition(s.filter) } : {}),
        timeout_minutes: int(s.timeoutMinutes), on_timeout: s.onTimeout, ...next(s),
      };
      case 'branch': return { id: s.id, type: 'branch', branches: s.branches.map((b) => ({ when: leafToCondition(b.when), next: b.next })), otherwise: s.otherwise };
      case 'message': return {
        id: s.id, type: 'message', channel: 'email', template: s.template, ...(s.templateVersion.trim() ? { template_version: int(s.templateVersion) } : {}),
        purpose: s.purpose, ...next(s),
      };
      case 'exit': return { id: s.id, type: 'exit' };
    }
  });
  return {
    trigger,
    exit_when: f.exitEvents.map((e) => e.trim()).filter(Boolean).map((event) => ({ event })),
    re_entry: f.reEntry,
    holdout_percent: int(f.holdoutPercent),
    steps,
  };
}

export type FormConversion = { ok: true; form: JourneyForm } | { ok: false; reason: string };

/** The form for a stored definition, or why it can only be edited as JSON. */
export function definitionToForm(def: unknown): FormConversion {
  if (!def || typeof def !== 'object') return { ok: false, reason: 'The definition is not an object.' };
  const d = def as Record<string, unknown>;
  const t = (d.trigger ?? {}) as Record<string, unknown>;
  const f = emptyForm();
  if (t.type === 'api') f.trigger.type = 'api';
  else if (t.type === 'segment') {
    f.trigger = { ...f.trigger, type: 'segment', segment: String(t.segment ?? ''), segmentVersion: String(t.segment_version ?? ''), everyDays: String(t.every_days ?? ''), atLocalTime: String(t.at_local_time ?? '') };
  } else if (t.type === 'event') {
    f.trigger = { ...f.trigger, type: 'event', event: String(t.event ?? ''), filter: null };
    if (t.filter !== undefined) {
      const leaf = conditionToLeaf(t.filter);
      if (!leaf) return { ok: false, reason: 'The trigger filter combines several conditions.' };
      f.trigger.filter = leaf;
    }
  } else return { ok: false, reason: `The trigger type "${String(t.type)}" has no form yet.` };

  const exits = Array.isArray(d.exit_when) ? d.exit_when as Array<Record<string, unknown>> : [];
  if (exits.some((x) => x.filter !== undefined)) return { ok: false, reason: 'An exit condition has a filter.' };
  f.exitEvents = exits.map((x) => String(x.event ?? ''));
  f.reEntry = d.re_entry === 'after_exit' ? 'after_exit' : 'never';
  f.holdoutPercent = d.holdout_percent === undefined ? '10' : String(d.holdout_percent);

  const steps = Array.isArray(d.steps) ? d.steps as Array<Record<string, unknown>> : [];
  const out: StepForm[] = [];
  for (const s of steps) {
    const type = s.type as StepType;
    if (!(STEP_TYPES as readonly string[]).includes(type)) return { ok: false, reason: `The step type "${String(s.type)}" has no form.` };
    const base = { ...newStep(type, []), id: String(s.id ?? ''), next: typeof s.next === 'string' ? s.next : '' };
    if (type === 'delay') base.minutes = String(s.minutes ?? '');
    if (type === 'wait_until') {
      base.event = String(s.event ?? ''); base.timeoutMinutes = String(s.timeout_minutes ?? ''); base.onTimeout = s.on_timeout === 'exit' ? 'exit' : 'next';
      if (s.filter !== undefined) {
        const leaf = conditionToLeaf(s.filter);
        if (!leaf) return { ok: false, reason: `Step "${base.id}" waits with a combined condition.` };
        base.filter = leaf;
      }
    }
    if (type === 'branch') {
      const bs = Array.isArray(s.branches) ? s.branches as Array<Record<string, unknown>> : [];
      base.branches = [];
      for (const b of bs) {
        const leaf = conditionToLeaf(b.when);
        if (!leaf) return { ok: false, reason: `Step "${base.id}" branches on a combined condition.` };
        base.branches.push({ when: leaf, next: String(b.next ?? '') });
      }
      base.otherwise = String(s.otherwise ?? '');
    }
    if (type === 'message') {
      base.template = String(s.template ?? ''); base.templateVersion = s.template_version === undefined ? '' : String(s.template_version);
      base.purpose = s.purpose === 'transactional' ? 'transactional' : 'marketing';
    }
    out.push(base);
  }
  f.steps = out;
  return { ok: true, form: f };
}

/** A short line describing a step, for lists and summaries. */
export function describeStep(s: StepForm): string {
  switch (s.type) {
    case 'delay': return `Wait ${s.minutes} minutes`;
    case 'wait_until': return `Wait up to ${s.timeoutMinutes} minutes for ${s.event || '(event)'}, then ${s.onTimeout === 'exit' ? 'end' : 'continue'}`;
    case 'branch': return `Branch: ${s.branches.length} rule(s), otherwise ${s.otherwise || '(step)'}`;
    case 'message': return `Send email "${s.template || '(template)'}"${s.templateVersion ? ` v${s.templateVersion}` : ''} (${s.purpose})`;
    case 'exit': return 'End the journey';
  }
}
