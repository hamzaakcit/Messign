/**
 * WhatsApp Cloud API rules (WP-27) without a network or a database: the Messages API body, Graph error codes, opt-out words,
 * the webhook signature and handshake, and how Meta's webhook payloads become delivery reports and customer messages. The
 * shapes follow Meta's official documentation (developers.facebook.com, WhatsApp Business Platform).
 */
import { describe, expect, it } from 'vitest';
import { AdapterError } from '../../engage/messaging/adapter.js';
import {
  answerChallenge, buildSendBody, classifyError, foldWord, graphErrorCode, isOptOutText, parseWebhookPayload, readConfig, signBody, signatureMatches,
} from '../../engage/whatsapp/format.js';
import { preferencePayload, statusPayload, textPayload } from '../../engage/whatsapp/mock/mockGraphServer.js';

const PN = '106540352242922';

describe('account config', () => {
  it('needs a numeric phone number id, and defaults the version and language', () => {
    expect(readConfig({ phone_number_id: '106540352242922' })).toEqual({ phoneNumberId: PN, apiVersion: 'v23.0', defaultLanguage: 'tr' });
    expect(readConfig({ phone_number_id: 106540352242922, api_version: 'v27.0', default_language: 'en_US' })).toMatchObject({ apiVersion: 'v27.0', defaultLanguage: 'en_US' });
  });
  it.each([{}, { phone_number_id: 'abc' }, { phone_number_id: '1' }, { phone_number_id: PN, api_version: '23' }, { phone_number_id: PN, default_language: 'Turkish' }])('refuses %j', (c) => {
    expect(() => readConfig(c as Record<string, string>)).toThrow(AdapterError);
  });
});

describe('the Messages API body', () => {
  it('a template message names the template, its language and the positional body variables', () => {
    expect(buildSendBody('+905301234567', { template: 'cart_reminder', language: 'tr', body_parameters: ['Ayşe', 'Kitapyurdu'] }, 'en')).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '+905301234567', type: 'template',
      template: { name: 'cart_reminder', language: { code: 'tr' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ayşe' }, { type: 'text', text: 'Kitapyurdu' }] }] },
    });
  });
  it('uses the account\'s default language and leaves out components when there are no variables', () => {
    expect(buildSendBody('+905301234567', { template: 'hello_world' }, 'tr')).toMatchObject({ type: 'template', template: { name: 'hello_world', language: { code: 'tr' } } });
    expect((buildSendBody('+905301234567', { template: 'hello_world' }, 'tr').template as Record<string, unknown>).components).toBeUndefined();
  });
  it('a text message is plain, without a link preview', () => {
    expect(buildSendBody('+905301234567', { text: 'Siparişiniz yola çıktı.' }, 'tr')).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '+905301234567', type: 'text', text: { preview_url: false, body: 'Siparişiniz yola çıktı.' },
    });
  });
  it.each([
    ['a phone number that is not E.164', '0530 123 45 67', { template: 'x' }, 'whatsapp_recipient_invalid'],
    ['a template with capitals', '+905301234567', { template: 'Cart_Reminder' }, 'whatsapp_template_invalid'],
    ['a template that is not text', '+905301234567', { template: 5 }, 'whatsapp_template_invalid'],
    ['a bad language', '+905301234567', { template: 'x', language: 'Turkish' }, 'whatsapp_language_invalid'],
    ['a variable that is empty', '+905301234567', { template: 'x', body_parameters: ['a', ''] }, 'whatsapp_parameters_invalid'],
    ['variables that are not a list', '+905301234567', { template: 'x', body_parameters: 'a' }, 'whatsapp_parameters_invalid'],
    ['a number as a variable', '+905301234567', { template: 'x', body_parameters: [5] }, 'whatsapp_parameters_invalid'],
    ['no content', '+905301234567', {}, 'whatsapp_content_invalid'],
    ['blank text', '+905301234567', { text: '   ' }, 'whatsapp_content_invalid'],
  ])('refuses %s, as final', (_what, to, content, code) => {
    try { buildSendBody(to, content as Record<string, unknown>, 'tr'); expect.unreachable(); } catch (e) { expect(e).toMatchObject({ kind: 'permanent', code }); }
  });
});

describe('Graph error codes', () => {
  it('retries downtime and rate limits', () => {
    for (const code of [2, 4, 80007, 130429, 131000, 131016, 131056, 131057, 133004]) expect(classifyError(code, 400), String(code)).toEqual({ kind: 'transient', code: `wa_${code}`, optOut: false });
  });
  it('treats a recipient who stopped marketing as final and as an opt-out', () => {
    expect(classifyError(131050, 400)).toEqual({ kind: 'permanent', code: 'wa_131050', optOut: true });
  });
  it('treats credentials, templates, windows and undeliverable numbers as final, without an opt-out', () => {
    for (const code of [190, 0, 10, 131005, 132000, 132001, 132015, 131047, 131026, 131049, 131048, 130403, 368, 100, 131008, 131009]) {
      expect(classifyError(code, 400), String(code)).toEqual({ kind: 'permanent', code: `wa_${code}`, optOut: false });
    }
  });
  it('falls back to the HTTP status for a code that is not in the table or missing', () => {
    expect(classifyError(999999, 500)).toMatchObject({ kind: 'permanent', code: 'wa_999999' });
    expect(classifyError(null, 503)).toEqual({ kind: 'transient', code: 'http_503', optOut: false });
    expect(classifyError(null, 429)).toMatchObject({ kind: 'transient' });
    expect(classifyError(null, 400)).toMatchObject({ kind: 'permanent', code: 'http_400' });
  });
  it('reads only the numeric code from an error body', () => {
    expect(graphErrorCode({ error: { code: 131050, message: 'secret text', error_data: { details: 'x' } } })).toBe(131050);
    for (const bad of [null, {}, { error: {} }, { error: { code: '131050' } }, { error: { code: 1.5 } }, 'x']) expect(graphErrorCode(bad)).toBeNull();
  });
});

describe('opt-out words', () => {
  it('match the whole message, in Turkish or English, whatever the case, accents or punctuation', () => {
    for (const w of ['STOP', 'stop', 'Stop!', ' iptal ', 'İPTAL', 'Dur', 'DURDUR.', 'vazgeç', 'Çıkış', 'unsubscribe', 'Abonelikten çık', 'bana mesaj atma']) expect(isOptOutText(w), w).toBe(true);
  });
  it('do not match a sentence, a question or anything else', () => {
    for (const w of ['please stop by tomorrow', 'dur bakalım, ne kadar', 'iptal etmek istemiyorum, siparişim ne zaman gelecek?', 'Merhaba', '', 'stops', 'stoppp', '5']) expect(isOptOutText(w), w).toBe(false);
    for (const nonText of [null, undefined, 5, {}, ['stop']]) expect(isOptOutText(nonText)).toBe(false);
  });
  it('folds Turkish letters', () => {
    expect(foldWord('ÇIKIŞ')).toBe('cikis');
    expect(foldWord('Vazgeç!!')).toBe('vazgec');
  });
});

describe('the signature and the handshake', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  it('accepts HMAC-SHA256 of the exact bytes with the app secret, and nothing else', () => {
    const header = signBody('app-secret', body);
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signatureMatches('app-secret', header, body)).toBe(true);
    expect(signatureMatches('other-secret', header, body)).toBe(false);
    expect(signatureMatches('app-secret', header, Buffer.from(body.toString() + ' '))).toBe(false);
    for (const bad of [undefined, '', 'sha256=', 'sha256=zz', header.replace('sha256=', ''), `sha1=${header.slice(7)}`, header.slice(0, -1)]) expect(signatureMatches('app-secret', bad, body), String(bad)).toBe(false);
    expect(signatureMatches(undefined, header, body)).toBe(false);
    expect(signatureMatches('', header, body)).toBe(false);
  });
  it('answers a subscribe request that knows the verify token with the challenge, and nothing else', () => {
    const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'v-token', 'hub.challenge': '1158201444' };
    expect(answerChallenge(q, 'v-token')).toBe('1158201444');
    expect(answerChallenge({ ...q, 'hub.verify_token': 'wrong' }, 'v-token')).toBeNull();
    expect(answerChallenge({ ...q, 'hub.mode': 'unsubscribe' }, 'v-token')).toBeNull();
    expect(answerChallenge({ ...q, 'hub.challenge': undefined }, 'v-token')).toBeNull();
    expect(answerChallenge(q, undefined)).toBeNull();
    expect(answerChallenge(q, '')).toBeNull();
    // A challenge is echoed as text: markup or anything long is refused rather than reflected.
    expect(answerChallenge({ ...q, 'hub.challenge': '<script>alert(1)</script>' }, 'v-token')).toBeNull();
    expect(answerChallenge({ ...q, 'hub.challenge': 'a'.repeat(201) }, 'v-token')).toBeNull();
  });
});

describe('reading Meta\'s webhook payloads', () => {
  const at = Date.parse('2026-11-22T10:00:00Z');
  it('turns statuses into delivery reports, with an id made from the message and the status so a retry repeats it', () => {
    const sent = parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.A', status: 'sent', to: '+905301234567', at }), PN);
    expect(sent.events).toEqual([{ providerMessageId: 'wamid.A', providerEventId: 'wamid.A:sent', type: 'sent', occurredAt: new Date(Math.floor(at / 1000) * 1000) }]);
    const delivered = parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.A', status: 'delivered', to: '+905301234567', at }), PN);
    expect(delivered.events[0]).toMatchObject({ type: 'delivered', providerEventId: 'wamid.A:delivered' });
  });
  it('treats read as delivered (Meta leaves out "delivered" when a message is read at once), and ignores played', () => {
    expect(parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.A', status: 'read', to: '+905301234567' }), PN).events[0]).toMatchObject({ type: 'delivered', providerEventId: 'wamid.A:read' });
    expect(parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.A', status: 'played', to: '+905301234567' }), PN).events).toEqual([]);
  });
  it('keeps the first error code of a failure as wa_<code>, and marks 131050 as an opt-out', () => {
    const f = parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.B', status: 'failed', to: '+905301234567', errorCode: 131026 }), PN).events[0]!;
    expect(f).toMatchObject({ type: 'failed', errorCode: 'wa_131026' });
    expect(f.optOut).toBeUndefined();
    expect(parseWebhookPayload(statusPayload({ phoneNumberId: PN, id: 'wamid.C', status: 'failed', to: '+905301234567', errorCode: 131050 }), PN).events[0]).toMatchObject({ errorCode: 'wa_131050', optOut: true });
  });
  it('reads what a customer wrote, as a plus-prefixed number, and a quick-reply button\'s label', () => {
    const t = parseWebhookPayload(textPayload({ phoneNumberId: PN, from: '+905301234567', text: 'STOP', id: 'wamid.T', at }), PN).inbound[0]!;
    expect(t).toMatchObject({ providerEventId: 'wamid.T', kind: 'text', from: '+905301234567', text: 'STOP' });
    expect(parseWebhookPayload(textPayload({ phoneNumberId: PN, from: '+905301234567', text: 'Durdur', id: 'wamid.U', type: 'button' }), PN).inbound[0]).toMatchObject({ kind: 'text', text: 'Durdur' });
  });
  it('has no phone number for a customer known only by an opaque user id', () => {
    expect(parseWebhookPayload(textPayload({ phoneNumberId: PN, from: null, text: 'STOP', id: 'wamid.V' }), PN).inbound[0]).toMatchObject({ from: null });
  });
  it('reads the customer\'s own stop and resume of marketing in the app', () => {
    const stop = parseWebhookPayload(preferencePayload({ phoneNumberId: PN, wa: '+905301234567', value: 'stop', at }), PN).inbound[0]!;
    expect(stop).toMatchObject({ kind: 'preference_stop', from: '+905301234567' });
    expect(stop.providerEventId).toBe(`pref:905301234567:stop:${Math.floor(at / 1000)}`);
    expect(parseWebhookPayload(preferencePayload({ phoneNumberId: PN, wa: '+905301234567', value: 'resume' }), PN).inbound[0]).toMatchObject({ kind: 'preference_resume' });
  });
  it('ignores a delivery for another business number, and keeps no words that cannot be an opt-out', () => {
    expect(parseWebhookPayload(statusPayload({ phoneNumberId: '999999999999', id: 'wamid.X', status: 'sent', to: '+905301234567' }), PN)).toEqual({ events: [], inbound: [] });
    const media = textPayload({ phoneNumberId: PN, from: '+905301234567', text: 'x', id: 'wamid.M' });
    (media.entry[0]!.changes[0]!.value as unknown as { messages: Array<Record<string, unknown>> }).messages[0] = { id: 'wamid.M', from: '905301234567', timestamp: '1749416383', type: 'image', image: { id: 'm1' } };
    expect(parseWebhookPayload(media, PN).inbound).toEqual([]);
  });
  it('refuses a payload that is not a WhatsApp delivery or is broken, as a whole', () => {
    for (const bad of [null, [], {}, { object: 'page', entry: [] }, { object: 'whatsapp_business_account' }, { object: 'whatsapp_business_account', entry: [{ changes: 'x' }] }, { object: 'whatsapp_business_account', entry: [{ changes: [null] }] }]) {
      expect(() => parseWebhookPayload(bad, PN), JSON.stringify(bad)).toThrow(AdapterError);
    }
    const noTime = statusPayload({ phoneNumberId: PN, id: 'wamid.A', status: 'sent', to: '+905301234567' });
    delete (noTime.entry[0]!.changes[0]!.value as unknown as { statuses: Array<Record<string, unknown>> }).statuses[0]!.timestamp;
    expect(() => parseWebhookPayload(noTime, PN)).toThrow(AdapterError);
  });
});
