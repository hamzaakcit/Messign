import { Server, Socket } from 'socket.io';

const documentViewers = new Map<string, Set<string>>();

export function setupKnowledgeSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('kh:join-document', (documentId: string) => {
      const userId = socket.data.userId as string;
      if (!userId) return;
      socket.join(`kh:doc:${documentId}`);
      if (!documentViewers.has(documentId)) documentViewers.set(documentId, new Set());
      documentViewers.get(documentId)!.add(userId);
      io.to(`kh:doc:${documentId}`).emit('kh:presence', {
        documentId,
        viewers: Array.from(documentViewers.get(documentId)!),
      });
    });

    socket.on('kh:leave-document', (documentId: string) => {
      const userId = socket.data.userId as string;
      if (!userId) return;
      socket.leave(`kh:doc:${documentId}`);
      documentViewers.get(documentId)?.delete(userId);
      io.to(`kh:doc:${documentId}`).emit('kh:presence', {
        documentId,
        viewers: Array.from(documentViewers.get(documentId) ?? []),
      });
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId as string;
      if (!userId) return;
      for (const [docId, viewers] of documentViewers) {
        if (viewers.has(userId)) {
          viewers.delete(userId);
          io.to(`kh:doc:${docId}`).emit('kh:presence', { documentId: docId, viewers: Array.from(viewers) });
        }
      }
    });
  });
}
