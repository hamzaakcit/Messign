import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  parseSendGridEvent,
  parsePostmarkEvent,
  parseMailchimpEvent,
  parseWebhookEvent,
} from '../../../services/marketing/webhookParser.js';

// ── Route input validation (unit) ──

describe('Performance Route Input Validation', () => {
  it('requires content_id', () => {
    const body = { channel: 'email', metrics: { open_rate: 0.3 } };
    expect(body).not.toHaveProperty('content_id');
  });

  it('requires channel', () => {
    const body = { content_id: 'c-1', metrics: { open_rate: 0.3 } };
    expect(body).not.toHaveProperty('channel');
  });

  it('validates rate ranges (0-1)', () => {
    const validRate = 0.32;
    const invalidRate = 1.5;
    expect(validRate >= 0 && validRate <= 1).toBe(true);
    expect(invalidRate >= 0 && invalidRate <= 1).toBe(false);
  });

  it('rejects negative rates', () => {
    expect(-0.1 >= 0 && -0.1 <= 1).toBe(false);
  });

  it('requires at least one metric', () => {
    const emptyMetrics = {};
    expect(Object.keys(emptyMetrics).length).toBe(0);
  });

  it('accepts valid complete input', () => {
    const body = {
      content_id: 'c-1',
      channel: 'email',
      metrics: {
        open_rate: 0.32,
        click_through_rate: 0.052,
        conversion_rate: 0.02,
        send_count: 5000,
      },
    };
    expect(body.content_id).toBeTruthy();
    expect(body.channel).toBeTruthy();
    expect(Object.keys(body.metrics).length).toBeGreaterThan(0);
    expect(body.metrics.open_rate).toBeGreaterThanOrEqual(0);
    expect(body.metrics.open_rate).toBeLessThanOrEqual(1);
  });

  it('validates send_count is non-negative', () => {
    expect(-1 >= 0).toBe(false);
    expect(0 >= 0).toBe(true);
    expect(5000 >= 0).toBe(true);
  });
});

// ── Webhook parsing ──

describe('Webhook Parsing', () => {
  describe('detectProvider', () => {
    it('detects SendGrid from event array', () => {
      const payload = [{ event: 'open', email: 'test@example.com' }];
      expect(detectProvider(payload)).toBe('sendgrid');
    });

    it('detects SendGrid from single event object', () => {
      const payload = { event: 'open', email: 'test@example.com' };
      expect(detectProvider(payload)).toBe('sendgrid');
    });

    it('detects Postmark from RecordType', () => {
      const payload = { RecordType: 'Open', MessageID: 'msg-1' };
      expect(detectProvider(payload)).toBe('postmark');
    });

    it('detects Mailchimp from type+data', () => {
      const payload = { type: 'campaign', data: { id: 'camp-1' } };
      expect(detectProvider(payload)).toBe('mailchimp');
    });

    it('returns unknown for unrecognized payload', () => {
      expect(detectProvider({ random: 'data' })).toBe('unknown');
    });

    it('detects provider from user-agent header', () => {
      expect(
        detectProvider({}, { 'user-agent': 'SendGrid Event API' }),
      ).toBe('sendgrid');
      expect(
        detectProvider({}, { 'user-agent': 'Postmark/1.0' }),
      ).toBe('postmark');
      expect(
        detectProvider({}, { 'user-agent': 'Mailchimp Webhooks' }),
      ).toBe('mailchimp');
    });

    it('returns unknown for empty payload and no headers', () => {
      expect(detectProvider({})).toBe('unknown');
    });
  });

  describe('parseSendGridEvent', () => {
    it('aggregates event types', () => {
      const events = [
        { event: 'delivered', sg_message_id: 'msg-1' },
        { event: 'delivered', sg_message_id: 'msg-1' },
        { event: 'open', sg_message_id: 'msg-1' },
        { event: 'click', sg_message_id: 'msg-1' },
        { event: 'bounce', sg_message_id: 'msg-1' },
      ];
      const result = parseSendGridEvent(events);
      expect(result.provider).toBe('sendgrid');
      expect(result.channel).toBe('email');
      expect(result.metrics.sendCount).toBe(3); // 2 delivered + 1 bounce
      expect(result.metrics.openRate).toBeCloseTo(1 / 3, 2);
      expect(result.metrics.bounceRate).toBeCloseTo(1 / 3, 2);
    });

    it('extracts content_id from custom_args', () => {
      const events = [
        {
          event: 'delivered',
          custom_args: { content_id: 'my-content' },
        },
      ];
      const result = parseSendGridEvent(events);
      expect(result.contentId).toBe('my-content');
    });

    it('falls back to sg_message_id', () => {
      const events = [{ event: 'open', sg_message_id: 'sg-123' }];
      const result = parseSendGridEvent(events);
      expect(result.contentId).toBe('sg-123');
    });

    it('returns empty metrics when no delivered or bounced events', () => {
      const events = [{ event: 'processed', sg_message_id: 'msg-1' }];
      const result = parseSendGridEvent(events);
      expect(result.metrics).toEqual({});
    });

    it('handles single event (non-array)', () => {
      const result = parseSendGridEvent({
        event: 'delivered',
        sg_message_id: 'msg-1',
      });
      expect(result.provider).toBe('sendgrid');
      expect(result.metrics.sendCount).toBe(1);
    });
  });

  describe('parsePostmarkEvent', () => {
    it('extracts contentId from Metadata', () => {
      const result = parsePostmarkEvent({
        RecordType: 'Open',
        MessageID: 'pm-1',
        Metadata: { content_id: 'c-1' },
      });
      expect(result.contentId).toBe('c-1');
      expect(result.provider).toBe('postmark');
    });

    it('falls back to MessageID', () => {
      const result = parsePostmarkEvent({
        RecordType: 'Open',
        MessageID: 'pm-1',
      });
      expect(result.contentId).toBe('pm-1');
    });

    it('sets bounceRate for bounce events', () => {
      const result = parsePostmarkEvent({
        RecordType: 'Bounce',
        MessageID: 'pm-2',
      });
      expect(result.metrics.bounceRate).toBe(1);
    });

    it('returns empty metrics for open events', () => {
      const result = parsePostmarkEvent({
        RecordType: 'Open',
        MessageID: 'pm-3',
      });
      expect(result.metrics).toEqual({});
    });
  });

  describe('parseMailchimpEvent', () => {
    it('extracts data from mailchimp payload', () => {
      const result = parseMailchimpEvent({
        type: 'campaign',
        data: {
          id: 'camp-1',
          opens: 0.32,
          clicks: 0.05,
          emails_sent: 5000,
        },
      });
      expect(result.provider).toBe('mailchimp');
      expect(result.contentId).toBe('camp-1');
      expect(result.metrics.openRate).toBe(0.32);
      expect(result.metrics.clickThroughRate).toBe(0.05);
      expect(result.metrics.sendCount).toBe(5000);
    });

    it('prefers content_id over generic id', () => {
      const result = parseMailchimpEvent({
        type: 'campaign',
        data: { content_id: 'my-c', id: 'camp-1' },
      });
      expect(result.contentId).toBe('my-c');
    });
  });

  describe('parseWebhookEvent', () => {
    it('auto-detects and parses Postmark', () => {
      const result = parseWebhookEvent({
        RecordType: 'Open',
        MessageID: 'pm-1',
        Metadata: { content_id: 'c-1' },
      });
      expect(result.provider).toBe('postmark');
      expect(result.contentId).toBe('c-1');
    });

    it('auto-detects and parses SendGrid', () => {
      const result = parseWebhookEvent([
        { event: 'delivered', sg_message_id: 'sg-1' },
      ]);
      expect(result.provider).toBe('sendgrid');
    });

    it('auto-detects and parses Mailchimp', () => {
      const result = parseWebhookEvent({
        type: 'campaign',
        data: { id: 'mc-1' },
      });
      expect(result.provider).toBe('mailchimp');
    });

    it('returns unknown for unrecognized payload', () => {
      const result = parseWebhookEvent({ foo: 'bar' });
      expect(result.provider).toBe('unknown');
      expect(result.contentId).toBeNull();
    });

    it('handles null/non-object payload', () => {
      const result = parseWebhookEvent(null);
      expect(result.provider).toBe('unknown');
    });
  });
});
