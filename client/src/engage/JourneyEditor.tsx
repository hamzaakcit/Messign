import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ApiIssues, addJourneyVersion, createJourney, listSegments, listTemplates, validateJourney, type Issue,
} from './builderApi';
import {
  OPS, STEP_TYPES, definitionToForm, emptyForm, emptyLeaf, formToDefinition, newStep,
  type JourneyForm, type LeafForm, type Op, type StepForm, type StepType,
} from './journeyForm';
import { Button, Card, Field, Issues, Select, TextInput, inputClass } from './ui';

/**
 * Form-based journey editor (WP-20). Edits a journey definition through a form, or as JSON for what the form does not
 * cover; the server validates on demand and on save. Saving creates the journey (version 1) or a new version; either
 * way it is a draft that a tenant admin approves and activates on the journey page.
 */

const STEP_LABEL: Record<StepType, string> = { delay: 'Wait', wait_until: 'Wait for an event', branch: 'Branch', message: 'Send email', exit: 'End' };
const OP_LABEL: Record<Op, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains', in: 'is one of', exists: 'is set', not_exists: 'is not set',
};

function LeafEditor({ leaf, onChange, scopes, label }: { leaf: LeafForm; onChange: (l: LeafForm) => void; scopes: string; label: string }): JSX.Element {
  return (
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr]" aria-label={label}>
      <TextInput value={leaf.field} onChange={(field) => onChange({ ...leaf, field })} placeholder={scopes} ariaLabel={`${label} field`} mono />
      <Select value={leaf.op} onChange={(op) => onChange({ ...leaf, op })} options={OPS.map((o) => ({ value: o, label: OP_LABEL[o] }))} ariaLabel={`${label} operator`} />
      {leaf.op === 'exists' || leaf.op === 'not_exists'
        ? <span />
        : <TextInput value={leaf.value} onChange={(value) => onChange({ ...leaf, value })} placeholder={leaf.op === 'in' ? 'a, b, c' : 'value'} ariaLabel={`${label} value`} />}
    </div>
  );
}

function OptionalLeaf({ leaf, onChange, scopes, label, toggle }: { leaf: LeafForm | null; onChange: (l: LeafForm | null) => void; scopes: string; label: string; toggle: string }): JSX.Element {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-app">
        <input type="checkbox" checked={leaf !== null} onChange={(e) => onChange(e.target.checked ? emptyLeaf() : null)} />
        {toggle}
      </label>
      {leaf && <LeafEditor leaf={leaf} onChange={onChange} scopes={scopes} label={label} />}
    </div>
  );
}

function StepEditor({ step, index, steps, templates, onChange, onRemove, onMove }: {
  step: StepForm; index: number; steps: StepForm[]; templates: string[];
  onChange: (s: StepForm) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}): JSX.Element {
  const others = steps.filter((s) => s.id !== step.id).map((s) => ({ value: s.id, label: s.id }));
  const nextOptions = [{ value: '', label: index === steps.length - 1 ? 'End of the journey' : `The next step (${steps[index + 1]?.id})` }, ...others];
  const set = (patch: Partial<StepForm>) => onChange({ ...step, ...patch });
  return (
    <li className="rounded-md border border-app p-3" data-testid={`step-${index}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-app">{index + 1}. {STEP_LABEL[step.type]}</span>
        <div className="flex gap-1">
          <Button onClick={() => onMove(-1)} disabled={index === 0}>↑</Button>
          <Button onClick={() => onMove(1)} disabled={index === steps.length - 1}>↓</Button>
          <Button kind="danger" onClick={onRemove} disabled={steps.length === 1}>Remove</Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Step id" hint="letters, digits, - and _"><TextInput value={step.id} onChange={(id) => set({ id })} ariaLabel={`Step ${index + 1} id`} mono /></Field>
        {step.type === 'delay' && <Field label="Wait (minutes)"><TextInput value={step.minutes} onChange={(minutes) => set({ minutes })} ariaLabel={`Step ${index + 1} minutes`} /></Field>}
        {step.type === 'wait_until' && <>
          <Field label="Event"><TextInput value={step.event} onChange={(event) => set({ event })} placeholder="order_completed" ariaLabel={`Step ${index + 1} event`} mono /></Field>
          <Field label="Give up after (minutes)"><TextInput value={step.timeoutMinutes} onChange={(timeoutMinutes) => set({ timeoutMinutes })} ariaLabel={`Step ${index + 1} timeout`} /></Field>
          <Field label="If it never comes">
            <Select value={step.onTimeout} onChange={(onTimeout) => set({ onTimeout })} options={[{ value: 'next', label: 'Continue' }, { value: 'exit', label: 'End the journey' }]} ariaLabel={`Step ${index + 1} on timeout`} />
          </Field>
        </>}
        {step.type === 'message' && <>
          <Field label="Email template">
            <Select value={step.template} onChange={(template) => set({ template })} ariaLabel={`Step ${index + 1} template`} testId={`step-${index}-template`}
              options={[{ value: '', label: templates.length ? 'Choose a template' : 'No templates yet' }, ...templates.map((t) => ({ value: t, label: t }))]} />
          </Field>
          <Field label="Template version" hint="empty = latest when sent"><TextInput value={step.templateVersion} onChange={(templateVersion) => set({ templateVersion })} ariaLabel={`Step ${index + 1} template version`} /></Field>
          <Field label="Purpose">
            <Select value={step.purpose} onChange={(purpose) => set({ purpose })} options={[{ value: 'marketing', label: 'Marketing' }, { value: 'transactional', label: 'Transactional' }]} ariaLabel={`Step ${index + 1} purpose`} />
          </Field>
        </>}
        {step.type !== 'branch' && step.type !== 'exit' && (
          <Field label="Then go to"><Select value={step.next} onChange={(next) => set({ next })} options={nextOptions} ariaLabel={`Step ${index + 1} next`} /></Field>
        )}
      </div>
      {step.type === 'wait_until' && (
        <div className="mt-3"><OptionalLeaf leaf={step.filter} onChange={(filter) => set({ filter })} scopes="event.total" label={`Step ${index + 1} filter`} toggle="Only an event that matches" /></div>
      )}
      {step.type === 'branch' && (
        <div className="mt-3 space-y-3">
          {step.branches.map((b, k) => (
            <div key={k} className="rounded border border-app p-2">
              <p className="mb-2 text-xs text-app-muted">Rule {k + 1}: if</p>
              <LeafEditor leaf={b.when} onChange={(when) => set({ branches: step.branches.map((x, j) => (j === k ? { ...x, when } : x)) })} scopes="attributes.tier" label={`Step ${index + 1} rule ${k + 1}`} />
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select value={b.next} onChange={(next) => set({ branches: step.branches.map((x, j) => (j === k ? { ...x, next } : x)) })}
                  options={[{ value: '', label: 'go to…' }, ...others]} ariaLabel={`Step ${index + 1} rule ${k + 1} next`} />
                <Button onClick={() => set({ branches: step.branches.filter((_, j) => j !== k) })} disabled={step.branches.length === 1}>Remove rule</Button>
              </div>
            </div>
          ))}
          <Button onClick={() => set({ branches: [...step.branches, { when: emptyLeaf(), next: '' }] })}>Add rule</Button>
          <Field label="Otherwise go to"><Select value={step.otherwise} onChange={(otherwise) => set({ otherwise })} options={[{ value: '', label: 'go to…' }, ...others]} ariaLabel={`Step ${index + 1} otherwise`} /></Field>
        </div>
      )}
    </li>
  );
}

export interface JourneyEditorProps {
  /** Create a new journey, or publish a new version of an existing one. */
  target: { kind: 'create' } | { kind: 'version'; journeyId: string; journeyName: string };
  initialDefinition?: unknown;
}

export function JourneyEditor({ target, initialDefinition }: JourneyEditorProps): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const start = useMemo(() => (initialDefinition === undefined ? { ok: true as const, form: emptyForm() } : definitionToForm(initialDefinition)), [initialDefinition]);
  const [form, setForm] = useState<JourneyForm>(start.ok ? start.form : emptyForm());
  const [mode, setMode] = useState<'form' | 'json'>(start.ok ? 'form' : 'json');
  const [json, setJson] = useState(() => JSON.stringify(start.ok ? formToDefinition(start.form) : initialDefinition, null, 2));
  const [jsonNote, setJsonNote] = useState<string | null>(start.ok ? null : start.reason);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const templates = useQuery({ queryKey: ['engage', 'templates'], queryFn: listTemplates });
  const segments = useQuery({ queryKey: ['engage', 'segments'], queryFn: listSegments });

  const definition = (): unknown => {
    if (mode === 'form') return formToDefinition(form);
    try { return JSON.parse(json); } catch { throw new ApiIssues('The JSON is not valid', [{ path: '(json)', message: 'This is not valid JSON.' }]); }
  };
  const toJson = () => { setJson(JSON.stringify(formToDefinition(form), null, 2)); setJsonNote(null); setMode('json'); };
  const toForm = () => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { setJsonNote('This is not valid JSON.'); return; }
    const r = definitionToForm(parsed);
    if (!r.ok) { setJsonNote(`${r.reason} Keep editing it as JSON.`); return; }
    setForm(r.form); setMode('form'); setJsonNote(null);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setIssues([]); setMessage(null);
    try { await fn(); } catch (err) {
      if (err instanceof ApiIssues) { setIssues(err.issues.length ? err.issues : [{ path: '(root)', message: err.message }]); return; }
      const status = (err as { status?: number }).status;
      setMessage(status === 403 ? 'Only a tenant admin can save journeys.' : (err as Error).message);
    } finally { setBusy(false); }
  };
  const validate = () => run(async () => {
    const r = await validateJourney(definition());
    if (r.ok) setMessage('The journey is valid.'); else setIssues(r.errors);
  });
  const save = () => run(async () => {
    if (target.kind === 'create') {
      const r = await createJourney({ key: key.trim(), name: name.trim(), definition: definition() });
      await qc.invalidateQueries({ queryKey: ['engage', 'journeys'] });
      navigate(`/journeys/${r.journey.id}`);
    } else {
      await addJourneyVersion(target.journeyId, definition());
      await qc.invalidateQueries({ queryKey: ['engage', 'journeys'] });
      await qc.invalidateQueries({ queryKey: ['engage', 'journey', target.journeyId] });
      navigate(`/journeys/${target.journeyId}`);
    }
  });

  const t = form.trigger;
  const setTrigger = (patch: Partial<JourneyForm['trigger']>) => setForm({ ...form, trigger: { ...t, ...patch } });
  const setStep = (i: number, s: StepForm) => setForm({ ...form, steps: form.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...form.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + dir, 0, s!);
    setForm({ ...form, steps });
  };
  const segmentOptions = segments.data ?? [];
  const chosenSegment = segmentOptions.find((s) => s.key === t.segment);

  return (
    <div className="space-y-4" data-testid="journey-editor">
      {target.kind === 'create' && (
        <Card title="Journey">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Cart abandonment" ariaLabel="Journey name" /></Field>
            <Field label="Key" hint="used by the API trigger; lowercase, - and _"><TextInput value={key} onChange={setKey} placeholder="cart-abandonment" ariaLabel="Journey key" mono /></Field>
          </div>
        </Card>
      )}

      <div className="flex gap-2" role="tablist">
        <Button kind={mode === 'form' ? 'primary' : 'secondary'} onClick={() => (mode === 'json' ? toForm() : undefined)}>Form</Button>
        <Button kind={mode === 'json' ? 'primary' : 'secondary'} onClick={() => (mode === 'form' ? toJson() : undefined)}>JSON</Button>
      </div>

      {mode === 'json' ? (
        <Card title="Definition (JSON)">
          {jsonNote && <p className="mb-2 text-sm text-amber-700">{jsonNote}</p>}
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={24} spellCheck={false} aria-label="Journey definition JSON"
            className={`${inputClass} font-mono text-xs`} />
        </Card>
      ) : (
        <>
          <Card title="Start">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts when">
                <Select value={t.type} onChange={(type) => setTrigger({ type })} ariaLabel="Trigger" testId="trigger-type"
                  options={[{ value: 'event', label: 'An event arrives' }, { value: 'api', label: 'Your system calls the trigger API' }, { value: 'segment', label: 'On a schedule, for a segment' }]} />
              </Field>
              {t.type === 'event' && <Field label="Event"><TextInput value={t.event} onChange={(event) => setTrigger({ event })} placeholder="cart_updated" ariaLabel="Trigger event" mono /></Field>}
              {t.type === 'segment' && <>
                <Field label="Segment">
                  <Select value={t.segment} onChange={(segment) => setTrigger({ segment, segmentVersion: String(segmentOptions.find((s) => s.key === segment)?.latestVersion ?? 1) })} ariaLabel="Segment"
                    options={[{ value: '', label: segmentOptions.length ? 'Choose a segment' : 'No segments yet' }, ...segmentOptions.map((s) => ({ value: s.key, label: s.name }))]} />
                </Field>
                <Field label="Segment version" hint="pinned: a new audience needs a new journey version">
                  <Select value={t.segmentVersion} onChange={(segmentVersion) => setTrigger({ segmentVersion })} ariaLabel="Segment version"
                    options={Array.from({ length: Math.max(chosenSegment?.latestVersion ?? 0, Number(t.segmentVersion) || 1) }, (_, i) => ({ value: String(i + 1), label: `v${i + 1}` }))} />
                </Field>
                <Field label="Every (days)"><TextInput value={t.everyDays} onChange={(everyDays) => setTrigger({ everyDays })} ariaLabel="Every days" /></Field>
                <Field label="At (local time)" hint="HH:MM, in your time zone"><TextInput value={t.atLocalTime} onChange={(atLocalTime) => setTrigger({ atLocalTime })} ariaLabel="At local time" /></Field>
              </>}
            </div>
            {t.type === 'event' && <div className="mt-3"><OptionalLeaf leaf={t.filter} onChange={(filter) => setTrigger({ filter })} scopes="event.total or attributes.tier" label="Trigger filter" toggle="Only when the event or customer matches" /></div>}
            {t.type === 'api' && <p className="mt-2 text-xs text-app-muted">POST /v1/journeys/&lt;key&gt;/trigger with an idempotency key starts it for one customer.</p>}
          </Card>

          <Card title="Stop early">
            <p className="mb-2 text-xs text-app-muted">If one of these events happens after the customer entered (for example an order), the journey ends for them.</p>
            <ul className="space-y-2">
              {form.exitEvents.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <TextInput value={e} onChange={(v) => setForm({ ...form, exitEvents: form.exitEvents.map((x, j) => (j === i ? v : x)) })} ariaLabel={`Exit event ${i + 1}`} mono />
                  <Button onClick={() => setForm({ ...form, exitEvents: form.exitEvents.filter((_, j) => j !== i) })}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2"><Button onClick={() => setForm({ ...form, exitEvents: [...form.exitEvents, 'order_completed'] })}>Add exit event</Button></div>
          </Card>

          <Card title="Settings">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Can a customer enter again?">
                <Select value={form.reEntry} onChange={(reEntry) => setForm({ ...form, reEntry })} ariaLabel="Re-entry"
                  options={[{ value: 'never', label: 'No, once only' }, { value: 'after_exit', label: 'Yes, after the previous time ended' }]} />
              </Field>
              <Field label="Holdout (%)" hint="0–50; they get no messages, to measure the effect">
                <TextInput value={form.holdoutPercent} onChange={(holdoutPercent) => setForm({ ...form, holdoutPercent })} ariaLabel="Holdout percent" />
              </Field>
            </div>
          </Card>

          <Card title="Steps">
            <ol className="space-y-3">
              {form.steps.map((s, i) => (
                <StepEditor key={i} step={s} index={i} steps={form.steps} templates={(templates.data ?? []).map((x) => x.key)}
                  onChange={(n) => setStep(i, n)} onRemove={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} onMove={(d) => move(i, d)} />
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              {STEP_TYPES.map((type) => (
                <Button key={type} onClick={() => setForm({ ...form, steps: [...form.steps, newStep(type, form.steps)] })} testId={`add-${type}`}>+ {STEP_LABEL[type]}</Button>
              ))}
            </div>
          </Card>
        </>
      )}

      <Issues issues={issues} />
      {message && <p role="status" className="text-sm text-app">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={validate} disabled={busy}>Check</Button>
        <Button kind="primary" onClick={save} disabled={busy} testId="save-journey">
          {target.kind === 'create' ? 'Save as draft' : `Save as a new version of ${target.journeyName}`}
        </Button>
      </div>
      <p className="text-xs text-app-muted">Saved versions are drafts. Nothing runs until a tenant admin approves and activates the version.</p>
    </div>
  );
}
