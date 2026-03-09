import { Router } from 'express';
import { query } from '../db/index.js';
import { getChannelById, getChannelsForUser, getMessagesForChannel, createChannel as createChannelDb, addMessage as addMessageDb, type ChannelRow } from '../db/chatDb.js';
import { addEmployeeXP } from '../db/employeesDb.js';
import { eventBus } from '../events/index.js';

export const channelsRouter = Router();

function toClientChannel(row: ChannelRow | null) {
  if (!row) return null;
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

// Get all channels for current user (from JWT or X-User-Id)
channelsRouter.get('/', async (req, res) => {
  try {
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'User ID required (login or X-User-Id)' });
      return;
    }
    const rows = await getChannelsForUser(userId);
    res.json(rows.map((r) => ({ id: r.id, name: r.name, description: r.description ?? undefined, type: r.type, members: r.members, unreadCount: r.unread_count, createdAt: r.created_at })));
  } catch (e) {
    console.error('[channels]', e);
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

// Get messages for a channel (DB with sender name/avatar) — must be before GET /:id
channelsRouter.get('/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const channel = await getChannelById(channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const rows = await getMessagesForChannel(channelId);
    res.json(rows.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      userId: r.user_id,
      content: r.content,
      attachments: r.attachments ?? [],
      mentions: r.mentions ?? [],
      xpGained: r.xp_gained,
      timestamp: r.created_at,
      senderName: r.sender_name,
      senderAvatar: r.sender_avatar ?? undefined,
    })));
  } catch (e) {
    console.error('[channels] messages', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Get channel by ID
channelsRouter.get('/:id', async (req, res) => {
  try {
    const channel = await getChannelById(req.params.id);
    const out = toClientChannel(channel);
    if (out) res.json(out);
    else res.status(404).json({ error: 'Channel not found' });
  } catch (e) {
    console.error('[channels]', e);
    res.status(500).json({ error: 'Failed to load channel' });
  }
});

// POST /channels/:id/messages — save message to DB
channelsRouter.post('/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'User ID required (login or X-User-Id)' });
      return;
    }
    const channel = await getChannelById(channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const { content, attachments = [], mentions = [] } = req.body;
    const xpGained = 5;
    const row = await addMessageDb({
      channelId,
      userId,
      content: content ?? '',
      attachments,
      mentions,
      xpGained,
    });
    await addEmployeeXP(userId, xpGained);
    eventBus.emit('chat.message.sent', {
      messageId: row.id, channelId, userId, hasAttachment: attachments.length > 0,
    });
    res.status(201).json({
      id: row.id,
      channelId: row.channel_id,
      userId: row.user_id,
      content: row.content,
      attachments: row.attachments ?? [],
      mentions: row.mentions ?? [],
      xpGained: row.xp_gained,
      timestamp: row.created_at,
    });
  } catch (e) {
    console.error('[channels] POST messages', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Create new channel (DB)
channelsRouter.post('/', async (req, res) => {
  try {
    const userId = (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string);
    const { name, description, type, members } = req.body;
    const memberIds = Array.isArray(members) ? members : (userId ? [userId] : []);
    const channel = await createChannelDb({
      name: name ?? 'new-channel',
      description: description ?? null,
      type: type ?? 'public',
      memberIds: memberIds.length ? memberIds : (userId ? [userId] : []),
    });
    res.status(201).json(toClientChannel(channel));
  } catch (e) {
    console.error('[channels]', e);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// Mark channel as read
channelsRouter.post('/:id/read', async (req, res) => {
  try {
    await query(`UPDATE channels SET unread_count = 0, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    const channel = await getChannelById(req.params.id);
    const out = toClientChannel(channel);
    if (out) res.json(out);
    else res.status(404).json({ error: 'Channel not found' });
  } catch (e) {
    console.error('[channels]', e);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});
