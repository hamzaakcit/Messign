import { Router } from 'express';
import { query } from '../../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';

const notificationsRouter = Router();
notificationsRouter.use(reimbursementAuth);

notificationsRouter.get('/', async (req: ReimbursementRequest, res) => {
  try {
    const unread = req.query.unread === 'true';
    const moduleFilter = typeof req.query.module === 'string' ? req.query.module : null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
    const offset = (page - 1) * limit;
    const rows = await query(
      `SELECT id::text, user_id::text, type, title, message, link, module, severity, is_read, read_at::text, created_at::text
       FROM notifications
       WHERE user_id = $1::uuid
         AND ($2::boolean = FALSE OR is_read = FALSE)
         AND ($3::text IS NULL OR module = $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [req.reimbursementUser!.id, unread, moduleFilter, limit, offset],
    );
    res.json(rows.rows);
  } catch (error) {
    console.error('[notifications/list]', error);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

notificationsRouter.get('/unread-count', async (req: ReimbursementRequest, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1::uuid
         AND is_read = FALSE`,
      [req.reimbursementUser!.id],
    );
    res.json({ count: Number(result.rows[0]?.count ?? 0) });
  } catch (error) {
    console.error('[notifications/unread-count]', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

notificationsRouter.put('/:id/read', async (req: ReimbursementRequest, res) => {
  try {
    await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2::uuid`,
      [req.params.id, req.reimbursementUser!.id],
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[notifications/read]', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

notificationsRouter.put('/read-all', async (req: ReimbursementRequest, res) => {
  try {
    await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1::uuid
         AND is_read = FALSE`,
      [req.reimbursementUser!.id],
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[notifications/read-all]', error);
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

notificationsRouter.delete('/:id', async (req: ReimbursementRequest, res) => {
  try {
    await query(
      `DELETE FROM notifications
       WHERE id = $1::uuid
         AND user_id = $2::uuid`,
      [req.params.id, req.reimbursementUser!.id],
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[notifications/delete]', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

notificationsRouter.get('/preferences', async (req: ReimbursementRequest, res) => {
  try {
    const rows = await query(
      `SELECT id::text, event_type, in_app, email, push
       FROM notification_preferences
       WHERE user_id = $1::uuid
       ORDER BY event_type ASC`,
      [req.reimbursementUser!.id],
    );
    res.json(rows.rows);
  } catch (error) {
    console.error('[notifications/preferences]', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

notificationsRouter.put('/preferences', async (req: ReimbursementRequest, res) => {
  try {
    const preferences = Array.isArray(req.body) ? req.body : [];
    for (const pref of preferences) {
      await query(
        `INSERT INTO notification_preferences (user_id, event_type, in_app, email, push)
         VALUES ($1::uuid, $2, $3, $4, COALESCE($5, FALSE))
         ON CONFLICT (user_id, event_type)
         DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, push = EXCLUDED.push`,
        [
          req.reimbursementUser!.id,
          String(pref.event_type),
          Boolean(pref.in_app),
          Boolean(pref.email),
          Boolean(pref.push),
        ],
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[notifications/preferences/update]', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

export default notificationsRouter;
