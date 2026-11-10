import { definitionToForm, describeStep, emptyForm, formToDefinition, newStep, parseValue } from '@/engage/journeyForm';

const cart = {
  trigger: { type: 'event', event: 'cart_updated', filter: { field: 'event.total', op: 'gte', value: 100 } },
  exit_when: [{ event: 'order_completed' }],
  re_entry: 'after_exit',
  holdout_percent: 10,
  steps: [
    { id: 'wait-1h', type: 'delay', minutes: 60 },
    { id: 'route', type: 'branch', branches: [{ when: { field: 'attributes.tier', op: 'in', value: ['gold', 'silver'] }, next: 'gold' }], otherwise: 'reminder' },
    { id: 'gold', type: 'message', channel: 'email', template: 'cart-gold', template_version: 2, purpose: 'marketing', next: 'done' },
    { id: 'reminder', type: 'message', channel: 'email', template: 'cart-reminder-1', purpose: 'marketing' },
    { id: 'checkout', type: 'wait_until', event: 'checkout_started', filter: { field: 'event.cart_id', op: 'exists' }, timeout_minutes: 1440, on_timeout: 'exit' },
    { id: 'done', type: 'exit' },
  ],
};
const segment = {
  trigger: { type: 'segment', segment: 'lapsed', segment_version: 3, every_days: 7, at_local_time: '10:00' },
  exit_when: [], re_entry: 'never', holdout_percent: 0,
  steps: [{ id: 'm', type: 'message', channel: 'email', template: 'winback', purpose: 'marketing' }],
};

describe('journey builder form model (WP-20)', () => {
  it('round-trips a definition through the form unchanged (event trigger, filter, branch, pinned template, wait, exit)', () => {
    const r = definitionToForm(cart);
    expect(r.ok).toBe(true);
    if (r.ok) expect(formToDefinition(r.form)).toEqual(cart);
  });

  it('round-trips the scheduled segment trigger and the API trigger', () => {
    const s = definitionToForm(segment);
    expect(s.ok && formToDefinition(s.form)).toEqual(segment);
    const api = { trigger: { type: 'api' }, exit_when: [], re_entry: 'never', holdout_percent: 10, steps: [{ id: 'x', type: 'exit' }] };
    const a = definitionToForm(api);
    expect(a.ok && formToDefinition(a.form)).toEqual(api);
  });

  it('defaults what an older definition leaves out (holdout 10, re-entry never, no exits)', () => {
    const r = definitionToForm({ trigger: { type: 'api' }, steps: [{ id: 'x', type: 'exit' }] });
    expect(r.ok && formToDefinition(r.form)).toMatchObject({ exit_when: [], re_entry: 'never', holdout_percent: 10 });
  });

  it('sends richer definitions to the JSON editor instead of dropping anything', () => {
    const tree = { all: [{ field: 'attributes.a', op: 'exists' }, { field: 'attributes.b', op: 'exists' }] };
    expect(definitionToForm({ ...cart, trigger: { type: 'event', event: 'x', filter: tree } })).toMatchObject({ ok: false, reason: expect.stringMatching(/trigger filter/) });
    expect(definitionToForm({ ...cart, exit_when: [{ event: 'order_completed', filter: { field: 'event.x', op: 'exists' } }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/exit condition/) });
    expect(definitionToForm({ ...cart, steps: [{ id: 'b', type: 'branch', branches: [{ when: tree, next: 'x' }], otherwise: 'x' }] })).toMatchObject({ ok: false });
    expect(definitionToForm({ trigger: { type: 'date_attribute', attribute: 'birthday', offset_days: 0, at_local_time: '09:00' }, steps: [] })).toMatchObject({ ok: false, reason: expect.stringMatching(/no form/) });
    expect(definitionToForm('nope')).toMatchObject({ ok: false });
  });

  it('reads values the way a marketer types them', () => {
    expect(parseValue('42')).toBe(42);
    expect(parseValue('-1.5')).toBe(-1.5);
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
    expect(parseValue('gold')).toBe('gold');
    expect(parseValue('"42"')).toBe('42');
    expect(parseValue('İstanbul')).toBe('İstanbul');
    // A string that looks like a number keeps its quotes in the form, so it survives a round trip as a string.
    const r = definitionToForm({ ...segment, trigger: { type: 'event', event: 'x', filter: { field: 'event.code', op: 'eq', value: '007' } } });
    expect(r.ok && formToDefinition(r.form)).toMatchObject({ trigger: { filter: { value: '007' } } });
  });

  it('a new form is a sensible start, and new steps get unique ids', () => {
    const f = emptyForm();
    expect(formToDefinition(f)).toMatchObject({ trigger: { type: 'event', event: 'cart_updated' }, holdout_percent: 10, steps: [{ id: 'wait', type: 'delay', minutes: 60 }] });
    const a = newStep('message', f.steps);
    const b = newStep('message', [...f.steps, a]);
    expect(a.id).not.toBe(b.id);
    expect(newStep('wait_until', []).id).toMatch(/^wait-until-/);
  });

  it('a number field left empty or with text becomes NaN in the definition, which the server rejects with a field message', () => {
    const f = emptyForm();
    f.steps[0]!.minutes = 'an hour';
    expect((formToDefinition(f).steps as Array<{ minutes: number }>)[0]!.minutes).toBeNaN();
  });

  it('describes steps in a line', () => {
    expect(describeStep(newStep('delay', []))).toBe('Wait 60 minutes');
    expect(describeStep({ ...newStep('message', []), template: 'hello', templateVersion: '2' })).toBe('Send email "hello" v2 (marketing)');
    expect(describeStep(newStep('exit', []))).toBe('End the journey');
  });
});
