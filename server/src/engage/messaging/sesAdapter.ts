import { X509Certificate, createPublicKey, createVerify } from 'crypto';
import {
  AdapterError, WebhookSignatureError,
  type AdapterAccount, type AdapterCapabilities, type AdapterSendRequest, type AdapterSendResult, type ChannelAdapter,
  type NormalizedError, type ProviderEvent, type RawWebhook,
} from './adapter.js';
import { signV4 } from './sigv4.js';

/**
 * Amazon SES (API v2) email adapter (WP-12, D-05: Messign-owned sandbox account now, the tenant's own account at
 * business start through the same adapter). Every mapping below cites the AWS documentation it follows:
 *   send:     https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 *   signing:  https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 *   webhooks: SES -> SNS -> HTTPS. https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html
 *             signature: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html
 *
 * Account config (non-secret): region, from_address, optional from_name, optional configuration_set, sns_topic_arn.
 * Account secrets: access_key_id, secret_access_key (an IAM user limited to ses:SendEmail), optional session_token.
 *
 * SES has no idempotency key: a crash between "SES accepted" and "we recorded it" can send twice. The lease recovery
 * in dispatch then re-sends; that is the documented risk for providers without one.
 */

export const SES_PROVIDER = 'ses';

export interface SesDeps {
  fetch: typeof fetch;
  /** Returns the PEM at an SNS signing-certificate URL (already checked to be an https SNS host). */
  fetchCert: (url: string) => Promise<string>;
  now: () => Date;
}

const REGION_RE = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
const TOPIC_RE = /^arn:aws:sns:([a-z]{2}(?:-gov)?-[a-z]+-\d):\d{12}:[A-Za-z0-9_-]{1,256}$/;
const EMAIL_RE = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$/;

interface SesConfig { region: string; from: string; configurationSet?: string; topicArn?: string }

function readConfig(account: AdapterAccount): SesConfig {
  const c = account.config;
  const region = typeof c.region === 'string' ? c.region : '';
  const fromAddress = typeof c.from_address === 'string' ? c.from_address.trim() : '';
  if (!REGION_RE.test(region) || !EMAIL_RE.test(fromAddress)) throw new AdapterError('permanent', 'ses_config_invalid');
  const name = typeof c.from_name === 'string' ? c.from_name.replace(/["\r\n<>\\]/g, '').trim().slice(0, 100) : '';
  const set = typeof c.configuration_set === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.configuration_set) ? c.configuration_set : undefined;
  const topic = typeof c.sns_topic_arn === 'string' && TOPIC_RE.test(c.sns_topic_arn) ? c.sns_topic_arn : undefined;
  return { region, from: name ? `"${name}" <${fromAddress}>` : fromAddress, configurationSet: set, topicArn: topic };
}

/** Lower-snake, safe for message_events.error_code. */
function errorCode(prefix: string, type: string): string {
  const snake = type.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase().replace(/^_+|_+$/g, '');
  return `${prefix}${snake || 'unknown'}`.slice(0, 64);
}

const certCache = new Map<string, string>();

async function defaultFetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`certificate fetch failed: ${res.status}`);
  const pem = await res.text();
  if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('not a certificate');
  if (certCache.size > 50) certCache.clear();
  certCache.set(url, pem);
  return pem;
}

/** The SNS string to sign: fixed keys, byte-sorted, "Key\nValue\n" each (docs, step "construct the string to sign"). */
export function snsStringToSign(msg: Record<string, unknown>): string | null {
  const type = msg.Type;
  const keys = type === 'Notification'
    ? ['Message', 'MessageId', ...(typeof msg.Subject === 'string' ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation'
      ? ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
      : null;
  if (!keys) return null;
  let out = '';
  for (const k of keys) {
    if (typeof msg[k] !== 'string') return null;
    out += `${k}\n${msg[k] as string}\n`;
  }
  return out;
}

/** SigningCertURL and SubscribeURL must be https on the SNS host of the topic's own region. */
export function isSnsUrl(raw: unknown, region: string, pathCheck: (p: string) => boolean): boolean {
  if (typeof raw !== 'string') return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === 'https:' && u.hostname === `sns.${region}.amazonaws.com` && u.port === '' && u.username === '' && pathCheck(u.pathname);
}

type SesEvent = Record<string, unknown> & { mail?: { messageId?: unknown } };

const addressesOf = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((r) => (r as { emailAddress?: unknown }).emailAddress).filter((a): a is string => typeof a === 'string') : [];
const at = (v: unknown, fallback: Date): Date => {
  const d = typeof v === 'string' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : fallback;
};

/** Maps one SES notification (identity notifications: notificationType; event publishing: eventType). */
export function mapSesNotification(n: SesEvent, snsMessageId: string, snsTimestamp: Date): ProviderEvent[] {
  const kind = typeof n.notificationType === 'string' ? n.notificationType : typeof n.eventType === 'string' ? n.eventType : '';
  const pid = n.mail?.messageId;
  if (typeof pid !== 'string' || pid.length === 0 || pid.length > 200) return [];
  const base = { providerMessageId: pid, providerEventId: snsMessageId };
  switch (kind) {
    case 'Delivery': {
      const d = n.delivery as Record<string, unknown> | undefined;
      return [{ ...base, type: 'delivered', occurredAt: at(d?.timestamp, snsTimestamp) }];
    }
    case 'Bounce': {
      const b = (n.bounce ?? {}) as Record<string, unknown>;
      const when = at(b.timestamp, snsTimestamp);
      if (b.bounceType === 'Permanent') {
        // A hard bounce: never mail this address again. UnsubscribedRecipient is SES list management, i.e. an opt-out.
        const reason = b.bounceSubType === 'UnsubscribedRecipient' ? 'opt_out' : 'hard_bounce';
        return [{ ...base, type: 'bounced', occurredAt: when, errorCode: errorCode('bounce_', String(b.bounceSubType ?? 'general')),
          suppress: { addresses: addressesOf(b.bouncedRecipients), reason } }];
      }
      // Transient: SES reports a soft bounce only once it has stopped retrying, so the message has failed for good,
      // but the address may work later: no suppression. Undetermined: not enough information to suppress either.
      return [{ ...base, type: 'failed', occurredAt: when, errorCode: b.bounceType === 'Transient' ? 'bounce_transient' : 'bounce_undetermined' }];
    }
    case 'Complaint': {
      const c = (n.complaint ?? {}) as Record<string, unknown>;
      // "not-spam" is an ISP telling us a message was NOT spam: not a reason to suppress.
      if (c.complaintFeedbackType === 'not-spam') return [];
      return [{ ...base, type: 'complained', occurredAt: at(c.timestamp, snsTimestamp), errorCode: 'complaint',
        suppress: { addresses: addressesOf(c.complainedRecipients), reason: 'complaint' } }];
    }
    case 'Send':
      return [{ ...base, type: 'sent', occurredAt: snsTimestamp }];
    case 'Reject':
      return [{ ...base, type: 'failed', occurredAt: snsTimestamp, errorCode: 'ses_reject' }];
    case 'Rendering Failure':
      return [{ ...base, type: 'failed', occurredAt: snsTimestamp, errorCode: 'ses_rendering_failure' }];
    default:
      return []; // Open, Click, DeliveryDelay, Subscription, and anything SES adds later: not status changes.
  }
}

export function createSesAdapter(deps: Partial<SesDeps> = {}): ChannelAdapter {
  const d: SesDeps = { fetch: deps.fetch ?? fetch, fetchCert: deps.fetchCert ?? defaultFetchCert, now: deps.now ?? (() => new Date()) };

  return {
    provider: SES_PROVIDER,

    capabilities(): AdapterCapabilities {
      return { channels: ['email'], unicode: true, links: true, domesticTr: true, deliveryReports: true, maxTps: 1 };
    },

    async send(req: AdapterSendRequest, account: AdapterAccount): Promise<AdapterSendResult> {
      if (req.channel !== 'email') throw new AdapterError('permanent', 'ses_email_only');
      const cfg = readConfig(account);
      const accessKeyId = account.secrets.access_key_id;
      const secretAccessKey = account.secrets.secret_access_key;
      if (!accessKeyId || !secretAccessKey) throw new AdapterError('permanent', 'ses_credentials_missing');
      const subject = typeof req.content.subject === 'string' ? req.content.subject : '';
      const html = typeof req.content.html === 'string' ? req.content.html : undefined;
      const text = typeof req.content.text === 'string' ? req.content.text : undefined;
      if (!subject || (!html && !text)) throw new AdapterError('permanent', 'ses_content_invalid');

      const body = JSON.stringify({
        FromEmailAddress: cfg.from,
        Destination: { ToAddresses: [req.to] },
        Content: { Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}), ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}) },
        } },
        ...(cfg.configurationSet ? { ConfigurationSetName: cfg.configurationSet } : {}),
      });
      const host = `email.${cfg.region}.amazonaws.com`;
      const path = '/v2/email/outbound-emails';
      const headers = signV4({ method: 'POST', host, path, headers: { 'content-type': 'application/json' }, body, region: cfg.region, service: 'ses', now: d.now() },
        { accessKeyId, secretAccessKey, sessionToken: account.secrets.session_token || undefined });

      let res: Response;
      try {
        res = await d.fetch(`https://${host}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
      } catch {
        throw new AdapterError('transient', 'ses_network'); // timeout or connection failure: SES may or may not have it
      }
      if (res.ok) {
        const json = await res.json().catch(() => null) as { MessageId?: unknown } | null;
        // Accepted but unreadable: do not retry (it may have been sent); fail it so it is visible.
        if (!json || typeof json.MessageId !== 'string' || !json.MessageId) throw new AdapterError('permanent', 'ses_bad_response');
        return { providerMessageId: json.MessageId };
      }
      const headerType = res.headers.get('x-amzn-errortype')?.split(':')[0] ?? '';
      const bodyJson = await res.json().catch(() => null) as { __type?: unknown; code?: unknown } | null;
      const type = headerType || (typeof bodyJson?.__type === 'string' ? bodyJson.__type.split('#').pop()! : '') || (typeof bodyJson?.code === 'string' ? bodyJson.code : '');
      if (res.status === 429 || type === 'TooManyRequestsException') throw new AdapterError('transient', 'ses_throttled');
      if (res.status >= 500) throw new AdapterError('transient', `ses_http_${res.status}`);
      throw new AdapterError('permanent', type ? errorCode('ses_', type) : `ses_http_${res.status}`);
    },

    async parseWebhook(raw: RawWebhook, account: AdapterAccount): Promise<ProviderEvent[]> {
      const cfg = account.config;
      const topic = typeof cfg.sns_topic_arn === 'string' ? cfg.sns_topic_arn.match(TOPIC_RE) : null;
      // Without a configured topic we cannot tell our notifications from anyone else's validly signed ones.
      if (!topic) throw new WebhookSignatureError();
      const region = topic[1]!;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.body.toString('utf8')) as Record<string, unknown>; } catch { throw new WebhookSignatureError(); }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new WebhookSignatureError();
      // Any AWS customer can send signed SNS messages to this URL: only our own topic counts.
      if (msg.TopicArn !== cfg.sns_topic_arn) throw new WebhookSignatureError();
      const algo = msg.SignatureVersion === '1' ? 'RSA-SHA1' : msg.SignatureVersion === '2' ? 'RSA-SHA256' : null;
      const toSign = snsStringToSign(msg);
      if (!algo || !toSign || typeof msg.Signature !== 'string') throw new WebhookSignatureError();
      if (!isSnsUrl(msg.SigningCertURL, region, (p) => p.endsWith('.pem'))) throw new WebhookSignatureError();

      let pem: string;
      try { pem = await d.fetchCert(msg.SigningCertURL as string); } catch { throw new AdapterError('transient', 'sns_cert_unavailable'); }
      let ok = false;
      try {
        if (pem.includes('BEGIN CERTIFICATE')) {
          const cert = new X509Certificate(pem);
          const now = d.now().getTime();
          if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) throw new WebhookSignatureError();
        }
        ok = createVerify(algo).update(toSign, 'utf8').verify(createPublicKey(pem), msg.Signature, 'base64');
      } catch (err) {
        if (err instanceof WebhookSignatureError) throw err;
        ok = false;
      }
      if (!ok) throw new WebhookSignatureError();

      if (msg.Type === 'SubscriptionConfirmation') {
        // Confirming means visiting SubscribeURL, which must be the SNS host of this topic's region.
        if (!isSnsUrl(msg.SubscribeURL, region, () => true)) throw new WebhookSignatureError();
        let res: Response;
        try { res = await d.fetch(msg.SubscribeURL as string, { method: 'GET', signal: AbortSignal.timeout(10_000) }); } catch { throw new AdapterError('transient', 'sns_confirm_failed'); }
        if (!res.ok) throw new AdapterError('transient', 'sns_confirm_failed');
        return [];
      }
      if (msg.Type !== 'Notification') return []; // UnsubscribeConfirmation: verified, nothing to do

      let notification: SesEvent;
      try { notification = JSON.parse(msg.Message as string) as SesEvent; } catch { throw new AdapterError('permanent', 'malformed_webhook'); }
      if (!notification || typeof notification !== 'object') throw new AdapterError('permanent', 'malformed_webhook');
      const snsId = typeof msg.MessageId === 'string' && msg.MessageId.length <= 200 ? msg.MessageId : null;
      if (!snsId) throw new AdapterError('permanent', 'malformed_webhook');
      return mapSesNotification(notification, snsId, at(msg.Timestamp, d.now()));
    },

    normalizeError(err: unknown): NormalizedError {
      if (err instanceof AdapterError) return { kind: err.kind, code: err.code };
      return { kind: 'transient', code: 'unknown_error' };
    },
  };
}
