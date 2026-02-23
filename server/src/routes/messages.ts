import { Router } from 'express';
import { getMessagesForChannel, addMessage } from '../db/chatDb.js';
import { addEmployeeXP } from '../db/employeesDb.js';

export const messagesRouter = Router();

function toClientMessage(row: {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachments: unknown[];
  mentions: unknown[];
  xp_gained: number;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
}) {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    content: row.content,
    attachments: row.attachments ?? [],
    mentions: row.mentions ?? [],
    xpGained: row.xp_gained,
    timestamp: row.created_at,
    ...(row.sender_name != null && { senderName: row.sender_name }),
    ...(row.sender_avatar != null && { senderAvatar: row.sender_avatar }),
  };
}

// Get messages for a channel (DB with sender name/avatar)
messagesRouter.get('/channel/:channelId', async (req, res) => {
  try {
    const rows = await getMessagesForChannel(req.params.channelId);
    res.json(rows.map((r) => toClientMessage(r)));
  } catch (e) {
    console.error('[messages]', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send a message (userId from JWT or body)
messagesRouter.post('/', async (req, res) => {
  try {
    const authUserId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    const { channelId, userId: bodyUserId, content, attachments = [], mentions = [] } = req.body;
    const userId = bodyUserId ?? authUserId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'User ID required (login or body.userId)' });
      return;
    }
    const xpGained = 5;
    const row = await addMessage({
      channelId,
      userId,
      content,
      attachments,
      mentions,
      xpGained,
    });
    await addEmployeeXP(userId, xpGained);
    res.status(201).json(toClientMessage(row));
  } catch (e) {
    console.error('[messages]', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});
