import { Router } from 'express';
import type { Server } from 'socket.io';
import {
  getChannelsForUser,
  getMessagesForChannel,
  createMessage,
  getChannelById,
  findOrCreateDmChannel,
  markChannelAsReadForUser,
  type ChannelRow,
  type MessageWithSender,
} from '../db/chatDb.js';
import { addEmployeeXP } from '../db/employeesDb.js';

export const chatRouter = Router();

function toClientChannel(row: ChannelRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    type: row.type as 'public' | 'private' | 'dm',
    members: row.members,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  };
}

function toClientMessage(row: MessageWithSender) {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    content: row.content,
    attachments: row.attachments ?? [],
    mentions: row.mentions ?? [],
    xpGained: row.xp_gained,
    timestamp: row.created_at,
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar ?? undefined,
  };
}

/** POST /api/chat/dm — find or create a DM channel with another user. Body: { otherUserId }. */
chatRouter.post('/dm', async (req, res) => {
  try {
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Login required' });
      return;
    }
    const { otherUserId } = req.body;
    if (!otherUserId || typeof otherUserId !== 'string') {
      res.status(400).json({ error: 'otherUserId is required' });
      return;
    }
    if (otherUserId === userId) {
      res.status(400).json({ error: 'Cannot create DM with yourself' });
      return;
    }
    const channel = await findOrCreateDmChannel(userId, otherUserId);
    res.status(200).json(toClientChannel(channel));
  } catch (e) {
    console.error('[chat] POST /dm', e);
    res.status(500).json({ error: 'Failed to create direct message' });
  }
});

/** GET /api/chat/channels — channels for the logged-in user (JWT required). */
chatRouter.get('/channels', async (req, res) => {
  try {
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Login required to load channels' });
      return;
    }
    const rows = await getChannelsForUser(userId);
    res.json(rows.map(toClientChannel));
  } catch (e) {
    console.error('[chat] GET /channels', e);
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

/** GET /api/chat/channels/:id/messages — messages for a channel (with sender name/avatar). */
chatRouter.get('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const channel = await getChannelById(channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const rows = await getMessagesForChannel(channelId);
    res.json(rows.map(toClientMessage));
  } catch (e) {
    console.error('[chat] GET /channels/:id/messages', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/** POST /api/chat/channels/:id/read — mark channel as read for the current user. */
chatRouter.post('/channels/:id/read', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Login required' });
      return;
    }
    await markChannelAsReadForUser(channelId, userId);
    res.status(204).send();
  } catch (e) {
    console.error('[chat] POST /channels/:id/read', e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/** POST /api/chat/channels/:id/messages — send a message (logged-in user). */
chatRouter.post('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'Login required to send messages' });
      return;
    }
    const channel = await getChannelById(channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const { content, attachments = [], mentions = [] } = req.body;
    const xpGained = 5;
    const message = await createMessage(channelId, userId, content ?? '', {
      attachments,
      mentions,
      xpGained,
    });
    await addEmployeeXP(userId, xpGained);
    const payload = toClientMessage(message);
    const io = req.app.get('io') as Server | undefined;
    if (io) io.to(channelId).emit('message:new', payload);
    res.status(201).json(payload);
  } catch (e) {
    console.error('[chat] POST /channels/:id/messages', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});
