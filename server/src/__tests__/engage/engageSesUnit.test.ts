import { describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync, randomUUID } from 'crypto';
import { AdapterError, WebhookSignatureError, type AdapterAccount } from '../../engage/messaging/adapter.js';
import { createSesAdapter, isSnsUrl, mapSesNotification, snsStringToSign } from '../../engage/messaging/sesAdapter.js';
import { signV4 } from '../../engage/messaging/sigv4.js';

const TOPIC = 'arn:aws:sns:eu-central-1:123456789012:messign-ses-events';
const CERT_URL = 'https://sns.eu-central-1.amazonaws.com/SimpleNotificationService-0000000000.pem';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

const account = (over: Partial<AdapterAccount> = {}): AdapterAccount => ({
  id: 'acct-1', channel: 'email', provider: 'ses', mode: 'test',
  config: { region: 'eu-central-1', from_address: 'hello@demo.example.com', from_name: 'Demo Kitap', sns_topic_arn: TOPIC },
  secrets: { access_key_id: 'AKIDEXAMPLE', secret_access_key: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
  ...over,
});

function signed(fields: Record<string, unknown>, version: '1' | '2' = '2', key = keys.privateKey): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    Type: 'Notification', MessageId: randomUUID(), TopicArn: TOPIC, Timestamp: '2026-11-08T10:00:00.000Z',
    SignatureVersion: version, SigningCertURL: CERT_URL, Message: '{}', ...fields,
  };
  msg.Signature = createSign(version === '1' ? 'RSA-SHA1' : 'RSA-SHA256').update(snsStringToSign(msg)!).sign(key, 'base64');
  return msg;
}
const raw = (msg: unknown) => ({ headers: { 'content-type': 'text/plain; charset=UTF-8' }, body: Buffer.from(JSON.stringify(msg)) });

describe('SigV4', () => {
  it('reproduces the AWS test-suite vector "get-vanilla"', () => {
    const h = signV4({ method: 'GET', host: 'example.amazonaws.com', path: '/', headers: {}, body: '', region: 'us-east-1', service: 'service', now: new Date('2015-08-30T12:36:00Z') },
      { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' });
    expect(h.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
    expect(h['x-amz-date']).toBe('20150830T123600Z');
  });
  it('signs the session token and the body', () => {
    const base = { method: 'POST', host: 'h', path: '/p', headers: { 'content-type': 'application/json' }, region: 'eu-central-1', service: 'ses', now: new Date('2026-01-01T00:00:00Z') };
    const a = signV4({ ...base, body: '{"a":1}' }, { accessKeyId: 'A', secretAccessKey: 'S' });
    const b = signV4({ ...base, body: '{"a":2}' }, { accessKeyId: 'A', secretAccessKey: 'S' });
    const t = signV4({ ...base, body: '{"a":1}' }, { accessKeyId: 'A', secretAccessKey: 'S', sessionToken: 'TOK' });
    expect(a.authorization).not.toBe(b.authorization);
    expect(t['x-amz-security-token']).toBe('TOK');
    expect(t.authorization).toContain('SignedHeaders=content-type;host;x-amz-date;x-amz-security-token');
  });
  it('sorts headers, so the signature does not depend on the order they were given in', () => {
    const base = { method: 'POST', host: 'h', path: '/p', body: '', region: 'eu-central-1', service: 'ses', now: new Date('2026-01-01T00:00:00Z') };
    const a = signV4({ ...base, headers: { 'x-zz': '1', 'content-type': 'application/json' } }, { accessKeyId: 'A', secretAccessKey: 'S' });
    const b = signV4({ ...base, headers: { 'content-type': 'application/json', 'x-zz': '1' } }, { accessKeyId: 'A', secretAccessKey: 'S' });
    expect(a.authorization).toContain('SignedHeaders=content-type;host;x-amz-date;x-zz,');
    expect(a.authorization).toBe(b.authorization);
  });
});

describe('SES send', () => {
  const okFetch = () => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ MessageId: '0100018f-abc' }), { status: 200 }));
  const req = { idempotencyKey: 'k', channel: 'email' as const, to: 'reader@example.com', content: { subject: 'Merhaba', html: '<p>Hi</p>', text: 'Hi' } };

  it('posts a signed SendEmail v2 request and returns the SES MessageId', async () => {
    const f = okFetch();
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch, now: () => new Date('2026-11-08T10:00:00Z') });
    expect(await ses.send(req, account())).toEqual({ providerMessageId: '0100018f-abc' });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://email.eu-central-1.amazonaws.com/v2/email/outbound-emails');
    expect(init!.method).toBe('POST');
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261108\/eu-central-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(JSON.parse(init!.body as string)).toEqual({
      FromEmailAddress: '"Demo Kitap" <hello@demo.example.com>',
      Destination: { ToAddresses: ['reader@example.com'] },
      Content: { Simple: { Subject: { Data: 'Merhaba', Charset: 'UTF-8' }, Body: { Html: { Data: '<p>Hi</p>', Charset: 'UTF-8' }, Text: { Data: 'Hi', Charset: 'UTF-8' } } } },
    });
  });

  it('sends List-Unsubscribe and List-Unsubscribe-Post (RFC 8058) when the message carries an https one-click target', async () => {
    const f = okFetch();
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch });
    const target = 'https://api.example.com/api/engage/unsubscribe/abc.def';
    await ses.send({ ...req, content: { ...req.content, unsubscribe_one_click_url: target } }, account());
    expect(JSON.parse(f.mock.calls[0]![1]!.body as string).Content.Simple.Headers).toEqual([
      { Name: 'List-Unsubscribe', Value: `<${target}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ]);
  });

  it.each([
    ['absent', undefined],
    ['http', 'http://api.example.com/u/x'],
    ['with whitespace (header injection)', 'https://api.example.com/u/x\r\nBcc: evil@example.com'],
    ['with angle brackets', 'https://api.example.com/u/x>,<https://evil.example.com'],
    ['not a string', 42],
  ])('sends no list headers when the one-click target is %s', async (_n, value) => {
    const f = okFetch();
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch });
    await ses.send({ ...req, content: { ...req.content, ...(value === undefined ? {} : { unsubscribe_one_click_url: value }) } }, account());
    expect(JSON.parse(f.mock.calls[0]![1]!.body as string).Content.Simple).not.toHaveProperty('Headers');
  });

  it('adds the configuration set when configured, and strips header-breaking characters from the display name', async () => {
    const f = okFetch();
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch });
    await ses.send(req, account({ config: { ...account().config, configuration_set: 'messign-events', from_name: 'Evil"\r\nBcc: x' } }));
    const body = JSON.parse(f.mock.calls[0]![1]!.body as string);
    expect(body.ConfigurationSetName).toBe('messign-events');
    expect(body.FromEmailAddress).toBe('"EvilBcc: x" <hello@demo.example.com>');
  });

  it.each([
    ['throttled (429)', 429, 'TooManyRequestsException', 'transient', 'ses_throttled'],
    ['429 without an error type', 429, '', 'transient', 'ses_throttled'],
    ['server error', 503, '', 'transient', 'ses_http_503'],
    ['message rejected', 400, 'MessageRejected', 'permanent', 'ses_message_rejected'],
    ['sending paused', 400, 'SendingPausedException', 'permanent', 'ses_sending_paused_exception'],
    ['account suspended', 400, 'AccountSuspendedException', 'permanent', 'ses_account_suspended_exception'],
    ['unknown 403', 403, '', 'permanent', 'ses_http_403'],
  ])('maps %s', async (_n, status, type, kind, code) => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: 'reader@example.com is bad' }), { status, headers: type ? { 'x-amzn-ErrorType': `${type}:http://internal.amazon.com/` } : {} }));
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch });
    const err = await ses.send(req, account()).catch((e: unknown) => e) as AdapterError;
    expect(err).toBeInstanceOf(AdapterError);
    expect({ kind: err.kind, code: err.code }).toEqual({ kind, code });
    expect(err.message).not.toContain('reader@example.com');
  });

  it('reads the error type from the body when the header is absent', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ __type: 'com.amazonaws#MailFromDomainNotVerifiedException' }), { status: 400 }));
    const err = await createSesAdapter({ fetch: f as unknown as typeof fetch }).send(req, account()).catch((e: unknown) => e) as AdapterError;
    expect(err.code).toBe('ses_mail_from_domain_not_verified_exception');
  });

  it('treats a network failure as transient, and an unreadable success as permanent (it may have been sent)', async () => {
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await createSesAdapter({ fetch: down as unknown as typeof fetch }).send(req, account()).catch((e: AdapterError) => [e.kind, e.code])).toEqual(['transient', 'ses_network']);
    const weird = vi.fn(async () => new Response('not json', { status: 200 }));
    expect(await createSesAdapter({ fetch: weird as unknown as typeof fetch }).send(req, account()).catch((e: AdapterError) => [e.kind, e.code])).toEqual(['permanent', 'ses_bad_response']);
  });

  it.each([
    ['bad region', { region: 'eu-central' }, 'ses_config_invalid'],
    ['bad from address', { from_address: 'not-an-address' }, 'ses_config_invalid'],
  ])('refuses %s before any network call', async (_n, cfg, code) => {
    const f = okFetch();
    const err = await createSesAdapter({ fetch: f as unknown as typeof fetch }).send(req, account({ config: { ...account().config, ...cfg } })).catch((e: AdapterError) => e);
    expect((err as AdapterError).code).toBe(code);
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses missing credentials, missing content, and non-email channels', async () => {
    const f = okFetch();
    const ses = createSesAdapter({ fetch: f as unknown as typeof fetch });
    expect(await ses.send(req, account({ secrets: {} })).catch((e: AdapterError) => e.code)).toBe('ses_credentials_missing');
    expect(await ses.send({ ...req, content: { subject: 'x' } }, account()).catch((e: AdapterError) => e.code)).toBe('ses_content_invalid');
    expect(await ses.send({ ...req, channel: 'sms' }, account()).catch((e: AdapterError) => e.code)).toBe('ses_email_only');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('SNS signature verification', () => {
  it('builds the string to sign exactly as the AWS documentation example', () => {
    expect(snsStringToSign({
      Type: 'Notification', Message: 'My Test Message', MessageId: '4d4dc071-ddbf-465d-bba8-08f81c89da64', Subject: 'My subject',
      Timestamp: '2019-01-31T04:37:04.321Z', TopicArn: 'arn:aws:sns:us-east-2:123456789012:s4-MySNSTopic-1G1WEFCOXTC0P', Signature: 'ignored', SigningCertURL: 'ignored',
    })).toBe('Message\nMy Test Message\nMessageId\n4d4dc071-ddbf-465d-bba8-08f81c89da64\nSubject\nMy subject\nTimestamp\n2019-01-31T04:37:04.321Z\nTopicArn\narn:aws:sns:us-east-2:123456789012:s4-MySNSTopic-1G1WEFCOXTC0P\nType\nNotification\n');
    expect(snsStringToSign({
      Type: 'SubscriptionConfirmation', Message: 'Please confirm your subscription', MessageId: '3d891288-136d-417f-bc05-901c108273ee',
      SubscribeURL: 'https://sns.us-east-2.amazonaws.com/x', Timestamp: '2024-01-01T00:00:00.000Z', Token: 'abc123', TopicArn: 'arn:aws:sns:us-east-2:123456789012:MyTopic',
    })).toBe('Message\nPlease confirm your subscription\nMessageId\n3d891288-136d-417f-bc05-901c108273ee\nSubscribeURL\nhttps://sns.us-east-2.amazonaws.com/x\nTimestamp\n2024-01-01T00:00:00.000Z\nToken\nabc123\nTopicArn\narn:aws:sns:us-east-2:123456789012:MyTopic\nType\nSubscriptionConfirmation\n');
    expect(snsStringToSign({ Type: 'Notification', Message: 'm', MessageId: 'i', Timestamp: 't', TopicArn: 'a' })).toBe('Message\nm\nMessageId\ni\nTimestamp\nt\nTopicArn\na\nType\nNotification\n');
    expect(snsStringToSign({ Type: 'Other' })).toBeNull();
    expect(snsStringToSign({ Type: 'Notification', Message: 'm' })).toBeNull();
  });

  const ses = (over: Parameters<typeof createSesAdapter>[0] = {}) => createSesAdapter({ fetchCert: async () => PUB, ...over });
  const delivery = (pid = 'ses-msg-1') => JSON.stringify({ notificationType: 'Delivery', mail: { messageId: pid }, delivery: { timestamp: '2026-11-08T10:00:01.000Z', recipients: ['reader@example.com'] } });

  it('accepts version 1 and version 2 signatures from our topic', async () => {
    for (const v of ['1', '2'] as const) {
      const events = await ses().parseWebhook(raw(signed({ Message: delivery() }, v)), account());
      expect(events).toMatchObject([{ providerMessageId: 'ses-msg-1', type: 'delivered' }]);
    }
  });

  it('rejects a forged, tampered, unknown-version, or foreign-topic message', async () => {
    const forger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const good = signed({ Message: delivery() });
    const cases: Array<[string, unknown]> = [
      ['signed by another key', signed({ Message: delivery() }, '2', forger)],
      ['message changed after signing', { ...good, Message: delivery('someone-elses-message') }],
      ['subject added after signing', { ...good, Subject: 'x' }],
      ['unknown signature version', { ...good, SignatureVersion: '3' }],
      ['no signature', { ...good, Signature: undefined }],
      ['another AWS customer\'s topic, validly signed', signed({ Message: delivery(), TopicArn: 'arn:aws:sns:eu-central-1:999999999999:attacker' })],
      ['not JSON', 'nope'],
      ['unknown type', { ...good, Type: 'Whatever' }],
    ];
    for (const [name, msg] of cases) {
      await expect(ses().parseWebhook(typeof msg === 'string' ? { headers: {}, body: Buffer.from(msg) } : raw(msg), account()), name).rejects.toThrow(WebhookSignatureError);
    }
  });

  it('only fetches certificates from the SNS host of the topic region, over https, ending .pem', async () => {
    const fetchCert = vi.fn(async () => PUB);
    for (const url of [
      'http://sns.eu-central-1.amazonaws.com/cert.pem', 'https://sns.us-east-1.amazonaws.com/cert.pem', 'https://sns.eu-central-1.amazonaws.com.evil.example/cert.pem',
      'https://evil.example/sns.eu-central-1.amazonaws.com/cert.pem', 'https://sns.eu-central-1.amazonaws.com/cert.txt', 'https://sns.eu-central-1.amazonaws.com:8443/cert.pem',
      'https://user@sns.eu-central-1.amazonaws.com/cert.pem', 'not a url',
    ]) {
      await expect(ses({ fetchCert }).parseWebhook(raw(signed({ Message: delivery(), SigningCertURL: url })), account()), url).rejects.toThrow(WebhookSignatureError);
    }
    expect(fetchCert).not.toHaveBeenCalled();
    expect(isSnsUrl(CERT_URL, 'eu-central-1', (p) => p.endsWith('.pem'))).toBe(true);
  });

  it('refuses everything when the account has no topic configured', async () => {
    const noTopic = account({ config: { ...account().config, sns_topic_arn: '' } });
    await expect(ses().parseWebhook(raw(signed({ Message: delivery() })), noTopic)).rejects.toThrow(WebhookSignatureError);
    // a malformed topic in the config is "no topic", even if a message carries exactly that string
    const badArn = 'arn:aws:sns:eu-central-1:123:not-a-12-digit-account';
    const malformed = account({ config: { ...account().config, sns_topic_arn: badArn } });
    await expect(ses().parseWebhook(raw(signed({ Message: delivery(), TopicArn: badArn })), malformed)).rejects.toThrow(WebhookSignatureError);
  });

  it('asks the provider to retry when the certificate cannot be fetched', async () => {
    const err = await Promise.resolve().then(() => ses({ fetchCert: async () => { throw new Error('down'); } }).parseWebhook(raw(signed({ Message: delivery() })), account())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).kind).toBe('transient');
  });

  it('confirms a subscription by visiting SubscribeURL, only on the SNS host of the topic region', async () => {
    const f = vi.fn(async () => new Response('<ConfirmSubscriptionResponse/>', { status: 200 }));
    const sub = (url: string) => signed({ Type: 'SubscriptionConfirmation', SubscribeURL: url, Token: 't0k3n', Message: 'confirm' });
    expect(await ses({ fetch: f as unknown as typeof fetch }).parseWebhook(raw(sub('https://sns.eu-central-1.amazonaws.com/?Action=ConfirmSubscription&Token=t0k3n')), account())).toEqual([]);
    expect(f).toHaveBeenCalledWith('https://sns.eu-central-1.amazonaws.com/?Action=ConfirmSubscription&Token=t0k3n', expect.objectContaining({ method: 'GET' }));
    f.mockClear();
    await expect(ses({ fetch: f as unknown as typeof fetch }).parseWebhook(raw(sub('https://evil.example/confirm')), account())).rejects.toThrow(WebhookSignatureError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('SES notification mapping', () => {
  const ts = new Date('2026-11-08T10:00:00Z');
  const mail = { messageId: 'ses-1', destination: ['reader@example.com'] };
  it.each([
    ['delivery', { notificationType: 'Delivery', mail, delivery: { timestamp: '2026-11-08T10:00:02.000Z' } }, [{ type: 'delivered', occurredAt: new Date('2026-11-08T10:00:02.000Z') }]],
    ['permanent bounce suppresses', { notificationType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bounceSubType: 'General', bouncedRecipients: [{ emailAddress: 'reader@example.com' }], timestamp: '2026-11-08T10:00:03.000Z' } },
      [{ type: 'bounced', errorCode: 'bounce_general', suppress: { addresses: ['reader@example.com'], reason: 'hard_bounce' } }]],
    ['suppression-list bounce suppresses', { notificationType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bounceSubType: 'OnAccountSuppressionList', bouncedRecipients: [{ emailAddress: 'reader@example.com' }] } },
      [{ type: 'bounced', errorCode: 'bounce_on_account_suppression_list', suppress: { reason: 'hard_bounce' } }]],
    ['unsubscribed-recipient bounce is an opt-out', { notificationType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bounceSubType: 'UnsubscribedRecipient', bouncedRecipients: [{ emailAddress: 'reader@example.com' }] } },
      [{ type: 'bounced', suppress: { reason: 'opt_out' } }]],
    ['transient bounce fails without suppression', { notificationType: 'Bounce', mail, bounce: { bounceType: 'Transient', bounceSubType: 'MailboxFull', bouncedRecipients: [{ emailAddress: 'reader@example.com' }] } },
      [{ type: 'failed', errorCode: 'bounce_transient' }]],
    ['undetermined bounce fails without suppression', { notificationType: 'Bounce', mail, bounce: { bounceType: 'Undetermined' } }, [{ type: 'failed', errorCode: 'bounce_undetermined' }]],
    ['complaint suppresses', { notificationType: 'Complaint', mail, complaint: { complainedRecipients: [{ emailAddress: 'reader@example.com' }], complaintFeedbackType: 'abuse' } },
      [{ type: 'complained', suppress: { addresses: ['reader@example.com'], reason: 'complaint' } }]],
    ['event-publishing form (eventType)', { eventType: 'Delivery', mail, delivery: {} }, [{ type: 'delivered', occurredAt: ts }]],
    ['send event', { eventType: 'Send', mail, send: {} }, [{ type: 'sent' }]],
    ['reject event', { eventType: 'Reject', mail, reject: { reason: 'Bad content' } }, [{ type: 'failed', errorCode: 'ses_reject' }]],
  ])('%s', (_n, n, expected) => {
    expect(mapSesNotification(n as never, 'sns-id-1', ts)).toMatchObject(expected.map((e) => ({ providerMessageId: 'ses-1', providerEventId: 'sns-id-1', ...e })));
  });
  it('never suppresses on a soft or undetermined bounce', () => {
    for (const bounceType of ['Transient', 'Undetermined']) {
      const [e] = mapSesNotification({ notificationType: 'Bounce', mail, bounce: { bounceType, bouncedRecipients: [{ emailAddress: 'reader@example.com' }] } } as never, 'x', ts);
      expect(e!.suppress, bounceType).toBeUndefined();
    }
  });
  it.each([
    ['not-spam feedback', { notificationType: 'Complaint', mail, complaint: { complaintFeedbackType: 'not-spam', complainedRecipients: [{ emailAddress: 'reader@example.com' }] } }],
    ['open', { eventType: 'Open', mail }], ['click', { eventType: 'Click', mail }], ['delivery delay', { eventType: 'DeliveryDelay', mail }],
    ['no message id', { notificationType: 'Delivery', mail: {} }], ['unknown', { notificationType: 'Something', mail }],
  ])('ignores %s', (_n, n) => {
    expect(mapSesNotification(n as never, 'sns-id-1', ts)).toEqual([]);
  });
});
