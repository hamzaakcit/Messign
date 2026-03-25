import { Server, Socket } from 'socket.io';
import { addMessage, getChannelById, getChannelIdsForUser } from '../db/chatDb.js';
import { addEmployeeXP, getEmployeeByIdAsUser, updateEmployeeStatus } from '../db/employeesDb.js';
import { addActivity } from '../db/activitiesDb.js';
import { updateTaskStatus } from '../db/tasksDb.js';
import { setupKnowledgeSocketHandlers } from './knowledgeHandlers.js';
import { eventBus } from '../events/index.js';
import { query } from '../db/index.js';
import { verifyAccess } from '../utils/jwt.js';
import { computeFingerprint, getClientIp } from '../services/authService.js';
import { blacklistSession } from '../middleware/authMiddleware.js';

const connectedUsers: Map<string, Set<Socket>> = new Map();

/** Reverse map: internal DB user id -> auth user id, to avoid per-emit DB lookups. */
const internalToAuthId: Map<string, string> = new Map();
const MAX_ID_CACHE = 5000;

function cacheIdMapping(internalId: string, authId: string): void {
  if (internalToAuthId.size >= MAX_ID_CACHE) {
    const firstKey = internalToAuthId.keys().next().value;
    if (firstKey) internalToAuthId.delete(firstKey);
  }
  internalToAuthId.set(internalId, authId);
}

function addUserSocket(userId: string, socket: Socket): void {
  let sockets = connectedUsers.get(userId);
  if (!sockets) {
    sockets = new Set();
    connectedUsers.set(userId, sockets);
  }
  sockets.add(socket);
}

function removeUserSocket(userId: string, socket: Socket): boolean {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socket);
  if (sockets.size === 0) {
    connectedUsers.delete(userId);
    return true; // last socket removed
  }
  return false;
}

function emitToSockets(sockets: Set<Socket>, event: string, data: unknown): void {
  for (const s of sockets) {
    s.emit(event, data);
  }
}

let socketServer: Server | null = null;

/** PostgreSQL uuid — reimbursement_users.id / auth_user_id columns use this type. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Emit an event to a specific user's socket(s) (by Messign auth user id OR internal user id). */
export async function emitToUser(userId: string, event: string, data: unknown): Promise<void> {
  if (!userId) return;

  const sockets = connectedUsers.get(userId);
  if (sockets && sockets.size > 0) {
    emitToSockets(sockets, event, data);
    return;
  }

  const mappedAuthId = internalToAuthId.get(userId);
  if (mappedAuthId) {
    const mappedSockets = connectedUsers.get(mappedAuthId);
    if (mappedSockets && mappedSockets.size > 0) {
      emitToSockets(mappedSockets, event, data);
      return;
    }
  }

  if (!UUID_REGEX.test(userId)) return;

  const result = await query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id
     FROM reimbursement_users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );
  const authUserId = result.rows[0]?.auth_user_id;
  if (authUserId) {
    cacheIdMapping(userId, authUserId);
    const fallbackSockets = connectedUsers.get(authUserId);
    if (fallbackSockets && fallbackSockets.size > 0) {
      emitToSockets(fallbackSockets, event, data);
    }
  }
}

export async function emitToRole(
  role: string,
  event: string,
  data: unknown,
  organizationId?: string,
): Promise<void> {
  const conditions = ['role = $1', 'auth_user_id IS NOT NULL'];
  const params: unknown[] = [role];

  if (organizationId) {
    conditions.push(`organization_id = $${params.length + 1}`);
    params.push(organizationId);
  }

  const result = await query<{ auth_user_id: string }>(
    `SELECT auth_user_id
     FROM reimbursement_users
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  await Promise.all(
    result.rows.map(async (row) => {
      try {
        await emitToUser(row.auth_user_id, event, data);
      } catch (err) {
        console.error('[Socket] emitToUser failed for role broadcast', {
          userId: row.auth_user_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

export async function emitToDepartment(
  department: string,
  event: string,
  data: unknown,
  _organizationId?: string,
): Promise<void> {
  const result = await query<{ auth_user_id: string }>(
    `SELECT DISTINCT ru.auth_user_id
     FROM reimbursement_users ru
     JOIN performance_team_members ptm ON ptm.employee_id = ru.auth_user_id
     JOIN performance_teams pt ON pt.id = ptm.team_id
     WHERE ru.auth_user_id IS NOT NULL
       AND ptm.is_active = TRUE
       AND pt.team_name = $1`,
    [department],
  );

  await Promise.all(
    result.rows.map(async (row) => {
      try {
        await emitToUser(row.auth_user_id, event, data);
      } catch (err) {
        console.error('[Socket] emitToUser failed for department broadcast', {
          userId: row.auth_user_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

export function emitBroadcast(event: string, data: unknown): void {
  socketServer?.emit(event, data);
}

export function setupSocketHandlers(io: Server) {
  socketServer = io;

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccess(token);

      if (payload.fp && process.env.NODE_ENV === 'production') {
        const ip = socket.handshake.headers['x-forwarded-for']
          ? String(socket.handshake.headers['x-forwarded-for']).split(',')[0]?.trim()
          : socket.handshake.address;
        const ua = socket.handshake.headers['user-agent'] ?? null;
        const expected = computeFingerprint(ip ?? null, ua);
        if (payload.fp !== expected) {
          return next(new Error('Session fingerprint mismatch'));
        }
      }

      if (payload.sessionId) {
        try {
          const { redisConnection } = await import('../queue/connection.js');
          const val = await redisConnection.get(`sess:blacklist:${payload.sessionId}`);
          if (val !== null) {
            return next(new Error('Session has been revoked'));
          }
        } catch { /* Redis unavailable — allow through */ }
      }

      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.sessionId = payload.sessionId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  setupKnowledgeSocketHandlers(io);

  io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    socket.on('user:join', async () => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) {
          socket.emit('error', { message: 'Not authenticated', code: 'AUTH_REQUIRED' });
          return;
        }

        addUserSocket(userId, socket);
        socket.join(`user:${userId}`);

        const user = await getEmployeeByIdAsUser(userId);
        if (user) {
          await updateEmployeeStatus(userId, 'online');
          socket.broadcast.emit('user:status', { userId, status: 'online' });
        }

        const channelIds = await getChannelIdsForUser(userId);
        channelIds.forEach((channelId) => {
          socket.join(channelId);
        });

        console.log(`User ${userId} joined`);
      } catch (err) {
        console.error('[socket] user:join error:', err);
        socket.emit('error', { message: 'Failed to join', code: 'JOIN_FAILED' });
      }
    });

    // Handle new message (userId from JWT, not client)
    socket.on('message:send', async (data: {
      channelId: string;
      content: string;
      attachments?: [];
      mentions?: string[];
    }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) {
          socket.emit('error', { message: 'Not authenticated', code: 'AUTH_REQUIRED' });
          return;
        }
        const { channelId, content, attachments = [], mentions = [] } = data;

        const channel = await getChannelById(channelId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found', code: 'CHANNEL_NOT_FOUND', channelId });
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

        const empRow = await addEmployeeXP(userId, xpGained);
        const updatedUser = empRow ? await getEmployeeByIdAsUser(userId) : null;

        eventBus.emit('chat.message.sent', {
          messageId: row.id, channelId, userId, hasAttachment: attachments.length > 0,
        });

        const message = {
          id: row.id,
          channelId: row.channel_id,
          userId: row.user_id,
          content: row.content,
          attachments: row.attachments ?? [],
          mentions: row.mentions ?? [],
          xpGained: row.xp_gained,
          timestamp: row.created_at,
        };

        for (const memberId of channel.members) {
          void emitToUser(memberId, 'message:new', message);
        }
        socket.emit('xp:gained', { amount: xpGained, total: updatedUser?.xp });

        io.to(channelId).emit('channel:updated', {
          id: channel.id,
          name: channel.name,
          description: channel.description ?? undefined,
          type: channel.type,
          members: channel.members,
          unreadCount: channel.unread_count,
          createdAt: channel.created_at,
          lastMessage: message,
        });

        mentions.forEach((mentionedUserId: string) => {
          const mentionedSockets = connectedUsers.get(mentionedUserId);
          if (mentionedSockets) {
            emitToSockets(mentionedSockets, 'notification:mention', {
              channelId,
              messageId: message.id,
              fromUser: userId,
            });
          }
        });
      } catch (err) {
        console.error('[socket] message:send error:', err);
        socket.emit('error', { message: 'Failed to send message', code: 'SEND_FAILED' });
      }
    });

    // Handle typing indicator (userId from JWT)
    socket.on('typing:start', (data: { channelId: string }) => {
      const userId = socket.data.userId as string;
      if (userId) socket.to(data.channelId).emit('typing:start', { channelId: data.channelId, userId });
    });

    socket.on('typing:stop', (data: { channelId: string }) => {
      const userId = socket.data.userId as string;
      if (userId) socket.to(data.channelId).emit('typing:stop', { channelId: data.channelId, userId });
    });

    socket.on('task:update', async (data: { taskId: string; status: string }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;

        const task = await updateTaskStatus(data.taskId, data.status as 'todo' | 'in_progress' | 'review' | 'done');

        if (task) {
          if (data.status === 'done') {
            const row = await addEmployeeXP(userId, task.xpReward);
            const updatedUser = row ? await getEmployeeByIdAsUser(userId) : null;

            const activity = await addActivity({
              userId,
              type: 'task_completed',
              message: `completed "${task.title}"`,
              xpGained: task.xpReward,
              timestamp: new Date().toISOString(),
            });

            socket.emit('xp:gained', { amount: task.xpReward, total: updatedUser?.xp });
            socket.broadcast.emit('activity:new', activity);

            eventBus.emit('project.task.completed', {
              taskId: data.taskId, projectId: task.projectId, completedBy: userId, xpAwarded: task.xpReward,
            });
          }

          socket.broadcast.emit('task:updated', task);
          socket.emit('task:updated', task);
        }
      } catch (err) {
        console.error('[socket] task:update error:', err);
        socket.emit('error', { message: 'Failed to update task', code: 'TASK_UPDATE_FAILED' });
      }
    });

    socket.on('user:status', async (data: { status: string; statusText?: string }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;

        const validStatuses = ['online', 'away', 'busy', 'offline', 'deep_work'];
        const dbStatus = validStatuses.includes(data.status)
          ? (data.status === 'deep_work' ? 'busy' : data.status) as 'online' | 'away' | 'busy' | 'offline'
          : 'offline';
        const row = await updateEmployeeStatus(userId, dbStatus);
        if (row) {
          if (data.statusText !== undefined) {
            try {
              await query(
                `UPDATE reimbursement_users SET status_text = $1 WHERE auth_user_id = $2 OR id::text = $2`,
                [data.statusText, userId],
              );
            } catch { /* status_text column may not exist yet */ }
          }
          socket.broadcast.emit('user:status', {
            userId,
            status: data.status,
            statusText: data.statusText ?? null,
          });
        }
      } catch (err) {
        console.error('[socket] user:status error:', err);
        socket.emit('error', { message: 'Failed to update status', code: 'STATUS_UPDATE_FAILED' });
      }
    });

    // Chat v2: Message reactions via socket
    socket.on('message:react', async (data: { channelId: string; messageId: string; emoji: string; action: 'add' | 'remove' }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;
        const { channelId, messageId, emoji, action = 'add' } = data;
        if (action === 'remove') {
          await query(`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [messageId, userId, emoji]);
        } else {
          await query(`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [messageId, userId, emoji]);
        }
        const reactions = await query<{ emoji: string; user_id: string }>(
          `SELECT emoji, user_id FROM message_reactions WHERE message_id = $1`, [messageId],
        );
        const grouped: Record<string, string[]> = {};
        for (const r of reactions.rows) {
          if (!grouped[r.emoji]) grouped[r.emoji] = [];
          grouped[r.emoji].push(r.user_id);
        }
        const reactionList = Object.entries(grouped).map(([em, users]) => ({ emoji: em, users }));
        io.to(channelId).emit('message:react', { messageId, channelId, reactions: reactionList });
      } catch (err) {
        console.error('[socket] message:react error:', err);
        socket.emit('error', { message: 'Failed to react', code: 'REACT_FAILED' });
      }
    });

    // Chat v2: Message edit via socket
    socket.on('message:edit', async (data: { channelId: string; messageId: string; content: string }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;
        const { channelId, messageId, content } = data;
        const existing = await query<{ user_id: string }>(`SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2`, [messageId, channelId]);
        if (existing.rows.length === 0 || existing.rows[0]!.user_id !== userId) {
          socket.emit('error', { message: 'Cannot edit this message', code: 'EDIT_FORBIDDEN' });
          return;
        }
        await query(`UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2`, [content, messageId]);
        io.to(channelId).emit('message:edit', { messageId, channelId, content, editedAt: new Date().toISOString(), userId });
      } catch (err) {
        console.error('[socket] message:edit error:', err);
        socket.emit('error', { message: 'Failed to edit message', code: 'EDIT_FAILED' });
      }
    });

    // Chat v2: Message delete via socket
    socket.on('message:delete', async (data: { channelId: string; messageId: string }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;
        const { channelId, messageId } = data;
        const existing = await query<{ user_id: string }>(`SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2`, [messageId, channelId]);
        if (existing.rows.length === 0 || existing.rows[0]!.user_id !== userId) {
          socket.emit('error', { message: 'Cannot delete this message', code: 'DELETE_FORBIDDEN' });
          return;
        }
        await query(`UPDATE messages SET is_deleted = TRUE, content = '[deleted]' WHERE id = $1`, [messageId]);
        io.to(channelId).emit('message:delete', { messageId, channelId });
      } catch (err) {
        console.error('[socket] message:delete error:', err);
        socket.emit('error', { message: 'Failed to delete message', code: 'DELETE_FAILED' });
      }
    });

    socket.on('channel:join', async (channelId: string) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) return;
        const channel = await getChannelById(channelId);
        if (!channel || !channel.members.includes(userId)) {
          socket.emit('error', { message: 'Not a member of this channel', code: 'NOT_MEMBER', channelId });
          return;
        }
        socket.join(channelId);
      } catch (err) {
        console.error('[socket] channel:join error:', err);
        socket.emit('error', { message: 'Failed to join channel', code: 'CHANNEL_JOIN_FAILED' });
      }
    });

    // Leave a channel
    socket.on('channel:leave', (channelId: string) => {
      socket.leave(channelId);
    });

    socket.on('disconnect', async () => {
      try {
        const userId = socket.data.userId as string | undefined;
        if (userId) {
          const wasLast = removeUserSocket(userId, socket);
          if (wasLast) {
            await updateEmployeeStatus(userId, 'offline');
            socket.broadcast.emit('user:status', { userId, status: 'offline' });
          }
        }
        console.log('User disconnected:', socket.id);
      } catch (err) {
        console.error('[socket] disconnect error:', err);
      }
    });
  });
}
