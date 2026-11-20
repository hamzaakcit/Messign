/**
 * The sender name (migration 130) without a database: the renderer fills {{sender_name}} as a system value, refuses it
 * when it is missing or given a default, and the input rules refuse markup, braces and line breaks before anything is stored.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/ai/gateway.js', () => ({ generateText: vi.fn(), AiBudgetExceededError: class extends Error {} }));

const { parseTemplate, renderTemplate } = await import('../../engage/templates/render.js');
const { setSenderName } = await import('../../engage/settings/settings.js');
const { SettingsInputError } = await import('../../engage/settings/settings.js');
const { gateDraftCopy } = await import('../../engage/copy/copyDraft.js');
const { senderIdentityMismatch } = await import('../../engage/messaging/gate.js');

const ORG = '00000000-0000-4000-8000-000000000000';

describe('{{sender_name}} in templates', () => {
  it('is a system value: filled from the tenant, and reported as such', () => {
    const t = parseTemplate({ subject: 'Merhaba', html: '<p>Sevgiyle,</p><p>{{sender_name}}</p>', text: null });
    expect(t.variables).toEqual([{ name: 'sender_name', source: 'system', defaultValue: null }]);
    const r = renderTemplate(t, { attributes: {}, payload: {}, system: { sender_name: 'Kitapyurdu' } });
    expect(r.ok && r.html).toContain('<p>Kitapyurdu</p>');
  });

  it('is refused at render time when the tenant has not set a name (no blank or made-up name is sent)', () => {
    const t = parseTemplate({ subject: 'Konu', html: '<p>{{sender_name}}</p>', text: null });
    const r = renderTemplate(t, { attributes: {}, payload: {}, system: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'missing_variable', variable: 'sender_name' });
  });

  it('cannot carry a fallback: the sender name is never guessed', () => {
    expect(() => parseTemplate({ subject: 'Konu', html: '<p>{{sender_name | default: "Biz"}}</p>', text: null })).toThrow(/cannot have a default/);
  });
});

describe('{{sender_name}} in drafted copy', () => {
  it('is allowed in a sign-off for both marketing and transactional mail', () => {
    const copy = { subject: 'Konu', html: '<p>Teşekkürler.</p><p>{{sender_name}}</p>', text: null };
    expect(gateDraftCopy(copy, 'transactional').ok).toBe(true);
    const marketing = gateDraftCopy({ ...copy, html: `${copy.html}<a href="{{unsubscribe_url}}">x</a>` }, 'marketing');
    expect(marketing.ok).toBe(true);
  });

  it('is not a way to write a made-up name with a fallback', () => {
    const r = gateDraftCopy({ subject: 'Konu', html: '<p>{{sender_name | default: "Biz"}}</p><a href="{{unsubscribe_url}}">x</a>', text: null }, 'marketing');
    expect(r.ok).toBe(false);
  });
});

describe('setting the sender name: input rules (before anything is stored)', () => {
  it.each([
    ['markup', '<b>Kitap</b>'],
    ['braces', 'Kitap {{x}}'],
    ['a line break', 'Kitap\nYurdu'],
    ['too long', 'a'.repeat(81)],
    ['not text', 42],
  ])('refuses %s', async (_label, value) => {
    await expect(setSenderName(ORG, 'user', value)).rejects.toBeInstanceOf(SettingsInputError);
  });
});

describe('one sender identity: the From name must match the name the text is signed with (ADR-019)', () => {
  it('a mismatch is refused only when both names are set and differ', () => {
    expect(senderIdentityMismatch('Başka Mağaza', 'Kitapyurdu')).toBe(true);
    expect(senderIdentityMismatch('Kitapyurdu', 'Kitapyurdu')).toBe(false);
    expect(senderIdentityMismatch('Kitapyurdu', 'kitapyurdu')).toBe(true);
    expect(senderIdentityMismatch('  Kitap   Yurdu ', 'Kitap Yurdu')).toBe(false);
  });

  it('quotes are not a difference: the From name strips them, and so does the comparison', () => {
    expect(senderIdentityMismatch('"Kitap" Yurdu', 'Kitap Yurdu')).toBe(false);
    expect(senderIdentityMismatch('Kitap Yurdu', 'Kitap "Yurdu"')).toBe(false);
  });

  it('is not a mismatch when either name is missing (no name is never a made-up one)', () => {
    expect(senderIdentityMismatch('Kitapyurdu', null)).toBe(false);
    expect(senderIdentityMismatch(undefined, 'Kitapyurdu')).toBe(false);
    expect(senderIdentityMismatch('   ', 'Kitapyurdu')).toBe(false);
    expect(senderIdentityMismatch(42, 'Kitapyurdu')).toBe(false);
  });
});
