/** The arguments of the WhatsApp live-check script (WP-27): strict, so a typo never reaches a real number. */
import { describe, expect, it } from 'vitest';
import { ArgError, DEFAULT_TEMPLATE, defaultParams, parseWhatsappCheckArgs } from '../../scripts/engageWhatsappCheckArgs.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACC = '22222222-2222-4222-8222-222222222222';
const base = ['--org', ORG, '--account', ACC, '--to', '+90 530 123 45 67'];

describe('engage:whatsapp-check arguments', () => {
  it('reads the required ones, tidies the number, and defaults to the sample template Meta gives a new test number, with its three values', () => {
    const a = parseWhatsappCheckArgs(base);
    expect(a).toMatchObject({ org: ORG, account: ACC, to: '+905301234567', template: 'jaspers_market_order_confirmation_v1', language: 'en_US', purpose: 'transactional', prepare: false, report: false, askMasterKey: false });
    expect(a.template).toBe(DEFAULT_TEMPLATE);
    expect(a.params).toHaveLength(3);
    expect(a.params.slice(0, 2)).toEqual(['John Doe', '123456']);
    expect(defaultParams(new Date('2026-11-22T10:00:00Z'))[2]).toBe('Nov 22, 2026');
  });
  it('takes the values for another template in order, and none when there are none', () => {
    expect(parseWhatsappCheckArgs([...base, '--template', 'cart_reminder', '--param', 'Ayşe', '--param', 'Kitapyurdu']).params).toEqual(['Ayşe', 'Kitapyurdu']);
    expect(parseWhatsappCheckArgs([...base, '--template', 'hello_world']).params).toEqual([]);
    expect(parseWhatsappCheckArgs([...base, '--param', 'only']).params).toEqual(['only']);
  });
  it('takes the flags and the options', () => {
    expect(parseWhatsappCheckArgs([...base, '--prepare', '--ask-master-key', '--template', 'cart_reminder', '--language', 'tr', '--purpose', 'marketing'])).toMatchObject({
      prepare: true, askMasterKey: true, template: 'cart_reminder', language: 'tr', purpose: 'marketing',
    });
    expect(parseWhatsappCheckArgs([...base, '--report']).report).toBe(true);
  });
  it.each([
    ['no org', ['--account', ACC, '--to', '+905301234567']],
    ['an org that is not a UUID', ['--org', 'abc', '--account', ACC, '--to', '+905301234567']],
    ['a number without the plus sign', ['--org', ORG, '--account', ACC, '--to', '905301234567']],
    ['a local number', ['--org', ORG, '--account', ACC, '--to', '0530 123 45 67']],
    ['a template with capitals', [...base, '--template', 'Hello World']],
    ['a bad language', [...base, '--language', 'Turkish']],
    ['an unknown purpose', [...base, '--purpose', 'promo']],
    ['an empty value', [...base, '--param', '']],
    ['too many values', [...base, ...Array.from({ length: 21 }, () => ['--param', 'x']).flat()]],
    ['an unknown option', [...base, '--live']],
    ['an option without a value', [...base, '--template']],
    ['a stray word', [...base, 'now']],
  ])('refuses %s', (_what, argv) => { expect(() => parseWhatsappCheckArgs(argv)).toThrow(ArgError); });

  describe('webhook diagnosis', () => {
    const noTo = ['--org', ORG, '--account', ACC];
    it('needs the account id, and sends nothing so it needs no number', () => {
      expect(parseWhatsappCheckArgs([...noTo, '--webhooks', '--waba', '1886292205754470'])).toMatchObject({ webhooks: true, subscribe: false, waba: '1886292205754470', to: '' });
      expect(parseWhatsappCheckArgs([...noTo, '--webhooks', '--waba', '1886292205754470', '--subscribe']).subscribe).toBe(true);
    });
    it.each([
      ['no account id', [...noTo, '--webhooks']],
      ['an account id that is not digits', [...noTo, '--webhooks', '--waba', 'abc']],
      ['--subscribe on its own', [...noTo, '--to', '+905301234567', '--subscribe']],
      ['--waba without --webhooks', [...noTo, '--to', '+905301234567', '--waba', '1886292205754470']],
    ])('refuses %s', (_w, argv) => { expect(() => parseWhatsappCheckArgs(argv)).toThrow(ArgError); });
    it('still needs a number for a send', () => { expect(() => parseWhatsappCheckArgs(noTo)).toThrow(ArgError); });
  });

  it('WP-40: --templates and --rotate need no number; --rotate takes --config and keeps ids as text', () => {
    const ids = ['--org', ORG, '--account', ACC];
    expect(parseWhatsappCheckArgs([...ids, '--templates'])).toMatchObject({ templates: true, to: '', rotate: false });
    const r = parseWhatsappCheckArgs([...ids, '--rotate', '--config', 'waba_id=1234567890123456789', '--config', 'daily_recipient_limit=2000']);
    expect(r).toMatchObject({ rotate: true, config: { waba_id: '1234567890123456789', daily_recipient_limit: 2000 } });
    expect(() => parseWhatsappCheckArgs([...ids, '--rotate', '--config', 'waba_id=abc'])).toThrow(/digits/);
    expect(() => parseWhatsappCheckArgs([...ids, '--templates', '--config', 'waba_id=1'])).toThrow(/--config goes with --rotate/);
    expect(() => parseWhatsappCheckArgs([...ids, '--templates', '--rotate'])).toThrow(/one of/);
    expect(() => parseWhatsappCheckArgs([...ids, '--templates', '--prepare'])).toThrow(/one of/);
    expect(parseWhatsappCheckArgs([...base, '--prepare']).prepare).toBe(true);
  });
  it('WP-40: takes a header value and a URL-button value for the send', () => {
    const a = parseWhatsappCheckArgs([...base, '--template', 'autumn_offer', '--language', 'tr', '--param', 'Ayşe', '--header-param', 'Ekim', '--button-param', 'ab12', '--purpose', 'marketing']);
    expect(a).toMatchObject({ headerParam: 'Ekim', buttonParam: 'ab12', params: ['Ayşe'] });
    expect(parseWhatsappCheckArgs(base)).toMatchObject({ headerParam: null, buttonParam: null });
  });
});

