import { Router } from 'express';
import { query } from '../../db/index.js';
import { reimbursementAuth, requireAdmin, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { AVAILABLE_WEBHOOK_EVENTS, webhookService } from '../../services/webhookService.js';

const webhookRouter = Router();

webhookRouter.use(reimbursementAuth);
webhookRouter.use(requireAdmin);

webhookRouter.get('/', async (req: ReimbursementRequest, res) => {
  try {
    const rows = await query(
      `SELECT id, name, url, events, headers, is_active, retry_count, last_triggered_at, last_status_code, failure_count, created_at
       FROM webhooks
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
       ORDER BY created_at DESC`,
      [req.organizationId ?? null],
    );
    res.json(rows.rows);
  } catch (error) {
    console.error('[webhooks/list]', error);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

webhookRouter.post('/', async (req: ReimbursementRequest, res) => {
  try {
    const { name, url, secret, events, headers, retry_count } = req.body;
    const row = await query(
      `INSERT INTO webhooks (organization_id, name, url, secret, events, headers, retry_count, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::uuid)
       RETURNING *`,
      [
        req.organizationId ?? null,
        name,
        url,
        secret,
        JSON.stringify(Array.isArray(events) ? events : []),
        JSON.stringify(headers ?? {}),
        Number(retry_count ?? 3),
        req.reimbursementUser?.id ?? null,
      ],
    );
    res.status(201).json(row.rows[0]);
  } catch (error) {
    console.error('[webhooks/create]', error);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

webhookRouter.put('/:id', async (req: ReimbursementRequest, res) => {
  try {
    const { name, url, secret, events, headers, retry_count } = req.body;
    const row = await query(
      `UPDATE webhooks
       SET name = COALESCE($1, name),
           url = COALESCE($2, url),
           secret = COALESCE($3, secret),
           events = COALESCE($4::jsonb, events),
           headers = COALESCE($5::jsonb, headers),
           retry_count = COALESCE($6, retry_count),
           updated_at = NOW()
       WHERE id = $7::uuid
       RETURNING *`,
      [
        name ?? null,
        url ?? null,
        secret ?? null,
        events ? JSON.stringify(events) : null,
        headers ? JSON.stringify(headers) : null,
        retry_count ?? null,
        req.params.id,
      ],
    );
    res.json(row.rows[0] ?? null);
  } catch (error) {
    console.error('[webhooks/update]', error);
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

webhookRouter.delete('/:id', async (req: ReimbursementRequest, res) => {
  try {
    await query('DELETE FROM webhooks WHERE id = $1::uuid', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[webhooks/delete]', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

webhookRouter.put('/:id/toggle', async (req: ReimbursementRequest, res) => {
  try {
    const row = await query(
      `UPDATE webhooks
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, is_active`,
      [req.params.id],
    );
    res.json(row.rows[0] ?? null);
  } catch (error) {
    console.error('[webhooks/toggle]', error);
    res.status(500).json({ error: 'Failed to toggle webhook' });
  }
});

webhookRouter.get('/available-events', (_req, res) => {
  res.json(AVAILABLE_WEBHOOK_EVENTS);
});

webhookRouter.get('/:id/deliveries', async (req: ReimbursementRequest, res) => {
  try {
    const rows = await query(
      `SELECT id, event, status, status_code, response_time_ms, attempt, error_message, delivered_at, created_at
       FROM webhook_deliveries
       WHERE webhook_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.params.id],
    );
    res.json(rows.rows);
  } catch (error) {
    console.error('[webhooks/deliveries]', error);
    res.status(500).json({ error: 'Failed to list deliveries' });
  }
});

webhookRouter.post('/:id/test', async (req: ReimbursementRequest, res) => {
  try {
    await webhookService.deliverWebhook(
      req.params.id,
      'webhook.test',
      {
        type: 'webhook.test',
        generatedAt: new Date().toISOString(),
        organizationId: req.organizationId,
      },
      1,
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[webhooks/test]', error);
    res.status(500).json({ error: 'Failed to send test webhook' });
  }
});

export default webhookRouter;
