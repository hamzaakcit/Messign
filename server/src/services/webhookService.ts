import crypto from 'crypto';
import { query } from '../db/index.js';
import { webhookQueue } from '../queue/queues.js';

export const AVAILABLE_WEBHOOK_EVENTS = [
  'finance.expense.approved',
  'finance.expense.rejected',
  'finance.invoice.overdue',
  'support.ticket.assigned',
  'support.ticket.escalated',
  'support.sla.breached',
  'crm.deal.won',
  'crm.deal.stage_changed',
  'recruitment.interview.scheduled',
  'recruitment.offer.accepted',
  'time.timesheet.approved',
  'time.timesheet.rejected',
  'marketing.lead.qualified',
  'dora.action.executed',
] as const;

type WebhookRecord = {
  id: string;
  organization_id: string | null;
  name: string;
  url: string;
  secret: string;
  events: string[];
  headers: Record<string, string>;
  retry_count: number;
};

function signPayload(secret: string, payload: unknown, timestamp: string): string {
  const body = JSON.stringify(payload);
  const signed = `${timestamp}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `sha256=${sig}`;
}

export const webhookService = {
  async dispatchWebhook(eventName: string, payload: Record<string, unknown>, organizationId: string): Promise<void> {
    const rows = await query<WebhookRecord>(
      `SELECT id::text, organization_id::text, name, url, secret, events, headers, retry_count
       FROM webhooks
       WHERE is_active = TRUE
         AND organization_id = $1::uuid`,
      [organizationId],
    );
    const candidates = rows.rows.filter((row) => Array.isArray(row.events) && row.events.includes(eventName));
    for (const hook of candidates) {
      await webhookQueue.add('deliver-webhook', {
        webhookId: hook.id,
        event: eventName,
        payload,
        attempt: 1,
      });
    }
  },

  async deliverWebhook(webhookId: string, event: string, payload: Record<string, unknown>, attempt: number): Promise<void> {
    const hookResult = await query<WebhookRecord>(
      `SELECT id::text, organization_id::text, name, url, secret, events, headers, retry_count
       FROM webhooks
       WHERE id = $1::uuid
       LIMIT 1`,
      [webhookId],
    );
    const hook = hookResult.rows[0];
    if (!hook || !hook.url) return;

    const started = Date.now();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const delivery = await query<{ id: string }>(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, attempt, status)
       VALUES ($1::uuid, $2, $3::jsonb, $4, $5)
       RETURNING id::text`,
      [webhookId, event, JSON.stringify(payload), attempt, 'pending'],
    );
    const deliveryId = delivery.rows[0]?.id;
    const signature = signPayload(hook.secret, payload, timestamp);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Messign-Event': event,
          'X-Messign-Timestamp': timestamp,
          'X-Messign-Delivery-Id': deliveryId ?? '',
          'X-Messign-Signature': signature,
          ...hook.headers,
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      }).finally(() => clearTimeout(timeout));
      const body = await response.text();
      const status = response.ok ? 'success' : 'failed';

      if (deliveryId) {
        await query(
          `UPDATE webhook_deliveries
           SET status_code = $1,
               response_body = $2,
               response_time_ms = $3,
               status = $4,
               delivered_at = NOW()
           WHERE id = $5::uuid`,
          [response.status, body.slice(0, 3000), Date.now() - started, status, deliveryId],
        );
      }

      await query(
        `UPDATE webhooks
         SET last_triggered_at = NOW(),
             last_status_code = $1,
             failure_count = CASE WHEN $1 BETWEEN 200 AND 299 THEN 0 ELSE failure_count + 1 END,
             updated_at = NOW()
         WHERE id = $2::uuid`,
        [response.status, webhookId],
      );

      if (!response.ok && attempt < (hook.retry_count ?? 3)) {
        await webhookQueue.add('deliver-webhook', { webhookId, event, payload, attempt: attempt + 1 }, { delay: 5000 * attempt });
      }
    } catch (error) {
      if (deliveryId) {
        await query(
          `UPDATE webhook_deliveries
           SET response_time_ms = $1,
               status = 'failed',
               error_message = $2
           WHERE id = $3::uuid`,
          [Date.now() - started, error instanceof Error ? error.message : 'Network error', deliveryId],
        );
      }
      await query(
        `UPDATE webhooks
         SET last_triggered_at = NOW(),
             last_status_code = 0,
             failure_count = failure_count + 1,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [webhookId],
      );
      if (attempt < (hook.retry_count ?? 3)) {
        await webhookQueue.add('deliver-webhook', { webhookId, event, payload, attempt: attempt + 1 }, { delay: 5000 * attempt });
      }
    }
  },

  async retryFailedDeliveries(): Promise<void> {
    const rows = await query<{
      webhook_id: string;
      event: string;
      payload: Record<string, unknown>;
      attempt: number;
      retry_count: number;
    }>(
      `SELECT wd.webhook_id::text, wd.event, wd.payload, wd.attempt, w.retry_count
       FROM webhook_deliveries wd
       JOIN webhooks w ON w.id = wd.webhook_id
       WHERE wd.status = 'failed'
         AND wd.attempt < w.retry_count
       ORDER BY wd.created_at ASC
       LIMIT 100`,
    );
    for (const row of rows.rows) {
      await webhookQueue.add('deliver-webhook', {
        webhookId: row.webhook_id,
        event: row.event,
        payload: row.payload,
        attempt: row.attempt + 1,
      });
      await query(
        `UPDATE webhook_deliveries
         SET status = 'retrying'
         WHERE webhook_id = $1::uuid
           AND event = $2
           AND attempt = $3`,
        [row.webhook_id, row.event, row.attempt],
      );
    }
  },
};
