/**
 * WhatsApp templates in the platform (WP-40a, ADR-025), pure parts: the registration rules, rendering, the template listing and
 * status webhook parsing, the shape check, and the send body with header and URL button values.
 */
import { describe, expect, it } from 'vitest';
import { AdapterError } from '../../engage/messaging/adapter.js';
import {
  buildSendBody, dailyRecipientLimit, normalizeLanguage, parseRemoteTemplate, parseTemplateListPage, parseTemplateStatusUpdates, readConfig,
} from '../../engage/whatsapp/format.js';
import { WaTemplateSyntaxError, checkWhatsappContent, cleanParameter, renderWhatsapp, type WaTemplateContent } from '../../engage/whatsapp/render.js';
import { effectOfEvent, effectiveCategory, mappingProblems, mappingOf, bodyTextDiffers } from '../../engage/whatsapp/templateStatus.js';
import { healthOf } from '../../engage/whatsapp/templates.js';
import { templateStatusPayload } from '../../engage/whatsapp/mock/mockGraphServer.js';

const base = {
  metaName: 'cart_reminder', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply',
  bodyText: 'Merhaba {{1}}, sepetinde {{2}} kaldı.',
  variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'değerli müşterimiz' }, { source: 'payload', name: 'book' }],
};
const code = (fn: () => unknown): string => {
  try { fn(); } catch (err) { if (err instanceof WaTemplateSyntaxError) return err.code; throw err; }
  return 'no error';
};

describe('registering a WhatsApp template', () => {
  it('accepts a positional body with every variable mapped, in order', () => {
    const c = checkWhatsappContent(base);
    expect(c.variables).toEqual([
      { position: 1, source: 'attribute', name: 'first_name', defaultValue: 'değerli müşterimiz' },
      { position: 2, source: 'payload', name: 'book', defaultValue: null },
    ]);
    expect(c.header).toBeNull();
    expect(c.urlButton).toBeNull();
  });
  it.each([
    [{ ...base, metaName: 'Cart Reminder' }, 'invalid_meta_name'],
    [{ ...base, language: 'Turkish' }, 'invalid_language'],
    [{ ...base, declaredCategory: 'authentication' }, 'invalid_category'],
    [{ ...base, optOut: 'maybe' }, 'invalid_opt_out'],
    [{ ...base, bodyText: '' }, 'invalid_body'],
    [{ ...base, bodyText: 'x'.repeat(1025) }, 'invalid_body'],
    [{ ...base, bodyText: 'Merhaba {{first_name}}' }, 'named_parameters_unsupported'],
    [{ ...base, bodyText: 'Merhaba {{1}} ve {{3}}' }, 'variables_not_consecutive'],
    [{ ...base, variables: [base.variables[0]] }, 'variable_count_mismatch'],
    [{ ...base, variables: [...base.variables, { source: 'attribute', name: 'x' }] }, 'variable_count_mismatch'],
    [{ ...base, variables: [{ source: 'profile', name: 'x' }, base.variables[1]] }, 'invalid_variable'],
    [{ ...base, variables: [{ source: 'system', name: 'unsubscribe_url' }, base.variables[1]] }, 'invalid_variable'],
    [{ ...base, variables: [{ source: 'system', name: 'sender_name', defaultValue: 'x' }, base.variables[1]] }, 'invalid_variable'],
    [{ ...base, variables: [{ source: 'attribute', name: 'a', defaultValue: 'two\nlines' }, base.variables[1]] }, 'invalid_variable'],
    [{ ...base, variables: [{ source: 'attribute', name: 'a', defaultValue: '{{1}}' }, base.variables[1]] }, 'invalid_variable'],
    [{ ...base, header: { text: 'Merhaba {{1}} {{2}}', variable: { source: 'attribute', name: 'a' } } }, 'invalid_header'],
    [{ ...base, header: { text: 'Merhaba {{1}}' } }, 'invalid_header'],
    [{ ...base, header: { text: 'Merhaba', variable: { source: 'attribute', name: 'a' } } }, 'invalid_header'],
    [{ ...base, header: { text: 'x'.repeat(61) } }, 'invalid_header'],
    [{ ...base, urlButton: { baseUrl: 'http://shop.example.com/c/', variable: { source: 'payload', name: 'cart_id' } } }, 'invalid_url_button'],
    [{ ...base, urlButton: { baseUrl: 'https://shop.example.com/c/', index: 2, variable: { source: 'payload', name: 'cart_id' } } }, 'invalid_url_button'],
  ])('refuses %j', (input, expected) => {
    expect(code(() => checkWhatsappContent(input))).toBe(expected);
  });
  it('accepts a header with one variable and a URL button', () => {
    const c = checkWhatsappContent({
      ...base, header: { text: 'Sepetin, {{1}}', variable: { source: 'attribute', name: 'first_name', defaultValue: 'merhaba' } },
      urlButton: { index: 1, baseUrl: 'https://shop.example.com/cart/', variable: { source: 'payload', name: 'cart_id' } },
    });
    expect(c.header?.variable).toEqual({ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' });
    expect(c.urlButton).toEqual({ index: 1, baseUrl: 'https://shop.example.com/cart/', variable: { source: 'payload', name: 'cart_id', defaultValue: null } });
  });
});

describe('rendering', () => {
  const content = checkWhatsappContent({
    ...base, header: { text: 'Sepetin, {{1}}', variable: { source: 'system', name: 'sender_name' } },
    urlButton: { baseUrl: 'https://shop.example.com/cart/', variable: { source: 'payload', name: 'cart_id' } },
  });
  it('fills values from the customer, the trigger and the tenant, in position order', () => {
    const r = renderWhatsapp(content, { attributes: { first_name: 'Ayşe' }, payload: { book: 'Kürk Mantolu Madonna', cart_id: 'c 42/ş' }, system: { sender_name: 'Kitapyurdu' } });
    expect(r).toEqual({
      ok: true, bodyParameters: ['Ayşe', 'Kürk Mantolu Madonna'], headerParameter: 'Kitapyurdu', urlButtonParameter: 'c%2042%2F%C5%9F',
      preview: { header: 'Sepetin, Kitapyurdu', body: 'Merhaba Ayşe, sepetinde Kürk Mantolu Madonna kaldı.', buttonUrl: 'https://shop.example.com/cart/c%2042%2F%C5%9F' },
    });
  });
  it('uses the default when the value is missing or blank, and fails without one', () => {
    const ok = renderWhatsapp(content, { attributes: { first_name: '   ' }, payload: { book: 'x', cart_id: '1' }, system: { sender_name: 'K' } });
    expect(ok.ok && ok.bodyParameters[0]).toBe('değerli müşterimiz');
    const bad = renderWhatsapp(content, { attributes: {}, payload: { cart_id: '1' }, system: {} });
    expect(bad).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'payload.book' }, { code: 'missing_variable', variable: 'sender_name' }] });
  });
  it('cleans what Meta refuses in a parameter: line breaks, tabs and runs of spaces', () => {
    expect(cleanParameter('Ayşe\nYılmaz\t\t  Hanım ')).toBe('Ayşe Yılmaz Hanım');
    const r = renderWhatsapp(content, { attributes: { first_name: 'A\r\nB' }, payload: { book: 'x     y', cart_id: '1' }, system: { sender_name: 'K' } });
    expect(r.ok && r.bodyParameters).toEqual(['A B', 'x y']);
  });
  it('refuses values that are too long instead of cutting them', () => {
    const r = renderWhatsapp(content, { attributes: {}, payload: { book: 'x'.repeat(1001), cart_id: '1' }, system: { sender_name: 'K'.repeat(61) } });
    expect(r).toEqual({ ok: false, errors: [{ code: 'value_too_long', variable: 'payload.book' }, { code: 'value_too_long', variable: 'sender_name' }] });
  });
  it('ignores objects and lists as values', () => {
    const r = renderWhatsapp(content, { attributes: { first_name: { a: 1 } }, payload: { book: ['x'], cart_id: 7 }, system: { sender_name: 'K' } });
    expect(r).toEqual({ ok: false, errors: [{ code: 'missing_variable', variable: 'payload.book' }] });
  });
});

describe('Meta\'s template listing', () => {
  const entry = {
    id: '1234567890', name: 'cart_reminder', language: 'en_US', status: 'APPROVED', category: 'MARKETING', parameter_format: 'POSITIONAL',
    quality_score: { score: 'GREEN' }, last_updated_time: '2026-11-20T10:00:00+0000',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
      { type: 'BODY', text: 'Your {{1}} is waiting, {{2}}. {{1}} again.' },
      { type: 'FOOTER', text: 'Reply STOP' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Stop' }, { type: 'URL', text: 'Open', url: 'https://x.example.com/c/{{1}}' }] },
    ],
  };
  it('reads status, category, quality and the shape (distinct variables, buttons)', () => {
    expect(parseRemoteTemplate(entry)).toEqual({
      providerTemplateId: '1234567890', name: 'cart_reminder', language: 'en_US', status: 'APPROVED', category: 'MARKETING', correctCategory: null,
      quality: 'GREEN', rejectedReason: null, changedAt: new Date('2026-11-20T10:00:00Z'),
      shape: { bodyText: 'Your {{1}} is waiting, {{2}}. {{1}} again.', bodyVariables: 2, headerFormat: 'TEXT', headerText: 'Hi {{1}}', headerVariables: 1, urlButtonVariables: 1, buttons: ['QUICK_REPLY', 'URL'], parameterFormat: 'POSITIONAL' },
    });
  });
  it('notes a media header and named parameters, and skips entries it cannot read', () => {
    const t = parseRemoteTemplate({ ...entry, parameter_format: 'NAMED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi {{first_name}}' }] });
    expect(t?.shape).toMatchObject({ headerFormat: 'IMAGE', headerVariables: 0, bodyVariables: 1, parameterFormat: 'NAMED' });
    expect(parseRemoteTemplate({ ...entry, name: 'Bad Name' })).toBeNull();
    expect(parseRemoteTemplate({ ...entry, language: 'Turkish' })).toBeNull();
    expect(parseRemoteTemplate({ ...entry, status: 42 })).toBeNull();
  });
  it('pages by paging.next and refuses a body without data', () => {
    expect(parseTemplateListPage({ data: [entry], paging: { next: 'https://graph.facebook.com/v23.0/1/message_templates?after=x' } }).next).toContain('after=x');
    expect(parseTemplateListPage({ data: [] }).next).toBeNull();
    expect(() => parseTemplateListPage({ error: {} })).toThrow(AdapterError);
  });
  it('normalizes languages the way the send API writes them', () => {
    expect(normalizeLanguage('en-US')).toBe('en_US');
    expect(normalizeLanguage('TR')).toBe('tr');
    expect(normalizeLanguage('pt_br')).toBe('pt_BR');
    expect(normalizeLanguage('english')).toBeNull();
  });
});

describe('Meta\'s template status webhook', () => {
  const at = Date.UTC(2026, 10, 23, 12, 0, 0);
  it('reads a status change for the account\'s own WhatsApp Business Account only', () => {
    const body = templateStatusPayload({ wabaId: '555000', id: '987', name: 'cart_reminder', language: 'en_US', event: 'PAUSED', reason: 'NONE', category: 'MARKETING', at });
    expect(parseTemplateStatusUpdates(body, '555000')).toEqual([{
      key: `987:PAUSED:${at / 1000}`, name: 'cart_reminder', language: 'en_US', providerTemplateId: '987', event: 'PAUSED', category: 'MARKETING', reason: 'NONE', occurredAt: new Date(at),
    }]);
    expect(parseTemplateStatusUpdates(body, '999999')).toEqual([]);
    expect(parseTemplateStatusUpdates(body, null)).toEqual([]);
  });
  it('ignores other fields and refuses a malformed status change', () => {
    expect(parseTemplateStatusUpdates({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: {} }] }] }, '1')).toEqual([]);
    const bad = templateStatusPayload({ wabaId: '1', id: '9', name: 'x', language: 'tr', event: 'APPROVED', at });
    (bad.entry[0]!.changes[0]!.value as Record<string, unknown>).message_template_name = 'Not A Name';
    expect(() => parseTemplateStatusUpdates(bad, '1')).toThrow(AdapterError);
    expect(() => parseTemplateStatusUpdates({ object: 'page' }, '1')).toThrow(AdapterError);
  });
  it('maps events to the mirror', () => {
    expect(effectOfEvent('PAUSED')).toEqual({ status: 'PAUSED' });
    expect(effectOfEvent('REINSTATED')).toEqual({ status: 'APPROVED' });
    expect(effectOfEvent('FLAGGED')).toEqual({ quality: 'FLAGGED' });
    expect(effectOfEvent('UNARCHIVED')).toBeNull();
    expect(effectOfEvent('SOMETHING_NEW')).toBeNull();
  });
});

describe('the shape check and category', () => {
  const c = checkWhatsappContent(base) as WaTemplateContent;
  const shape = { bodyText: base.bodyText, bodyVariables: 2, headerFormat: null, headerVariables: 0, urlButtonVariables: 0, buttons: ['QUICK_REPLY'], parameterFormat: 'POSITIONAL' as const };
  it('finds every way Meta would refuse the values', () => {
    expect(mappingProblems(mappingOf(c), shape)).toEqual([]);
    expect(mappingProblems(mappingOf(c), {})).toEqual([]); // shape unknown: nothing to compare
    expect(mappingProblems(mappingOf(c), { ...shape, bodyVariables: 3 })).toEqual(['body_variable_count']);
    expect(mappingProblems(mappingOf(c), { ...shape, headerFormat: 'IMAGE' })).toEqual(['unsupported_header']);
    expect(mappingProblems(mappingOf(c), { ...shape, headerFormat: 'TEXT', headerVariables: 1 })).toEqual(['header_variable_count']);
    expect(mappingProblems(mappingOf(c), { ...shape, urlButtonVariables: 1 })).toEqual(['url_button_variable_count']);
    expect(mappingProblems(mappingOf(c), { ...shape, buttons: ['COPY_CODE'] })).toEqual(['unsupported_button']);
    expect(mappingProblems(mappingOf(c), { ...shape, parameterFormat: 'NAMED' })).toEqual(['named_parameters_unsupported']);
  });
  it('takes Meta\'s category, corrected if Meta recategorized, over the declaration', () => {
    expect(effectiveCategory(null, 'utility')).toBe('utility');
    expect(effectiveCategory({ category: 'MARKETING', correctCategory: null }, 'utility')).toBe('marketing');
    expect(effectiveCategory({ category: 'UTILITY', correctCategory: 'MARKETING' }, 'utility')).toBe('marketing');
    expect(effectiveCategory({ category: 'AUTHENTICATION', correctCategory: null }, 'utility')).toBe('authentication');
  });
  it('reports health: approved and fitting is sendable; differences are warnings', () => {
    const status = { metaName: 'cart_reminder', language: 'tr', providerTemplateId: '1', status: 'APPROVED', category: 'UTILITY', correctCategory: null, quality: 'GREEN', rejectedReason: null, shape: { ...shape, bodyText: 'Other text {{1}} {{2}}' }, source: 'sync' as const, changedAt: '', seenAt: '' };
    expect(healthOf(c, status)).toMatchObject({ sendable: true, category: 'utility', problems: [], warnings: ['meta_category_differs', 'body_text_differs'] });
    expect(healthOf(c, { ...status, status: 'PAUSED' })).toMatchObject({ sendable: false, problems: ['not_approved'] });
    expect(healthOf(c, null)).toMatchObject({ sendable: false, problems: ['status_unknown'], category: 'marketing' });
    expect(bodyTextDiffers(c, { bodyText: 'Merhaba  {{1}}, sepetinde {{2}} kaldı. ' })).toBe(false);
  });
});

describe('the send body and account config', () => {
  it('sends header, body and URL button values in Meta\'s documented order and shapes', () => {
    const b = buildSendBody('+905001112233', { template: 'cart_reminder', language: 'tr', header_parameter: 'Ayşe', body_parameters: ['a', 'b'], url_button_parameter: 'c%2042', url_button_index: '1' }, 'tr');
    expect((b.template as Record<string, unknown>).components).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Ayşe' }] },
      { type: 'body', parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'c%2042' }] },
    ]);
  });
  it.each([
    { header_parameter: '' }, { header_parameter: 'x'.repeat(61) }, { url_button_parameter: 'has space' }, { url_button_parameter: 'a"b' },
    { url_button_parameter: 'ok', url_button_index: '2' },
  ])('refuses %j', (extra) => {
    expect(() => buildSendBody('+905001112233', { template: 'cart_reminder', ...extra }, 'tr')).toThrow(AdapterError);
  });
  it('reads the WhatsApp Business Account id and the daily recipient limit', () => {
    expect(readConfig({ phone_number_id: '106540352242922', waba_id: '102290129340398' }).wabaId).toBe('102290129340398');
    expect(() => readConfig({ phone_number_id: '106540352242922', waba_id: 'abc' })).toThrow(AdapterError);
    expect(dailyRecipientLimit({})).toBe(250);
    expect(dailyRecipientLimit({ daily_recipient_limit: 2000 })).toBe(2000);
    expect(dailyRecipientLimit({ daily_recipient_limit: '10000' })).toBe(10000);
    expect(dailyRecipientLimit({ daily_recipient_limit: -5 })).toBe(250);
  });
});
