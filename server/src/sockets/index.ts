import { Server, Socket } from 'socket.io';
import { addMessage, getChannelById, getChannelIdsForUser } from '../db/chatDb.js';
import { addEmployeeXP, getEmployeeByIdAsUser, updateEmployeeStatus } from '../db/employeesDb.js';
import { addActivity } from '../db/activitiesDb.js';
import { updateTaskStatus } from '../db/tasksDb.js';
import { setupKnowledgeSocketHandlers } from './knowledgeHandlers.js';
import { eventBus } from '../events/index.js';
import { query } from '../db/index.js';
import { verifyAccess } from '../utils/jwt.js';

interface UserSocket {
  oderId: string;
  socket: Socket;
}

const connectedUsers: Map<string, Socket> = new Map();
let socketServer: Server | null = null;

/** Emit an event to a specific user's socket (by Messign auth user id). */
export async function emitToUser(userId: string, event: string, data: unknown): Promise<void> {
  const socket = connectedUsers.get(userId);
  if (socket) {
    socket.emit(event, data);
    return;
  }

  const result = await query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id
     FROM reimbursement_users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );
  const authUserId = result.rows[0]?.auth_user_id;
  const fallbackSocket = authUserId ? connectedUsers.get(authUserId) : null;
  if (fallbackSocket) {
    fallbackSocket.emit(event, data);
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
    result.rows.map((row) => emitToUser(row.auth_user_id, event, data)),
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
    result.rows.map((row) => emitToUser(row.auth_user_id, event, data)),
  );
}

export function emitBroadcast(event: string, data: unknown): void {
  socketServer?.emit(event, data);
}

export function setupSocketHandlers(io: Server) {
  socketServer = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccess(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  setupKnowledgeSocketHandlers(io);

  io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    socket.on('user:join', async () => {
      const userId = socket.data.userId as string;
      if (!userId) {
        socket.emit('error', { message: 'Not authenticated', code: 'AUTH_REQUIRED' });
        return;
      }

      connectedUsers.set(userId, socket);

      const user = await getEmployeeByIdAsUser(userId);
      if (user) {
        await updateEmployeeStatus(userId, 'online');
        io.emit('user:status', { userId, status: 'online' });
      }

      const channelIds = await getChannelIdsForUser(userId);
      channelIds.forEach((channelId) => {
        socket.join(channelId);
      });

      console.log(`User ${userId} joined`);
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

        const channelUpdated = await getChannelById(channelId);
        if (channelUpdated) {
          io.to(channelId).emit('channel:updated', {
            id: channelUpdated.id,
            name: channelUpdated.name,
            description: channelUpdated.description ?? undefined,
            type: channelUpdated.type,
            members: channelUpdated.members,
            unreadCount: channelUpdated.unread_count,
            createdAt: channelUpdated.created_at,
            lastMessage: message,
          });
        }

        mentions.forEach((mentionedUserId: string) => {
          const mentionedSocket = connectedUsers.get(mentionedUserId);
          if (mentionedSocket) {
            mentionedSocket.emit('notification:mention', {
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

    // Handle task status change (userId from JWT)
    socket.on('task:update', async (data: { taskId: string; status: string }) => {
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
          io.emit('activity:new', activity);

          eventBus.emit('project.task.completed', {
            taskId: data.taskId, projectId: task.projectId, completedBy: userId, xpAwarded: task.xpReward,
          });
        }

        io.emit('task:updated', task);
      }
    });

    // Handle user status change (userId from JWT)
    socket.on('user:status', async (data: { status: string }) => {
      const userId = socket.data.userId as string;
      if (!userId) return;

      const status = ['online', 'away', 'busy', 'offline'].includes(data.status) ? data.status as 'online' | 'away' | 'busy' | 'offline' : 'offline';
      const row = await updateEmployeeStatus(userId, status);
      if (row) {
        io.emit('user:status', { userId, status });
      }
    });

    // Join a channel
    socket.on('channel:join', (channelId: string) => {
      socket.join(channelId);
    });

    // Leave a channel
    socket.on('channel:leave', (channelId: string) => {
      socket.leave(channelId);
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      const userId = socket.data.userId as string | undefined;
      if (userId) {
        connectedUsers.delete(userId);
        await updateEmployeeStatus(userId, 'offline');
        io.emit('user:status', { userId, status: 'offline' });
      }
      console.log('User disconnected:', socket.id);
    });
  });
}
