/**
 * ESP Webhook Parser
 *
 * Parses event payloads from email service providers into
 * a normalized format for recordPerformance.
 */

export interface ParsedWebhookEvent {
  provider: 'sendgrid' | 'mailchimp' | 'postmark' | 'unknown';
  contentId: string | null;
  channel: 'email';
  metrics: {
    openRate?: number;
    clickThroughRate?: number;
    unsubscribeRate?: number;
    bounceRate?: number;
    sendCount?: number;
  };
  raw: Record<string, unknown>;
}

/**
 * Detect the ESP provider from the webhook payload.
 * Each provider has distinctive payload shapes.
 */
export function detectProvider(
  payload: unknown,
  headers?: Record<string, string>,
): 'sendgrid' | 'mailchimp' | 'postmark' | 'unknown' {
  if (Array.isArray(payload) && payload.length > 0 && payload[0]?.event) {
    return 'sendgrid';
  }

  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    const obj = payload as Record<string, unknown>;

    if (obj.event && typeof obj.event === 'string') {
      return 'sendgrid';
    }

    if (
      obj.RecordType &&
      typeof obj.RecordType === 'string'
    ) {
      return 'postmark';
    }

    if (
      obj.type &&
      typeof obj.type === 'string' &&
      obj.data
    ) {
      return 'mailchimp';
    }
  }

  if (headers) {
    const ua = (headers['user-agent'] || '').toLowerCase();
    if (ua.includes('sendgrid')) return 'sendgrid';
    if (ua.includes('mailchimp')) return 'mailchimp';
    if (ua.includes('postmark')) return 'postmark';
  }

  return 'unknown';
}

/**
 * Parse a SendGrid webhook event.
 *
 * SendGrid sends an array of event objects:
 * [{ "email": "...", "event": "open", "sg_message_id": "...", ... }]
 *
 * Aggregates events by campaign/message ID.
 */
export function parseSendGridEvent(
  payload: unknown,
): ParsedWebhookEvent {
  const events = Array.isArray(payload) ? payload : [payload];
  const first = (events[0] as Record<string, unknown>) || {};

  const contentId =
    (first.content_id as string) ||
    (first.custom_args as Record<string, unknown>)?.content_id as string ||
    (first.sg_message_id as string) ||
    null;

  const opens = events.filter(
    (e) => (e as Record<string, unknown>).event === 'open',
  ).length;
  const clicks = events.filter(
    (e) => (e as Record<string, unknown>).event === 'click',
  ).length;
  const delivered = events.filter(
    (e) => (e as Record<string, unknown>).event === 'delivered',
  ).length;
  const bounces = events.filter((e) =>
    ['bounce', 'dropped'].includes(
      (e as Record<string, unknown>).event as string,
    ),
  ).length;
  const unsubscribes = events.filter(
    (e) => (e as Record<string, unknown>).event === 'unsubscribe',
  ).length;
  const total = delivered + bounces;

  return {
    provider: 'sendgrid',
    contentId,
    channel: 'email',
    metrics: {
      ...(total > 0
        ? {
            openRate: opens / total,
            clickThroughRate: clicks / Math.max(opens, 1),
            bounceRate: bounces / total,
            unsubscribeRate: unsubscribes / Math.max(opens, 1),
            sendCount: total,
          }
        : {}),
    },
    raw: { events: events.length, first_event: first.event },
  };
}

/**
 * Parse a Postmark webhook event.
 *
 * Postmark sends individual events with "RecordType":
 * { "RecordType": "Open", "MessageID": "...", ... }
 */
export function parsePostmarkEvent(
  payload: Record<string, unknown>,
): ParsedWebhookEvent {
  const contentId =
    (payload.Metadata as Record<string, unknown>)?.content_id as string ||
    (payload.MessageID as string) ||
    null;

  const recordType = ((payload.RecordType as string) || '').toLowerCase();

  const metrics: ParsedWebhookEvent['metrics'] = {};
  if (recordType === 'bounce') {
    metrics.bounceRate = 1;
  }

  return {
    provider: 'postmark',
    contentId,
    channel: 'email',
    metrics,
    raw: {
      RecordType: payload.RecordType,
      MessageID: payload.MessageID,
    },
  };
}

/**
 * Parse a Mailchimp webhook event.
 *
 * Mailchimp sends events with "type" and "data":
 * { "type": "campaign", "data": { "id": "...", ... } }
 */
export function parseMailchimpEvent(
  payload: Record<string, unknown>,
): ParsedWebhookEvent {
  const data = (payload.data || {}) as Record<string, unknown>;
  const contentId =
    (data.content_id as string) || (data.id as string) || null;

  return {
    provider: 'mailchimp',
    contentId,
    channel: 'email',
    metrics: {
      openRate: data.opens as number | undefined,
      clickThroughRate: data.clicks as number | undefined,
      sendCount: data.emails_sent as number | undefined,
    },
    raw: { type: payload.type, data_id: data.id },
  };
}

/**
 * Parse any ESP webhook event. Auto-detects the provider.
 */
export function parseWebhookEvent(
  payload: unknown,
  headers?: Record<string, string>,
): ParsedWebhookEvent {
  const obj =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  const provider = detectProvider(payload, headers);

  switch (provider) {
    case 'sendgrid':
      return parseSendGridEvent(payload);
    case 'postmark':
      return parsePostmarkEvent(obj);
    case 'mailchimp':
      return parseMailchimpEvent(obj);
    default:
      return {
        provider: 'unknown',
        contentId: null,
        channel: 'email',
        metrics: {},
        raw: obj,
      };
  }
}
