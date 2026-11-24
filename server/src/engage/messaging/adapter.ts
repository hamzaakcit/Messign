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
  /** The recipient has chosen to stop this channel (WhatsApp error 131050: the user stopped marketing messages from the
   *  business). Applied, once, to the profile the matched message was for, as an opt-out. */
  optOut?: boolean;
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
  /** The provider says the recipient has stopped this channel for the business: record an opt-out. */
  optOut?: boolean;
}

export class AdapterError extends Error {
  constructor(public readonly kind: 'transient' | 'permanent', public readonly code: string, message?: string, public readonly optOut = false) {
    super(message ?? code);
    this.name = 'AdapterError';
  }
}

/**
 * Something a customer sent to the business through a channel that has a conversation (WhatsApp). Only what the opt-out
 * rules need is kept: no text beyond the message itself, and nothing about media.
 */
export interface InboundMessage {
  /** The provider's id for it (a WhatsApp message id, or an id derived from the preference change). Repeats are duplicates. */
  providerEventId: string;
  /** A message the customer wrote, or the customer's own change of their marketing preference in the app. */
  kind: 'text' | 'preference_stop' | 'preference_resume';
  /** E.164 with the plus sign, when the sender's phone number is known; null when the provider gave only an opaque user id. */
  from: string | null;
  text?: string;
  occurredAt: Date;
}

/**
 * A template as the provider's own account lists it (WhatsApp: the message templates of a WhatsApp Business Account). Only
 * what the platform needs: identity, the provider's approval state, and the shape (how many variables, which buttons) so a
 * mapping can be checked before anything is sent. No text beyond the approved body.
 */
export interface RemoteTemplate {
  providerTemplateId: string | null;
  name: string;
  /** Underscore form, as the send API takes it (tr, en_US). */
  language: string;
  /** The provider's status, upper case (APPROVED, PENDING, REJECTED, PAUSED, DISABLED ...). Only APPROVED can be sent. */
  status: string;
  category: string | null;
  correctCategory: string | null;
  quality: string | null;
  rejectedReason: string | null;
  changedAt: Date | null;
  shape: {
    bodyText: string | null; bodyVariables: number; headerFormat: string | null; headerText: string | null; headerVariables: number;
    urlButtonVariables: number; buttons: string[]; parameterFormat: 'POSITIONAL' | 'NAMED';
  };
}

/** The provider says a template changed (WhatsApp: message_template_status_update). */
export interface TemplateStatusUpdate {
  /** Repeats of the same provider event share it. */
  key: string;
  name: string;
  language: string;
  providerTemplateId: string | null;
  /** The provider's event name, upper case. */
  event: string;
  category: string | null;
  reason: string | null;
  occurredAt: Date;
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
  /** What customers sent, from the same (signed) delivery. Only for channels with conversations. */
  parseInbound?(raw: RawWebhook, account: AdapterAccount): InboundMessage[];
  /** The provider's handshake when a webhook URL is set (WhatsApp: GET with hub.verify_token). The text to answer with, or
   *  null when the request does not prove the caller knows the account's verify token. */
  verifyWebhookChallenge?(query: Record<string, string | undefined>, account: AdapterAccount): string | null;
  /** Reads the account's message templates and their approval state (WhatsApp). Used by the template check, never by a send. */
  listTemplates?(account: AdapterAccount): Promise<RemoteTemplate[]>;
  /** Template changes from the same (signed) delivery. */
  parseTemplateUpdates?(raw: RawWebhook, account: AdapterAccount): TemplateStatusUpdate[];
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
