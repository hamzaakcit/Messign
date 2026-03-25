import { Router } from 'express';
import { eventBus } from '../events/index.js';
import {
  getChannelsForUser,
  getChannelIdsForUser,
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
  summarizeThread,
  detectThreadActionItems,
  extractDecisions,
  extractDecisionsThread,
  transformMessage,
  transformDraft,
  MAX_DRAFT_CHARS,
} from '../services/chat/index.js';
import type { DoraTransformAction } from '../services/chat/index.js';
import { allowChatAiRequest } from '../services/chat/chatAiRateLimit.js';
import { playRpsDuel, playCoinDuel, playChamberDuel } from '../services/chat/duelService.js';
import type { RpsMove } from '../services/chat/duelService.js';
import { assertDuelRateLimit } from '../services/chat/duelRateLimit.js';
import {
  createTwoPlayerInvite,
  joinTwoPlayerInvite,
  revealTwoPlayerInvite,
  getTwoPlayerInviteStatus,
} from '../services/chat/duelTwoPlayerService.js';

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

const VALID_CHANNEL_TYPES = ['public', 'private', 'dm'];
const VALID_XP_EVENTS = [
  'chat.question.answered', 'chat.blocker.resolved',
  'chat.task.created_from_chat', 'chat.message.reacted', 'chat.message.pinned',
  'chat.dora.transform_used',
];

async function checkChannelMembership(channelId: string, userId: string): Promise<boolean> {
  const channel = await getChannelById(channelId);
  if (!channel) return false;
  if (channel.type === 'public') return true;
  return channel.members.includes(userId);
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
    const userId = getUserId(req as never);
    const channel = await getChannelById(channelId);
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
    if (userId && !(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
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
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const { content, attachments = [], mentions = [], metadata = {}, threadId } = req.body;
    const xpGained = 5;
    const message = await createMessage(channelId, userId, content ?? '', {
      attachments,
      mentions,
      xpGained,
    });

    // Store metadata (embedded cards, etc.) if provided
    const updates: string[] = [];
    const updateParams: unknown[] = [];
    let paramIdx = 1;
    if (metadata && Object.keys(metadata).length > 0) {
      updates.push(`metadata = $${paramIdx++}`);
      updateParams.push(JSON.stringify(metadata));
    }
    if (threadId) {
      updates.push(`thread_id = $${paramIdx++}`);
      updateParams.push(threadId);
    }
    if (updates.length > 0) {
      updateParams.push(message.id);
      await query(`UPDATE messages SET ${updates.join(', ')} WHERE id = $${paramIdx}`, updateParams);
    }

    // Increment reply_count on parent if this is a thread reply
    if (threadId) {
      await query(
        `UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1`,
        [threadId],
      );
      const parentCount = await query<{ reply_count: number }>(
        `SELECT reply_count FROM messages WHERE id = $1`, [threadId],
      );
      for (const memberId of channel.members) {
        void emitToUser(memberId, 'thread:reply', {
          messageId: message.id, channelId, threadId,
          replyCount: parentCount.rows[0]?.reply_count ?? 1,
        });
      }
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
    if (!VALID_CHANNEL_TYPES.includes(type)) { res.status(400).json({ error: `Invalid channel type. Must be: ${VALID_CHANNEL_TYPES.join(', ')}` }); return; }

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
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }

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
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }

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
  type SearchRow = {
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    created_at: string;
    sender_name: string | null;
    channel_name: string;
  };

  const mapRow = (r: SearchRow) => ({
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    content: r.content,
    timestamp: r.created_at,
    senderName: r.sender_name,
    channelName: r.channel_name,
  });

  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const q = (req.query.q as string) ?? '';
    const channelIdFilter = req.query.channelId as string | undefined;
    if (!q.trim()) { res.json([]); return; }

    const allowedIds = await getChannelIdsForUser(userId);
    if (allowedIds.length === 0) { res.json([]); return; }

    let channelIds = allowedIds;
    if (channelIdFilter) {
      if (!allowedIds.includes(channelIdFilter)) {
        res.status(403).json({ error: 'Not a member of this channel' });
        return;
      }
      channelIds = [channelIdFilter];
    }

    const safeIlike = q.replace(/[%_]/g, '').trim();

    const runFts = () =>
      query<SearchRow>(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                COALESCE(u.full_name, m.user_id) AS sender_name,
                c.name AS channel_name
         FROM messages m
         LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE m.is_deleted = FALSE
           AND m.channel_id = ANY($2::uuid[])
           AND m.content_tsv @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(m.content_tsv, plainto_tsquery('english', $1)) DESC
         LIMIT 30`,
        [q, channelIds],
      );

    const runIlike = (pattern: string) =>
      query<SearchRow>(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                COALESCE(u.full_name, m.user_id) AS sender_name,
                c.name AS channel_name
         FROM messages m
         LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE m.is_deleted = FALSE
           AND m.channel_id = ANY($1::uuid[])
           AND m.content ILIKE $2
         ORDER BY m.created_at DESC
         LIMIT 30`,
        [channelIds, pattern],
      );

    /** Fallback when `content_tsv` is missing or not backfilled — rank on live `content`. */
    const runFtsOnContentColumn = () =>
      query<SearchRow>(
        `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                COALESCE(u.full_name, m.user_id) AS sender_name,
                c.name AS channel_name
         FROM messages m
         LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE m.is_deleted = FALSE
           AND m.channel_id = ANY($2::uuid[])
           AND to_tsvector('english', COALESCE(m.content, '')) @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(to_tsvector('english', COALESCE(m.content, '')), plainto_tsquery('english', $1)) DESC
         LIMIT 30`,
        [q, channelIds],
      );

    let result: { rows: SearchRow[] };
    try {
      result = await runFts();
    } catch (e) {
      console.error('[chat] GET /search FTS', e);
      result = { rows: [] };
    }

    if (result.rows.length === 0) {
      try {
        result = await runFtsOnContentColumn();
      } catch (e) {
        console.error('[chat] GET /search FTS on content', e);
        result = { rows: [] };
      }
    }

    if (result.rows.length === 0 && safeIlike.length > 0) {
      try {
        result = await runIlike(`%${safeIlike}%`);
      } catch (e2) {
        console.error('[chat] GET /search ILIKE', e2);
        res.status(500).json({ error: 'Failed to search messages' });
        return;
      }
    }

    res.json(result.rows.map(mapRow));
  } catch (e) {
    console.error('[chat] GET /search', e);
    res.status(500).json({ error: 'Failed to search messages' });
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
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    if (!(await checkChannelMembership(req.params.id, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
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
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    if (!(await checkChannelMembership(req.params.id, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
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
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    if (!(await checkChannelMembership(req.params.id, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const rawTid = (req.body as { threadId?: unknown })?.threadId;
    const threadId = typeof rawTid === 'string' && rawTid.trim() ? rawTid.trim() : undefined;
    const result = await generateSmartReplies(req.params.id, userId, 12, threadId);
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
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    if (!(await checkChannelMembership(req.params.id, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return; }
    const { question } = req.body;
    if (!question) { res.status(400).json({ error: 'Question is required' }); return; }
    const result = await getKBSuggestions(req.params.id, question);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/suggest', e);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

const VALID_TRANSFORM_ACTIONS: DoraTransformAction[] = [
  'explain', 'shorten', 'expand', 'professional', 'friendly', 'translate',
];

chatRouter.post('/channels/:id/messages/:mid/dora/summarize-thread', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    const parentId = req.params.mid;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const messageCount = Math.min(Number((req.body as { messageCount?: unknown })?.messageCount) || 50, 100);
    const result = await summarizeThread(channelId, parentId, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/summarize-thread', e);
    res.status(500).json({ error: 'Failed to summarize thread' });
  }
});

chatRouter.post('/channels/:id/messages/:mid/dora/action-items-thread', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    const parentId = req.params.mid;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const messageCount = Math.min(Number((req.body as { messageCount?: unknown })?.messageCount) || 40, 80);
    const result = await detectThreadActionItems(channelId, parentId, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/action-items-thread', e);
    res.status(500).json({ error: 'Failed to detect thread action items' });
  }
});

chatRouter.post('/channels/:id/messages/:mid/dora/transform', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    const messageId = req.params.mid;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const action = (req.body as { action?: string })?.action;
    const targetLocale = (req.body as { targetLocale?: string })?.targetLocale;
    if (!action || !VALID_TRANSFORM_ACTIONS.includes(action as DoraTransformAction)) {
      res.status(400).json({ error: 'Invalid or missing action' }); return;
    }
    const out = await transformMessage(channelId, messageId, action as DoraTransformAction, targetLocale);
    if (!out) { res.status(404).json({ error: 'Message not found' }); return; }
    res.json(out);
  } catch (e) {
    console.error('[chat] POST /dora/transform', e);
    res.status(500).json({ error: 'Failed to transform message' });
  }
});

chatRouter.post('/channels/:id/dora/transform-draft', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const body = req.body as { text?: unknown; action?: unknown; targetLocale?: string };
    const text = typeof body.text === 'string' ? body.text : '';
    const action = typeof body.action === 'string' ? body.action : '';
    if (!text.trim()) { res.status(400).json({ error: 'text is required' }); return; }
    if (!VALID_TRANSFORM_ACTIONS.includes(action as DoraTransformAction)) {
      res.status(400).json({ error: 'Invalid or missing action' }); return;
    }
    if (text.length > MAX_DRAFT_CHARS) {
      res.status(400).json({ error: `Text exceeds ${MAX_DRAFT_CHARS} characters` }); return;
    }
    const out = await transformDraft(text, action as DoraTransformAction, body.targetLocale);
    res.json(out);
  } catch (e) {
    console.error('[chat] POST /dora/transform-draft', e);
    res.status(500).json({ error: 'Failed to transform draft' });
  }
});

chatRouter.post('/channels/:id/dora/decisions', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const messageCount = Math.min(Number((req.body as { messageCount?: unknown })?.messageCount) || 40, 80);
    const result = await extractDecisions(channelId, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/decisions', e);
    res.status(500).json({ error: 'Failed to extract decisions' });
  }
});

chatRouter.post('/channels/:id/messages/:mid/dora/decisions-thread', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!allowChatAiRequest(userId)) { res.status(429).json({ error: 'Too many AI requests. Try again shortly.' }); return; }
    const channelId = req.params.id;
    const parentMessageId = req.params.mid;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const messageCount = Math.min(Number((req.body as { messageCount?: unknown })?.messageCount) || 40, 80);
    const result = await extractDecisionsThread(channelId, parentMessageId, messageCount);
    res.json(result);
  } catch (e) {
    console.error('[chat] POST /dora/decisions-thread', e);
    res.status(500).json({ error: 'Failed to extract thread decisions' });
  }
});

// ══════════════════════════════════════
// Chat: channel duels (RPS, coin, chamber) — server RNG, membership required
// ══════════════════════════════════════

const RPS_MOVES = new Set<string>(['rock', 'paper', 'scissors']);

chatRouter.post('/channels/:id/duels/rps', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const move = (req.body as { move?: string })?.move;
    if (!move || !RPS_MOVES.has(move)) {
      res.status(400).json({ error: 'move must be rock, paper, or scissors' }); return;
    }
    res.json(playRpsDuel(move as RpsMove));
  } catch (e) {
    console.error('[chat] POST /duels/rps', e);
    res.status(500).json({ error: 'Duel failed' });
  }
});

chatRouter.post('/channels/:id/duels/coin', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const call = (req.body as { call?: string })?.call;
    if (call !== 'heads' && call !== 'tails') {
      res.status(400).json({ error: 'call must be heads or tails' }); return;
    }
    res.json(playCoinDuel(call));
  } catch (e) {
    console.error('[chat] POST /duels/coin', e);
    res.status(500).json({ error: 'Duel failed' });
  }
});

chatRouter.post('/channels/:id/duels/chamber', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const raw = (req.body as { chamber?: unknown })?.chamber;
    const chamber = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(chamber)) {
      res.status(400).json({ error: 'chamber must be a number 1–6' }); return;
    }
    res.json(playChamberDuel(chamber));
  } catch (e) {
    console.error('[chat] POST /duels/chamber', e);
    res.status(500).json({ error: 'Duel failed' });
  }
});

// RPS two-player (commit–reveal): invite → opponent joins → challenger reveals
chatRouter.get('/channels/:id/duels/rps/two-player/:inviteId', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const inviteId = req.params.inviteId;
    const st = getTwoPlayerInviteStatus(inviteId);
    res.json(st);
  } catch (e) {
    console.error('[chat] GET /duels/rps/two-player/:inviteId', e);
    res.status(500).json({ error: 'Failed to load invite' });
  }
});

chatRouter.post('/channels/:id/duels/rps/two-player/invite', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const commitmentHex = (req.body as { commitmentHex?: string })?.commitmentHex;
    if (!commitmentHex || typeof commitmentHex !== 'string') {
      res.status(400).json({ error: 'commitmentHex is required' }); return;
    }
    const out = createTwoPlayerInvite(channelId, userId, commitmentHex.trim());
    if ('error' in out) {
      res.status(out.status).json({ error: out.error }); return;
    }
    res.json(out);
  } catch (e) {
    console.error('[chat] POST /duels/rps/two-player/invite', e);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

chatRouter.post('/channels/:id/duels/rps/two-player/join', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const inviteId = (req.body as { inviteId?: string })?.inviteId;
    const move = (req.body as { move?: string })?.move;
    if (!inviteId || typeof inviteId !== 'string') {
      res.status(400).json({ error: 'inviteId is required' }); return;
    }
    if (!move || !RPS_MOVES.has(move)) {
      res.status(400).json({ error: 'move must be rock, paper, or scissors' }); return;
    }
    const out = joinTwoPlayerInvite(channelId, inviteId, userId, move as RpsMove);
    if ('error' in out) {
      res.status(out.status).json({ error: out.error }); return;
    }
    res.json(out);
  } catch (e) {
    console.error('[chat] POST /duels/rps/two-player/join', e);
    res.status(500).json({ error: 'Failed to join invite' });
  }
});

chatRouter.post('/channels/:id/duels/rps/two-player/reveal', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const channelId = req.params.id;
    if (!(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    if (assertDuelRateLimit(userId, channelId) === 'rate_limited') {
      res.status(429).json({ error: 'Too many duels in this channel. Try again in a minute.' });
      return;
    }
    const inviteId = (req.body as { inviteId?: string })?.inviteId;
    const move = (req.body as { move?: string })?.move;
    const salt = (req.body as { salt?: string })?.salt;
    if (!inviteId || typeof inviteId !== 'string') {
      res.status(400).json({ error: 'inviteId is required' }); return;
    }
    if (!move || !RPS_MOVES.has(move)) {
      res.status(400).json({ error: 'move must be rock, paper, or scissors' }); return;
    }
    if (!salt || typeof salt !== 'string') {
      res.status(400).json({ error: 'salt is required' }); return;
    }
    const out = revealTwoPlayerInvite(channelId, inviteId, userId, move as RpsMove, salt);
    if ('error' in out) {
      res.status(out.status).json({ error: out.error }); return;
    }
    res.json(out);
  } catch (e) {
    console.error('[chat] POST /duels/rps/two-player/reveal', e);
    res.status(500).json({ error: 'Failed to reveal duel' });
  }
});

// ══════════════════════════════════════
// Chat v2: Gamification
// ══════════════════════════════════════

// ══════════════════════════════════════
// Chat v2: Thread Messages
// ══════════════════════════════════════

chatRouter.get('/channels/:id/messages/:mid/thread', async (req, res) => {
  try {
    const { id: channelId, mid: messageId } = req.params;
    const userId = getUserId(req as never);
    if (userId && !(await checkChannelMembership(channelId, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
    const result = await query<MessageWithSender & { reactions: unknown; edited_at: string | null; is_pinned: boolean; metadata: unknown; thread_id: string | null; reply_count: number }>(
      `SELECT m.*, COALESCE(u.full_name, m.user_id) AS sender_name,
              u.avatar_url AS sender_avatar,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'users', r.users))
                 FROM (SELECT emoji, array_agg(user_id) AS users FROM message_reactions WHERE message_id = m.id GROUP BY emoji) r
                ), '[]'::jsonb
              ) AS reactions
       FROM messages m
       LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
       WHERE m.thread_id = $1 AND m.channel_id = $2 AND m.is_deleted = FALSE
       ORDER BY m.created_at ASC`,
      [messageId, channelId],
    );
    res.json(result.rows.map(toClientMessage));
  } catch (e) {
    console.error('[chat] GET /thread', e);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

// ══════════════════════════════════════
// Chat v2: Reaction Detail
// ══════════════════════════════════════

chatRouter.get('/channels/:id/messages/:mid/reactions', async (req, res) => {
  try {
    const { mid: messageId } = req.params;
    const result = await query<{ emoji: string; user_id: string; user_name: string; avatar_url: string | null }>(
      `SELECT r.emoji, r.user_id,
              COALESCE(u.full_name, r.user_id) AS user_name,
              u.avatar_url
       FROM message_reactions r
       LEFT JOIN reimbursement_users u ON u.auth_user_id = r.user_id OR u.id::text = r.user_id
       WHERE r.message_id = $1`,
      [messageId],
    );
    const grouped: Record<string, Array<{ id: string; name: string; avatar: string }>> = {};
    for (const r of result.rows) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push({ id: r.user_id, name: r.user_name, avatar: r.avatar_url ?? '' });
    }
    res.json(Object.entries(grouped).map(([emoji, users]) => ({ emoji, users })));
  } catch (e) {
    console.error('[chat] GET /reactions', e);
    res.status(500).json({ error: 'Failed to load reactions' });
  }
});

// ══════════════════════════════════════
// Chat v2: Universal Search
// ══════════════════════════════════════

chatRouter.get('/search/universal', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const q = (req.query.q as string) ?? '';
    if (!q.trim()) { res.json({ messages: [], tasks: [], documents: [], users: [] }); return; }

    const allowedIds = await getChannelIdsForUser(userId);
    if (allowedIds.length === 0) {
      res.json({ messages: [], tasks: [], documents: [], users: [] });
      return;
    }

    const safeIlike = q.replace(/[%_]/g, '').trim();
    const pattern = safeIlike.length > 0 ? `%${safeIlike}%` : null;

    const [messages, tasks, documents, users] = await Promise.all([
      pattern
        ? query<{ id: string; channel_id: string; user_id: string; content: string; created_at: string; sender_name: string | null; channel_name: string }>(
            `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at,
                    COALESCE(u.full_name, m.user_id) AS sender_name,
                    c.name AS channel_name
             FROM messages m
             LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
             JOIN channels c ON c.id = m.channel_id
             WHERE m.is_deleted = FALSE
               AND m.channel_id = ANY($2::uuid[])
               AND m.content ILIKE $1
             ORDER BY m.created_at DESC LIMIT 15`,
            [pattern, allowedIds],
          ).catch(() => ({ rows: [] as Array<{ id: string; channel_id: string; user_id: string; content: string; created_at: string; sender_name: string | null; channel_name: string }> }))
        : Promise.resolve({ rows: [] as Array<{ id: string; channel_id: string; user_id: string; content: string; created_at: string; sender_name: string | null; channel_name: string }> }),
      slashSearch('task', q, 10).catch(() => []),
      slashSearch('document', q, 10).catch(() => []),
      slashSearch('user', q, 10).catch(() => []),
    ]);

    res.json({
      messages: messages.rows.map((r) => ({
        id: r.id, channelId: r.channel_id, userId: r.user_id,
        content: r.content, timestamp: r.created_at,
        senderName: r.sender_name, channelName: r.channel_name,
      })),
      tasks,
      documents,
      users,
    });
  } catch (e) {
    console.error('[chat] GET /search/universal', e);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ══════════════════════════════════════
// Chat v2: Smart Folders (Bookmarks)
// ══════════════════════════════════════

chatRouter.get('/bookmarks', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const result = await query<{
      id: string; user_id: string; name: string; folder_type: string;
      channel_ids: string[]; icon: string | null; created_at: string;
    }>(
      `SELECT id, user_id, name, folder_type, channel_ids, icon, created_at
       FROM chat_bookmarks WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    res.json(result.rows.map((r) => ({
      id: r.id, userId: r.user_id, name: r.name,
      type: r.folder_type, channelIds: r.channel_ids ?? [],
      icon: r.icon, createdAt: r.created_at,
    })));
  } catch (e) {
    console.error('[chat] GET /bookmarks', e);
    res.status(500).json({ error: 'Failed to load bookmarks' });
  }
});

chatRouter.post('/bookmarks', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { name, type = 'custom', channelIds = [], icon } = req.body;
    if (!name) { res.status(400).json({ error: 'Folder name is required' }); return; }
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO chat_bookmarks (user_id, name, folder_type, channel_ids, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [userId, name, type, JSON.stringify(channelIds), icon ?? null],
    );
    const row = result.rows[0];
    res.status(201).json({
      id: row?.id, userId, name, type, channelIds, icon: icon ?? null,
      createdAt: row?.created_at,
    });
  } catch (e) {
    console.error('[chat] POST /bookmarks', e);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

chatRouter.delete('/bookmarks/:id', async (req, res) => {
  try {
    const userId = getUserId(req as never);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await query(`DELETE FROM chat_bookmarks WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.status(204).send();
  } catch (e) {
    console.error('[chat] DELETE /bookmarks', e);
    res.status(500).json({ error: 'Failed to delete bookmark' });
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
    if (!event || !VALID_XP_EVENTS.includes(event)) {
      res.status(400).json({ error: `Invalid XP event. Must be one of: ${VALID_XP_EVENTS.join(', ')}` }); return;
    }
    if (!(await checkChannelMembership(req.params.id, userId))) {
      res.status(403).json({ error: 'Not a member of this channel' }); return;
    }
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
