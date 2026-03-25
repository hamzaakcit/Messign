import { query } from './index.js';

export interface ChannelRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  unread_count: number;
  created_at: string;
  members: string[];
}

export interface MessageRow {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachments: unknown[];
  mentions: unknown[];
  xp_gained: number;
  created_at: string;
}

/** Message with sender details from reimbursement_users (name, avatar URL). */
export interface MessageWithSender extends MessageRow {
  sender_name: string;
  sender_avatar: string | null;
}

export async function getChannelsForUser(userId: string): Promise<ChannelRow[]> {
  const result = await query<{
    id: string;
    name: string;
    description: string | null;
    type: string;
    unread_count: number;
    created_at: string;
  }>(
    `SELECT c.id::text AS id, c.name, c.description, c.type, c.created_at::text AS created_at,
            (SELECT COUNT(*)::int FROM messages m
             WHERE m.channel_id = c.id
               AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)) AS unread_count
     FROM channels c
     INNER JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
     ORDER BY c.name`,
    [userId]
  );
  if (result.rows.length === 0) return [];

  const channelIds = result.rows.map((r) => r.id);
  const membersResult = await query<{ channel_id: string; user_id: string }>(
    `SELECT channel_id::text AS channel_id, user_id FROM channel_members WHERE channel_id = ANY($1::uuid[])`,
    [channelIds]
  );
  const membersByChannel = new Map<string, string[]>();
  for (const r of membersResult.rows) {
    const list = membersByChannel.get(r.channel_id) ?? [];
    list.push(r.user_id);
    membersByChannel.set(r.channel_id, list);
  }

  return result.rows.map((row) => ({
    ...row,
    id: row.id,
    members: membersByChannel.get(row.id) ?? [],
  }));
}

/** Mark a channel as read for a user (updates last_read_at so unread count becomes 0). */
export async function markChannelAsReadForUser(channelId: string, userId: string): Promise<void> {
  await query(
    `UPDATE channel_members SET last_read_at = NOW() WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId]
  );
}

export async function getChannelById(channelId: string): Promise<ChannelRow | null> {
  const result = await query<{ id: string; name: string; description: string | null; type: string; unread_count: number; created_at: string }>(
    `SELECT id::text AS id, name, description, type, unread_count, created_at::text AS created_at FROM channels WHERE id = $1 LIMIT 1`,
    [channelId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const membersResult = await query<{ user_id: string }>(
    `SELECT user_id FROM channel_members WHERE channel_id = $1`,
    [channelId]
  );
  return {
    ...row,
    id: row.id,
    members: membersResult.rows.map((r) => r.user_id),
  };
}

export async function getMessagesByChannel(channelId: string): Promise<MessageRow[]> {
  const result = await query<{
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    attachments: unknown;
    mentions: unknown;
    xp_gained: number;
    created_at: string;
  }>(
    `SELECT id::text AS id, channel_id::text AS channel_id, user_id, content,
            COALESCE(attachments, '[]'::jsonb) AS attachments,
            COALESCE(mentions, '[]'::jsonb) AS mentions,
            xp_gained, created_at::text AS created_at
     FROM messages WHERE channel_id = $1 ORDER BY created_at ASC`,
    [channelId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    channel_id: r.channel_id,
    user_id: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xp_gained: r.xp_gained,
    created_at: r.created_at,
  }));
}

/** Get messages for a channel with sender name and avatar from reimbursement_users. */
export async function getMessagesForChannel(channelId: string): Promise<MessageWithSender[]> {
  const result = await query<{
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    attachments: unknown;
    mentions: unknown;
    xp_gained: number;
    created_at: string;
    sender_name: string;
  }>(
    `SELECT m.id::text AS id, m.channel_id::text AS channel_id, m.user_id, m.content,
            COALESCE(m.attachments, '[]'::jsonb) AS attachments,
            COALESCE(m.mentions, '[]'::jsonb) AS mentions,
            m.xp_gained, m.created_at::text AS created_at,
            COALESCE(ru.full_name, m.user_id) AS sender_name
     FROM messages m
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = m.user_id
     WHERE m.channel_id = $1
     ORDER BY m.created_at ASC`,
    [channelId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    channel_id: r.channel_id,
    user_id: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xp_gained: r.xp_gained,
    created_at: r.created_at,
    sender_name: r.sender_name,
    sender_avatar: r.user_id ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.user_id)}` : null,
  }));
}

const MESSAGE_PAGE_MAX = 200;

function mapMessageWithSenderRow(r: {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachments: unknown;
  mentions: unknown;
  xp_gained: number;
  created_at: string;
  sender_name: string;
}): MessageWithSender {
  return {
    id: r.id,
    channel_id: r.channel_id,
    user_id: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xp_gained: r.xp_gained,
    created_at: r.created_at,
    sender_name: r.sender_name,
    sender_avatar: r.user_id ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(r.user_id)}` : null,
  };
}

/**
 * Paginated channel messages (newest page first). Returns chronological order (oldest → newest in page).
 * When beforeMessageId is set, returns messages strictly older than that message.
 */
export async function getMessagesForChannelPage(
  channelId: string,
  limit: number,
  beforeMessageId?: string | null,
): Promise<{ rows: MessageWithSender[]; hasMore: boolean }> {
  const take = Math.min(Math.max(1, limit), MESSAGE_PAGE_MAX);
  const fetchCount = take + 1;

  if (beforeMessageId) {
    const result = await query<{
      id: string;
      channel_id: string;
      user_id: string;
      content: string;
      attachments: unknown;
      mentions: unknown;
      xp_gained: number;
      created_at: string;
      sender_name: string;
    }>(
      `WITH anchor AS (
         SELECT created_at, id FROM messages WHERE id = $2::uuid AND channel_id = $1
       )
       SELECT m.id::text AS id, m.channel_id::text AS channel_id, m.user_id, m.content,
              COALESCE(m.attachments, '[]'::jsonb) AS attachments,
              COALESCE(m.mentions, '[]'::jsonb) AS mentions,
              m.xp_gained, m.created_at::text AS created_at,
              COALESCE(ru.full_name, m.user_id) AS sender_name
       FROM messages m
       LEFT JOIN reimbursement_users ru ON ru.auth_user_id = m.user_id
       CROSS JOIN anchor a
       WHERE m.channel_id = $1
         AND (m.created_at, m.id) < (a.created_at, a.id)
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      [channelId, beforeMessageId, fetchCount],
    );
    const hasMore = result.rows.length > take;
    const slice = result.rows.slice(0, take);
    const chronological = slice.reverse().map(mapMessageWithSenderRow);
    return { rows: chronological, hasMore };
  }

  const result = await query<{
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    attachments: unknown;
    mentions: unknown;
    xp_gained: number;
    created_at: string;
    sender_name: string;
  }>(
    `SELECT m.id::text AS id, m.channel_id::text AS channel_id, m.user_id, m.content,
            COALESCE(m.attachments, '[]'::jsonb) AS attachments,
            COALESCE(m.mentions, '[]'::jsonb) AS mentions,
            m.xp_gained, m.created_at::text AS created_at,
            COALESCE(ru.full_name, m.user_id) AS sender_name
     FROM messages m
     LEFT JOIN reimbursement_users ru ON ru.auth_user_id = m.user_id
     WHERE m.channel_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2`,
    [channelId, fetchCount],
  );
  const hasMore = result.rows.length > take;
  const slice = result.rows.slice(0, take);
  const chronological = slice.reverse().map(mapMessageWithSenderRow);
  return { rows: chronological, hasMore };
}

export async function addMessage(params: {
  channelId: string;
  userId: string;
  content: string;
  attachments?: unknown[];
  mentions?: unknown[];
  xpGained?: number;
  timestamp?: string;
}): Promise<MessageRow> {
  const {
    channelId,
    userId,
    content,
    attachments = [],
    mentions = [],
    xpGained = 0,
  } = params;
  const result = await query<{
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    attachments: unknown;
    mentions: unknown;
    xp_gained: number;
    created_at: string;
  }>(
    `INSERT INTO messages (channel_id, user_id, content, attachments, mentions, xp_gained)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     RETURNING id::text AS id, channel_id::text AS channel_id, user_id, content,
               COALESCE(attachments, '[]'::jsonb) AS attachments,
               COALESCE(mentions, '[]'::jsonb) AS mentions,
               xp_gained, created_at::text AS created_at`,
    [channelId, userId, content, JSON.stringify(attachments), JSON.stringify(mentions), xpGained]
  );
  const r = result.rows[0]!;
  return {
    id: r.id,
    channel_id: r.channel_id,
    user_id: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xp_gained: r.xp_gained,
    created_at: r.created_at,
  };
}

/** Insert a message and return it with sender full_name and avatar (initials/dicebear). */
export async function createMessage(
  channelId: string,
  userId: string,
  content: string,
  options?: { attachments?: unknown[]; mentions?: string[]; xpGained?: number }
): Promise<MessageWithSender> {
  const row = await addMessage({
    channelId,
    userId,
    content,
    attachments: options?.attachments ?? [],
    mentions: options?.mentions ?? [],
    xpGained: options?.xpGained ?? 5,
  });
  const withSender = await getMessagesForChannel(channelId);
  const found = withSender.find((m) => m.id === row.id);
  if (found) return found;
  return {
    ...row,
    sender_name: row.user_id,
    sender_avatar: row.user_id ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(row.user_id)}` : null,
  };
}

export async function getChannelIdsForUser(userId: string): Promise<string[]> {
  const result = await query<{ channel_id: string }>(
    `SELECT channel_id::text AS channel_id FROM channel_members WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((r) => r.channel_id);
}

export async function createChannel(params: {
  name: string;
  description?: string | null;
  type?: string;
  memberIds?: string[];
}): Promise<ChannelRow> {
  const { name, description = null, type = 'public', memberIds = [] } = params;
  const result = await query<{ id: string; name: string; description: string | null; type: string; unread_count: number; created_at: string }>(
    `INSERT INTO channels (name, description, type)
     VALUES ($1, $2, $3)
     RETURNING id::text AS id, name, description, type, unread_count, created_at::text AS created_at`,
    [name, description, type]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Failed to create channel');
  for (const uid of memberIds) {
    await query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT (channel_id, user_id) DO NOTHING`,
      [row.id, uid]
    );
  }
  const membersResult = await query<{ user_id: string }>(`SELECT user_id FROM channel_members WHERE channel_id = $1`, [row.id]);
  return {
    ...row,
    id: row.id,
    members: membersResult.rows.map((r) => r.user_id),
  };
}

/**
 * Resolve a user identifier (auth_user_id or reimbursement_users.id) to the canonical chat user id.
 * Chat uses this id in channel_members; the same id is used when the user joins the socket and fetches channels.
 * Returns auth_user_id when set, else reimbursement_users.id, so Amanda receives DMs when she connects with her auth id.
 */
export async function getCanonicalChatUserId(idOrAuthId: string): Promise<string | null> {
  const result = await query<{ id: string; auth_user_id: string | null }>(
    `SELECT id::text AS id, auth_user_id FROM reimbursement_users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
    [idOrAuthId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.auth_user_id ?? row.id;
}

/** Find or create a DM channel between two users. Returns existing channel if one exists. */
export async function findOrCreateDmChannel(userId: string, otherUserId: string): Promise<ChannelRow> {
  const canonicalOther = await getCanonicalChatUserId(otherUserId);
  if (!canonicalOther) {
    throw new Error('Other user not found');
  }
  const memberA = userId;
  const memberB = canonicalOther;
  const [a, b] = [memberA, memberB].slice().sort();
  const dmName = `dm-${a}-${b}`;
  const existing = await query<{ id: string; name: string; description: string | null; type: string; unread_count: number; created_at: string }>(
    `SELECT c.id::text AS id, c.name, c.description, c.type, c.unread_count, c.created_at::text AS created_at
     FROM channels c
     INNER JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.user_id = $1
     INNER JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id = $2
     WHERE c.type = 'dm' LIMIT 1`,
    [memberA, memberB]
  );
  const row = existing.rows[0];
  if (row) {
    const membersResult = await query<{ user_id: string }>(`SELECT user_id FROM channel_members WHERE channel_id = $1`, [row.id]);
    return { ...row, id: row.id, members: membersResult.rows.map((r) => r.user_id) };
  }
  return createChannel({
    name: dmName,
    description: null,
    type: 'dm',
    memberIds: [memberA, memberB],
  });
}
