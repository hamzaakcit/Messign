import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  AdapterError, WebhookSignatureError,
  type AdapterAccount, type AdapterCapabilities, type AdapterSendRequest, type AdapterSendResult, type ChannelAdapter,
  type NormalizedError, type ProviderEvent, type ProviderEventType, type RawWebhook,
} from './adapter.js';

/**
 * The mock provider. It never makes a network call and is the only adapter allowed in SEND_MODE=sandbox.
 * Behaviour comes from the account's non-secret config, so a test or a demo can script it:
 *   transient_failures  number  the first N send attempts for a message fail with a transient error (default 0)
 *   permanent_failure   boolean every send fails with a permanent error
 * Secrets: `webhook_secret` signs delivery reports (HMAC-SHA256 over the raw body, header x-mock-signature).
 * Provider message ids are derived from (account, idempotency key), so a repeated send returns the same id: this is
 * the idempotency a real provider gives when it is passed the key.
 */

export const MOCK_PROVIDER = 'mock';
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

const attemptsByKey = new Map<string, number>();

export function mockProviderMessageId(accountId: string, idempotencyKey: string): string {
  return `mock_${createHash('sha256').update(`${accountId}\n${idempotencyKey}`).digest('hex').slice(0, 24)}`;
}

export function signMockPayload(secret: string, body: Buffer | string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

const EVENT_TYPES: ReadonlySet<string> = new Set(['sent', 'delivered', 'failed', 'bounced']);

export const mockAdapter: ChannelAdapter = {
  provider: MOCK_PROVIDER,

  capabilities(): AdapterCapabilities {
    return { channels: ['email', 'sms', 'whatsapp'], unicode: true, links: true, domesticTr: true, deliveryReports: true, maxTps: 1000 };
  },

  async send(req: AdapterSendRequest, account: AdapterAccount): Promise<AdapterSendResult> {
    if (account.mode !== 'test') throw new AdapterError('permanent', 'mock_requires_test_account');
    if (account.config.permanent_failure === true) throw new AdapterError('permanent', 'mock_permanent_failure');
    const key = `${account.id}\n${req.idempotencyKey}`;
    const seen = (attemptsByKey.get(key) ?? 0) + 1;
    attemptsByKey.set(key, seen);
    const failures = typeof account.config.transient_failures === 'number' ? account.config.transient_failures : 0;
    if (seen <= failures) throw new AdapterError('transient', 'mock_transient_failure');
    return { providerMessageId: mockProviderMessageId(account.id, req.idempotencyKey) };
  },

  parseWebhook(raw: RawWebhook, account: AdapterAccount): ProviderEvent[] {
    const secret = account.secrets.webhook_secret;
    const given = raw.headers[MOCK_SIGNATURE_HEADER];
    if (!secret || !given) throw new WebhookSignatureError();
    const expected = Buffer.from(signMockPayload(secret, raw.body), 'hex');
    const actual = /^[0-9a-f]{64}$/i.test(given) ? Buffer.from(given, 'hex') : Buffer.alloc(0);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new WebhookSignatureError();

    let parsed: unknown;
    try { parsed = JSON.parse(raw.body.toString('utf8')); } catch { throw new AdapterError('permanent', 'malformed_webhook'); }
    const list = (parsed as { events?: unknown }).events;
    if (!Array.isArray(list)) throw new AdapterError('permanent', 'malformed_webhook');
    return list.map((e): ProviderEvent => {
      const o = e as Record<string, unknown>;
      const at = typeof o.occurred_at === 'string' ? new Date(o.occurred_at) : null;
      if (typeof o.provider_message_id !== 'string' || typeof o.event_id !== 'string' || typeof o.type !== 'string'
        || !EVENT_TYPES.has(o.type) || !at || Number.isNaN(at.getTime())) throw new AdapterError('permanent', 'malformed_webhook');
      return {
        providerMessageId: o.provider_message_id, providerEventId: o.event_id, type: o.type as ProviderEventType, occurredAt: at,
        errorCode: typeof o.error_code === 'string' ? o.error_code : undefined,
      };
    });
  },

  normalizeError(err: unknown): NormalizedError {
    if (err instanceof AdapterError) return { kind: err.kind, code: err.code };
    return { kind: 'transient', code: 'unknown_error' };
  },
};

/** Test hook: forget scripted attempt counters. */
export function resetMockAdapter(): void {
  attemptsByKey.clear();
}
