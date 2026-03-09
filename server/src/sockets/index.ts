import { Server, Socket } from 'socket.io';
import { addMessage, getChannelById, getChannelIdsForUser } from '../db/chatDb.js';
import { addEmployeeXP, getEmployeeByIdAsUser, updateEmployeeStatus } from '../db/employeesDb.js';
import { addActivity } from '../db/activitiesDb.js';
import { updateTaskStatus } from '../db/tasksDb.js';
import { setupKnowledgeSocketHandlers } from './knowledgeHandlers.js';
import { eventBus } from '../events/index.js';

interface UserSocket {
  oderId: string;
  socket: Socket;
}

const connectedUsers: Map<string, Socket> = new Map();

/** Emit an event to a specific user's socket (by Messign auth user id). */
export function emitToUser(userId: string, event: string, data: unknown): void {
  const socket = connectedUsers.get(userId);
  if (socket) socket.emit(event, data);
}

export function setupSocketHandlers(io: Server) {
  setupKnowledgeSocketHandlers(io);

  io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    // User joins with their ID
    socket.on('user:join', async (userId: string) => {
      connectedUsers.set(userId, socket);
      socket.data.userId = userId;

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

    // Handle new message
    socket.on('message:send', async (data: {
      channelId: string;
      userId: string;
      content: string;
      attachments?: [];
      mentions?: string[];
    }) => {
      try {
        const { channelId, userId, content, attachments = [], mentions = [] } = data;

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
          emitToUser(memberId, 'message:new', message);
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

    // Handle typing indicator
    socket.on('typing:start', (data: { channelId: string; userId: string }) => {
      socket.to(data.channelId).emit('typing:start', data);
    });

    socket.on('typing:stop', (data: { channelId: string; userId: string }) => {
      socket.to(data.channelId).emit('typing:stop', data);
    });

    // Handle task status change
    socket.on('task:update', async (data: { taskId: string; status: string; userId: string }) => {
      const task = await updateTaskStatus(data.taskId, data.status as 'todo' | 'in_progress' | 'review' | 'done');

      if (task) {
        if (data.status === 'done') {
          const row = await addEmployeeXP(data.userId, task.xpReward);
          const updatedUser = row ? await getEmployeeByIdAsUser(data.userId) : null;

          const activity = await addActivity({
            userId: data.userId,
            type: 'task_completed',
            message: `completed "${task.title}"`,
            xpGained: task.xpReward,
            timestamp: new Date().toISOString(),
          });

          socket.emit('xp:gained', { amount: task.xpReward, total: updatedUser?.xp });
          io.emit('activity:new', activity);

          eventBus.emit('project.task.completed', {
            taskId: data.taskId, projectId: task.projectId, completedBy: data.userId, xpAwarded: task.xpReward,
          });
        }

        io.emit('task:updated', task);
      }
    });

    // Handle user status change
    socket.on('user:status', async (data: { userId: string; status: string }) => {
      const status = ['online', 'away', 'busy', 'offline'].includes(data.status) ? data.status as 'online' | 'away' | 'busy' | 'offline' : 'offline';
      const row = await updateEmployeeStatus(data.userId, status);
      if (row) {
        io.emit('user:status', data);
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
