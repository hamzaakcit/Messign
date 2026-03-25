import { Router } from 'express';
import { eventBus } from '../events/index.js';
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
import { emitToUser } from '../sockets/index.js';
import { addEmployeeXP } from '../db/employeesDb.js';
import { query } from '../db/index.js';
import {
  summarizeConversation,
  detectActionItems,
  getKBSuggestions,
  generateSmartReplies,
  slashSearch,
  resolveEmbeddedCard,
  awardChatXP,
} from '../services/chat/index.js';

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
  const extended = row as unknown as Record<string, unknown>;
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
    reactions: (extended.reactions as unknown[]) ?? [],
    isEdited: !!extended.edited_at,
    isPinned: !!extended.is_pinned,
    metadata: (extended.metadata as Record<string, unknown>) ?? {},
    threadId: (extended.thread_id as string | null) ?? null,
    replyCount: (extended.reply_count as number) ?? 0,
  };
}

function getUserId(req: { userId?: string; headers: Record<string, unknown> }): string | null {
  return (req as { userId?: string }).userId ?? (req.headers['x-user-id'] as string) ?? null;
}

// ══════════════════════════════════════
// Original endpoints
// ══════════════════════════════════════

chatRouter.post('/dm', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { otherUserId } = req.body;
    if (!otherUserId || typeof otherUserId !== 'string') { res.status(400).json({ error: 'otherUserId is required' }); return; }
    if (otherUserId === userId) { res.status(400).json({ error: 'Cannot create DM with yourself' }); return; }
    const channel = await findOrCreateDmChannel(userId, otherUserId);
    res.status(200).json(toClientChannel(channel));
  } catch (e) {
    console.error('[chat] POST /dm', e);
    res.status(500).json({ error: 'Failed to create direct message' });
  }
});

chatRouter.get('/channels', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const rows = await getChannelsForUser(userId);
    res.json(rows.map(toClientChannel));
  } catch (e) {
    console.error('[chat] GET /channels', e);
    res.status(500).json({ error: 'Failed to load channels' });
  }
});

chatRouter.get('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const channel = await getChannelById(channelId);
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
    const rows = await getMessagesForChannel(channelId);
    res.json(rows.map(toClientMessage));
  } catch (e) {
    console.error('[chat] GET /channels/:id/messages', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

chatRouter.post('/channels/:id/read', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await markChannelAsReadForUser(channelId, userId);
    res.status(204).send();
  } catch (e) {
    console.error('[chat] POST /channels/:id/read', e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

chatRouter.post('/channels/:id/messages', async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channel = await getChannelById(channelId);
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
    const { content, attachments = [], mentions = [], metadata = {} } = req.body;
    const xpGained = 5;
    const message = await createMessage(channelId, userId, content ?? '', {
      attachments,
      mentions,
      xpGained,
    });

    // Store metadata (embedded cards, etc.) if provided
    if (metadata && Object.keys(metadata).length > 0) {
      await query(
        `UPDATE messages SET metadata = $1 WHERE id = $2`,
        [JSON.stringify(metadata), message.id],
      );
    }

    await addEmployeeXP(userId, xpGained);
    eventBus.emit('chat.message.sent', {
      messageId: message.id, channelId, userId, hasAttachment: attachments.length > 0, content: content ?? '',
    });
    const payload = toClientMessage(message);
    for (const memberId of channel.members) {
      emitToUser(memberId, 'message:new', payload);
    }
    res.status(201).json(payload);
  } catch (e) {
    console.error('[chat] POST /channels/:id/messages', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ══════════════════════════════════════
// Chat v2: Channel Management
// ══════════════════════════════════════

chatRouter.post('/channels/create', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { name, description, type = 'public', members = [] } = req.body;
    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'Channel name is required' }); return; }

    const result = await query<{ id: string }>(
      `INSERT INTO channels (name, description, type) VALUES ($1, $2, $3) RETURNING id`,
      [name.trim(), description ?? null, type],
    );
    const channelId = result.rows[0]?.id;
    if (!channelId) { res.status(500).json({ error: 'Failed to create channel' }); return; }

    const allMembers = Array.from(new Set([userId, ...members]));
    for (const memberId of allMembers) {
      await query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [channelId, memberId],
      );
    }

    const channel = await getChannelById(channelId);
    if (channel) res.status(201).json(toClientChannel(channel));
    else res.status(201).json({ id: channelId, name, description, type, members: allMembers });
  } catch (e) {
    console.error('[chat] POST /channels/create', e);
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

chatRouter.put('/channels/:id', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { name, description, topic } = req.body;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (topic !== undefined) { sets.push(`topic = $${idx++}`); params.push(topic); }
    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await query(`UPDATE channels SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    const channel = await getChannelById(req.params.id);
    if (channel) res.json(toClientChannel(channel));
    else res.status(404).json({ error: 'Channel not found' });
  } catch (e) {
    console.error('[chat] PUT /channels/:id', e);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// ══════════════════════════════════════
// Chat v2: Message Actions
// ══════════════════════════════════════

chatRouter.post('/channels/:id/messages/:mid/react', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { emoji, action = 'add' } = req.body;
    if (!emoji) { res.status(400).json({ error: 'Emoji is required' }); return; }
    const { id: channelId, mid: messageId } = req.params;

    if (action === 'remove') {
      await query(
        `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji],
      );
    } else {
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [messageId, userId, emoji],
      );
    }

    const reactions = await query<{ emoji: string; user_id: string }>(
      `SELECT emoji, user_id FROM message_reactions WHERE message_id = $1`,
      [messageId],
    );

    const grouped: Record<string, string[]> = {};
    for (const r of reactions.rows) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r.user_id);
    }
    const reactionList = Object.entries(grouped).map(([em, users]) => ({ emoji: em, users }));

    const channel = await getChannelById(channelId);
    if (channel) {
      for (const memberId of channel.members) {
        void emitToUser(memberId, 'message:react', { messageId, channelId, reactions: reactionList });
      }
    }

    res.json({ reactions: reactionList });
  } catch (e) {
    console.error('[chat] POST /react', e);
    res.status(500).json({ error: 'Failed to react' });
  }
});

chatRouter.post('/channels/:id/messages/:mid/pin', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id: channelId, mid: messageId } = req.params;

    const current = await query<{ is_pinned: boolean }>(
      `SELECT is_pinned FROM messages WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId],
    );
    if (current.rows.length === 0) { res.status(404).json({ error: 'Message not found' }); return; }

    const newPinState = !current.rows[0]!.is_pinned;
    await query(`UPDATE messages SET is_pinned = $1 WHERE id = $2`, [newPinState, messageId]);

    const channel = await getChannelById(channelId);
    if (channel) {
      for (const memberId of channel.members) {
        void emitToUser(memberId, 'message:pin', { messageId, channelId, isPinned: newPinState, pinnedBy: userId });
      }
    }

    res.json({ messageId, isPinned: newPinState });
  } catch (e) {
    console.error('[chat] POST /pin', e);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

chatRouter.put('/channels/:id/messages/:mid', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id: channelId, mid: messageId } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== 'string') { res.status(400).json({ error: 'Content is required' }); return; }

    const existing = await query<{ user_id: string }>(
      `SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId],
    );
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Message not found' }); return; }
    if (existing.rows[0]!.user_id !== userId) { res.status(403).json({ error: 'Can only edit own messages' }); return; }

    await query(
      `UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2`,
      [content, messageId],
    );

    const channel = await getChannelById(channelId);
    if (channel) {
      for (const memberId of channel.members) {
        void emitToUser(memberId, 'message:edit', { messageId, channelId, content, editedAt: new Date().toISOString() });
      }
    }

    res.json({ messageId, content, isEdited: true });
  } catch (e) {
    console.error('[chat] PUT /message', e);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

chatRouter.delete('/channels/:id/messages/:mid', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id: channelId, mid: messageId } = req.params;

    const existing = await query<{ user_id: string }>(
      `SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2`,
      [messageId, channelId],
    );
    if (existing.rows.length === 0) { res.status(404).json({ error: 'Message not found' }); return; }
    if (existing.rows[0]!.user_id !== userId) { res.status(403).json({ error: 'Can only delete own messages' }); return; }

    await query(`UPDATE messages SET is_deleted = TRUE, content = '[deleted]' WHERE id = $1`, [messageId]);

    const channel = await getChannelById(channelId);
    if (channel) {
      for (const memberId of channel.members) {
        void emitToUser(memberId, 'message:delete', { messageId, channelId });
      }
    }

    res.status(204).send();
  } catch (e) {
    console.error('[chat] DELETE /message', e);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ══════════════════════════════════════
// Chat v2: Pins & Media
// ══════════════════════════════════════

chatRouter.get('/channels/:id/pins', async (req, res) => {
  try {
    const channelId = req.params.id;
    const result = await query<{
      id: string; channel_id: string; user_id: string; content: string;
      attachments: unknown; mentions: unknown; xp_gained: number;
      created_at: string; sender_name: string | null; sender_avatar: string | null;
      edited_at: string | null; is_pinned: boolean; metadata: unknown;
    }>(
      `SELECT m.id, m.channel_id, m.user_id, m.content,
              m.attachments, m.mentions, m.xp_gained, m.created_at,
              COALESCE(u.full_name, m.user_id) AS sender_name,
              u.avatar_url AS sender_avatar,
              m.edited_at, m.is_pinned, m.metadata
       FROM messages m
       LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
       WHERE m.channel_id = $1 AND m.is_pinned = TRUE AND m.is_deleted = FALSE
       ORDER BY m.created_at DESC`,
      [channelId],
    );
    res.json(result.rows.map((r) => ({
      id: r.id, channelId: r.channel_id, userId: r.user_id, content: r.content,
      attachments: r.attachments ?? [], mentions: r.mentions ?? [],
      xpGained: r.xp_gained, timestamp: r.created_at,
      senderName: r.sender_name, senderAvatar: r.sender_avatar ?? undefined,
      isEdited: !!r.edited_at, isPinned: true, metadata: r.metadata ?? {},
    })));
  } catch (e) {
    console.error('[chat] GET /pins', e);
    res.status(500).json({ error: 'Failed to load pins' });
  }
});

chatRouter.get('/channels/:id/media', async (req, res) => {
  try {
    const channelId = req.params.id;
    const result = await query<{
      id: string; user_id: string; attachments: unknown[];
      created_at: string; sender_name: string | null;
    }>(
      `SELECT m.id, m.user_id, m.attachments, m.created_at,
              COALESCE(u.full_name, m.user_id) AS sender_name
       FROM messages m
       LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
       WHERE m.channel_id = $1
         AND m.is_deleted = FALSE
         AND jsonb_array_length(m.attachments) > 0
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [channelId],
    );
    const media = result.rows.flatMap((r) =>
      (r.attachments as Array<{ id?: string; name?: string; type?: string; url?: string; size?: number }>).map((att) => ({
        ...att,
        messageId: r.id,
        sharedBy: r.sender_name,
        sharedAt: r.created_at,
      })),
    );
    res.json(media);
  } catch (e) {
    console.error('[chat] GET /media', e);
    res.status(500).json({ error: 'Failed to load media' });
  }
});

// ══════════════════════════════════════
// Chat v2: Search
// ══════════════════════════════════════

chatRouter.get('/search', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const q = (req.query.q as string) ?? '';
    const channelIdFilter = req.query.channelId as string | undefined;
    if (!q.trim()) { res.json([]); return; }

    const params: unknown[] = [q];
    let whereExtra = '';
    if (channelIdFilter) {
      whereExtra = ` AND m.channel_id = $2`;
      params.push(channelIdFilter);
    }

    const result = await query<{
      id: string; channel_id: string; user_id: string; content: string;
      created_at: string; sender_name: string | null; channel_name: string;
    }>(
      `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
              COALESCE(u.full_name, m.user_id) AS sender_name,
              c.name AS channel_name
       FROM messages m
       LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
       JOIN channels c ON c.id = m.channel_id
       WHERE m.is_deleted = FALSE
         AND m.content_tsv @@ plainto_tsquery('english', $1)${whereExtra}
       ORDER BY ts_rank(m.content_tsv, plainto_tsquery('english', $1)) DESC
       LIMIT 30`,
      params,
    );

    res.json(result.rows.map((r) => ({
      id: r.id, channelId: r.channel_id, userId: r.user_id,
      content: r.content, timestamp: r.created_at,
      senderName: r.sender_name, channelName: r.channel_name,
    })));
  } catch (e) {
    console.error('[chat] GET /search', e);
    // Fallback to ILIKE if FTS fails
    try {
      const q = (req.query.q as string) ?? '';
      const result = await query<{
        id: string; channel_id: string; user_id: string; content: string;
        created_at: string; sender_name: string | null; channel_name: string;
      }>(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                COALESCE(u.full_name, m.user_id) AS sender_name,
                c.name AS channel_name
         FROM messages m
         LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE m.is_deleted = FALSE AND m.content ILIKE $1
         ORDER BY m.created_at DESC
         LIMIT 30`,
        [`%${q}%`],
      );
      res.json(result.rows.map((r) => ({
        id: r.id, channelId: r.channel_id, userId: r.user_id,
        content: r.content, timestamp: r.created_at,
        senderName: r.sender_name, channelName: r.channel_name,
      })));
    } catch (e2) {
      console.error('[chat] GET /search fallback', e2);
      res.status(500).json({ error: 'Failed to search messages' });
    }
  }
});

// ══════════════════════════════════════
// Chat v2: Slash Commands
// ══════════════════════════════════════

chatRouter.get('/slash/search', async (req, res) => {
  try {
    const type = (req.query.type as string) ?? 'all';
    const q = (req.query.q as string) ?? '';
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const results = await slashSearch(type as 'task' | 'document' | 'user' | 'all', q, limit);
    res.json(results);
  } catch (e) {
    console.error('[chat] GET /slash/search', e);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ══════════════════════════════════════
// Chat v2: Embedded Cards
// ══════════════════════════════════════

chatRouter.get('/channels/:id/embed/:type/:refId', async (req, res) => {
  try {
    const card = await resolveEmbeddedCard(req.params.type, req.params.refId);
    if (!card) { res.status(404).json({ error: 'Card not found' }); return; }
    res.json(card);
  } catch (e) {
    console.error('[chat] GET /embed', e);
    res.status(500).json({ error: 'Failed to resolve embed' });
  }
});

// ══════════════════════════════════════
// Chat v2: Dora AI Integration
// ══════════════════════════════════════

chatRouter.post('/channels/:id/dora/summarize', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const messageCount = Math.min(Number(req.body.messageCount) || 50, 100);
    const result = await summarizeConversation(req.params.id, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/summarize', e);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

chatRouter.post('/channels/:id/dora/action-items', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const messageCount = Math.min(Number(req.body.messageCount) || 30, 50);
    const result = await detectActionItems(req.params.id, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/action-items', e);
    res.status(500).json({ error: 'Failed to detect action items' });
  }
});

chatRouter.post('/channels/:id/dora/smart-reply', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const result = await generateSmartReplies(req.params.id, userId);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/smart-reply', e);
    res.status(500).json({ error: 'Failed to generate smart replies' });
  }
});

chatRouter.post('/channels/:id/dora/suggest', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { question } = req.body;
    if (!question) { res.status(400).json({ error: 'Question is required' }); return; }
    const result = await getKBSuggestions(req.params.id, question);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/suggest', e);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// ══════════════════════════════════════
// Chat v2: Gamification
// ══════════════════════════════════════

chatRouter.post('/channels/:id/xp/award', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { event, targetUserId } = req.body;
    const result = await awardChatXP(
      targetUserId ?? userId,
      event,
      { channelId: req.params.id },
    );
    res.json(result ?? { amount: 0, total: 0 });
  } catch (e) {
    console.error('[chat] POST /xp/award', e);
    res.status(500).json({ error: 'Failed to award XP' });
  }
});
