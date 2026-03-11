import { query } from '../db/index.js';
import { eventBus } from '../events/index.js';
import type { CallerContext, PaginatedResult } from './types.js';
import { paginationClause } from './helpers.js';
import { getCanonicalChatUserId } from '../db/chatDb.js';

// ── Interfaces ──

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  members: string[];
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  attachments: unknown[];
  mentions: unknown[];
  xpGained: number;
  timestamp: string;
}

// Resolve caller's chat user id (channel_members may store auth_user_id or reimbursement_users.id).
async function getCallerChatUserId(ctx: CallerContext): Promise<string | null> {
  const canonical = await getCanonicalChatUserId(ctx.userId);
  return canonical;
}

// Channel IDs the caller is a member of (using both id and auth_user_id for membership check).
async function getMemberChannelIds(ctx: CallerContext): Promise<string[]> {
  const chatUserId = await getCallerChatUserId(ctx);
  if (!chatUserId) return [];

  const r = await query<{ channel_id: string }>(
    `SELECT channel_id::text AS channel_id FROM channel_members WHERE user_id = $1 OR user_id = $2`,
    [chatUserId, ctx.userId],
  );
  return r.rows.map((row) => row.channel_id);
}

function ensureChannelAccess(ctx: CallerContext, channelIds: string[], channelId: string): boolean {
  return channelIds.includes(channelId);
}

// ── DAL Functions ──

export async function listChannels(ctx: CallerContext): Promise<Channel[]> {
  const channelIds = await getMemberChannelIds(ctx);
  if (channelIds.length === 0) return [];

  const chatUserId = await getCallerChatUserId(ctx);
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
               AND m.created_at > COALESCE((SELECT last_read_at FROM channel_members WHERE channel_id = c.id AND (user_id = $1 OR user_id = $2) LIMIT 1), '1970-01-01'::timestamptz)) AS unread_count
     FROM channels c
     WHERE c.id = ANY($3::text[])
     ORDER BY c.name`,
    [ctx.userId, chatUserId ?? '', channelIds],
  );

  const channels: Channel[] = [];
  for (const row of result.rows) {
    const membersResult = await query<{ user_id: string }>(
      `SELECT user_id FROM channel_members WHERE channel_id = $1`,
      [row.id],
    );
    channels.push({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      members: membersResult.rows.map((r) => r.user_id),
      unreadCount: row.unread_count ?? 0,
      createdAt: row.created_at,
    });
  }
  return channels;
}

export async function getChannelById(ctx: CallerContext, channelId: string): Promise<Channel | null> {
  const channelIds = await getMemberChannelIds(ctx);
  if (!ensureChannelAccess(ctx, channelIds, channelId)) return null;

  const result = await query<{
    id: string;
    name: string;
    description: string | null;
    type: string;
    unread_count: number;
    created_at: string;
  }>(
    `SELECT id::text AS id, name, description, type, COALESCE(unread_count, 0)::int AS unread_count, created_at::text AS created_at
     FROM channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const membersResult = await query<{ user_id: string }>(
    `SELECT user_id FROM channel_members WHERE channel_id = $1`,
    [channelId],
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    members: membersResult.rows.map((r) => r.user_id),
    unreadCount: row.unread_count ?? 0,
    createdAt: row.created_at,
  };
}

export async function getChannelMessages(
  ctx: CallerContext,
  channelId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Message>> {
  const channelIds = await getMemberChannelIds(ctx);
  if (!ensureChannelAccess(ctx, channelIds, channelId)) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM messages WHERE channel_id = $1`,
    [channelId],
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  const pg = paginationClause(page, pageSize, 2);

  const dataResult = await query(
    `SELECT id::text AS id, channel_id::text AS channel_id, user_id, content,
            COALESCE(attachments, '[]'::jsonb) AS attachments,
            COALESCE(mentions, '[]'::jsonb) AS mentions,
            COALESCE(xp_gained, 0)::int AS xp_gained, created_at::text AS created_at
     FROM messages WHERE channel_id = $1 ORDER BY created_at ASC ${pg.clause}`,
    [channelId, ...pg.params],
  );

  const data = dataResult.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xpGained: Number(r.xp_gained ?? 0),
    timestamp: r.created_at,
  })) as Message[];

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function sendMessage(
  ctx: CallerContext,
  channelId: string,
  content: string,
  attachments?: unknown[],
): Promise<Message> {
  const channelIds = await getMemberChannelIds(ctx);
  if (!ensureChannelAccess(ctx, channelIds, channelId)) {
    throw new Error('Not a member of this channel');
  }

  const chatUserId = await getCallerChatUserId(ctx);
  const userId = chatUserId ?? ctx.userId;

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
     VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, 0)
     RETURNING id::text AS id, channel_id::text AS channel_id, user_id, content,
               COALESCE(attachments, '[]'::jsonb) AS attachments,
               COALESCE(mentions, '[]'::jsonb) AS mentions,
               xp_gained, created_at::text AS created_at`,
    [channelId, userId, content, JSON.stringify(attachments ?? [])],
  );
  const r = result.rows[0];
  if (!r) throw new Error('Failed to insert message');

  const message: Message = {
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xpGained: r.xp_gained ?? 0,
    timestamp: r.created_at,
  };

  eventBus.emit('chat.message.sent', {
    messageId: message.id,
    channelId,
    userId: message.userId,
    hasAttachment: (attachments?.length ?? 0) > 0,
    content: content ?? '',
  });

  return message;
}

export async function searchMessages(
  ctx: CallerContext,
  searchQuery: string,
  channelId?: string,
): Promise<Message[]> {
  const channelIds = await getMemberChannelIds(ctx);
  if (channelIds.length === 0) return [];

  const conditions = ['m.content ILIKE $1', 'm.channel_id = ANY($2::text[])'];
  const params: unknown[] = [`%${searchQuery}%`, channelIds];
  if (channelId) {
    if (!channelIds.includes(channelId)) return [];
    conditions.push('m.channel_id = $3');
    params.push(channelId);
  }

  const result = await query(
    `SELECT m.id::text AS id, m.channel_id::text AS channel_id, m.user_id, m.content,
            COALESCE(m.attachments, '[]'::jsonb) AS attachments,
            COALESCE(m.mentions, '[]'::jsonb) AS mentions,
            COALESCE(m.xp_gained, 0)::int AS xp_gained, m.created_at::text AS created_at
     FROM messages m
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.created_at DESC
     LIMIT 50`,
    params,
  );

  return result.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    content: r.content,
    attachments: (r.attachments as unknown[]) ?? [],
    mentions: (r.mentions as unknown[]) ?? [],
    xpGained: Number(r.xp_gained ?? 0),
    timestamp: r.created_at,
  })) as Message[];
}
