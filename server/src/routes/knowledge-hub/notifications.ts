import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const notificationsRouter = Router();
type AuthReq = Request & { userId: string };

notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await db.listNotifications((req as AuthReq).userId, unreadOnly);
    res.json(notifications);
  } catch (e) {
    console.error('[kh-notifications] list:', e);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await db.markNotificationRead(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-notifications] read:', e);
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

notificationsRouter.post('/read-all', async (req: Request, res: Response) => {
  try {
    await db.markAllNotificationsRead((req as AuthReq).userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-notifications] read-all:', e);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});
