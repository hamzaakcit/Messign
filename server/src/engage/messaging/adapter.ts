import type { Channel, Mode } from '../credentials.js';

/**
 * The provider-neutral adapter contract (target-state E). Core code never names a vendor: it asks the registry for the
 * adapter that matches `account.provider`. An adapter never touches the database and never decides whether a message
 * may be sent (that is the send gate). It only translates.
 */

export interface AdapterCapabilities {
  channels: Channel[];
  unicode: boolean;
  links: boolean;
  /** True when the route works for Turkish domestic traffic (links blocked from abroad on some SMS routes). */
  domesticTr: boolean;
  deliveryReports: boolean;
  /** Provider rate limit, messages per second (informational until the rate-limited dispatcher exists). */
  maxTps: number;
}

export interface AdapterAccount {
  id: string;
  channel: Channel;
  provider: string;
  mode: Mode;
  config: Record<string, string | number | boolean>;
  /** Decrypted just for this call. Never log, store or return it. */
  secrets: Record<string, string>;
}

export interface AdapterSendRequest {
  /** Passed to the provider where it supports one. A repeat with the same key must not create a second message. */
  idempotencyKey: string;
  channel: Channel;
  /** Resolved from the profile at send time: an email address or an E.164 phone number. */
  to: string;
  content: Record<string, unknown>;
}

export interface AdapterSendResult {
  providerMessageId: string;
}

export type ProviderEventType = 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained';

export interface ProviderEvent {
  providerMessageId: string;
  /** The provider's own id for this report. Reports repeating it are duplicates. */
  providerEventId: string;
  type: ProviderEventType;
  occurredAt: Date;
  errorCode?: string;
  /** Addresses the provider says must not be mailed again (hard bounce, complaint). Applied only when the report
   *  matches a message of this tenant, and only to that message's channel. */
  suppress?: { addresses: string[]; reason: 'hard_bounce' | 'complaint' | 'opt_out' };
}

export interface RawWebhook {
  headers: Record<string, string | undefined>;
  /** The exact bytes received. A signature is over these, never over re-serialised JSON. */
  body: Buffer;
}

export interface NormalizedError {
  /** transient: retry with backoff (429, 5xx, timeouts). permanent: final. */
  kind: 'transient' | 'permanent';
  /** lower_snake or provider code, safe to store and log. */
  code: string;
}

export class AdapterError extends Error {
  constructor(public readonly kind: 'transient' | 'permanent', public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'AdapterError';
  }
}

export class WebhookSignatureError extends Error {
  constructor() {
    super('Webhook signature is missing or invalid');
    this.name = 'WebhookSignatureError';
  }
}

export interface ChannelAdapter {
  readonly provider: string;
  capabilities(): AdapterCapabilities;
  send(req: AdapterSendRequest, account: AdapterAccount): Promise<AdapterSendResult>;
  /** Verifies the signature first and throws WebhookSignatureError if it does not match. Returns normalised events.
   *  May be async (a provider may need to fetch its signing certificate). Throws AdapterError('transient') when the
   *  report cannot be verified right now, so the provider retries. */
  parseWebhook(raw: RawWebhook, account: AdapterAccount): ProviderEvent[] | Promise<ProviderEvent[]>;
  normalizeError(err: unknown): NormalizedError;
}

const adapters = new Map<string, ChannelAdapter>();

export function registerAdapter(adapter: ChannelAdapter): void {
  adapters.set(adapter.provider, adapter);
}
export function getAdapter(provider: string): ChannelAdapter | undefined {
  return adapters.get(provider);
}
/** Test hook. */
export function clearAdapters(): void {
  adapters.clear();
}
