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
});
