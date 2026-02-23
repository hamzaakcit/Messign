import { createNotification } from '../db/knowledgeV2Db.js';
import type { Server } from 'socket.io';

interface NotifyParams {
  io?: Server;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  relatedDocumentId?: string;
}

export async function notifyUser(params: NotifyParams) {
  const notification = await createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    relatedDocumentId: params.relatedDocumentId,
  });

  if (params.io) {
    params.io.emit('kh:notification', notification);
  }

  return notification;
}
