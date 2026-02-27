import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_ORIGIN, {
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(userId: string) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    s.emit('user:join', userId);
  }
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

// Event helpers
export function onMessage(callback: (message: any) => void) {
  getSocket().on('message:new', callback);
}

export function offMessage(callback: (message: any) => void) {
  getSocket().off('message:new', callback);
}

export function sendMessage(data: {
  channelId: string;
  userId: string;
  content: string;
  attachments?: any[];
  mentions?: string[];
}) {
  getSocket().emit('message:send', data);
}

export function onSocketError(callback: (err: { message?: string; code?: string; channelId?: string }) => void) {
  getSocket().on('error', callback);
}

export function offSocketError(callback: (err: { message?: string; code?: string; channelId?: string }) => void) {
  getSocket().off('error', callback);
}

export function onXPGained(callback: (data: { amount: number; total: number }) => void) {
  getSocket().on('xp:gained', callback);
}

export function onActivityNew(callback: (activity: any) => void) {
  getSocket().on('activity:new', callback);
}

export function onUserStatus(callback: (data: { userId: string; status: string }) => void) {
  getSocket().on('user:status', callback);
}

export function onTypingStart(callback: (data: { channelId: string; userId: string }) => void) {
  getSocket().on('typing:start', callback);
}

export function onTypingStop(callback: (data: { channelId: string; userId: string }) => void) {
  getSocket().on('typing:stop', callback);
}

export function emitTyping(channelId: string, userId: string, isTyping: boolean) {
  getSocket().emit(isTyping ? 'typing:start' : 'typing:stop', { channelId, userId });
}

export function joinChannel(channelId: string) {
  getSocket().emit('channel:join', channelId);
}

export function leaveChannel(channelId: string) {
  getSocket().emit('channel:leave', channelId);
}

export function updateTaskStatus(taskId: string, status: string, userId: string) {
  getSocket().emit('task:update', { taskId, status, userId });
}

// Employee events (admin CRUD → real-time sync)
export function onEmployeeAdded(callback: () => void): () => void {
  const s = getSocket();
  s.on('employee:added', callback);
  return () => s.off('employee:added', callback);
}

export function onEmployeeUpdated(callback: () => void): () => void {
  const s = getSocket();
  s.on('employee:updated', callback);
  return () => s.off('employee:updated', callback);
}

export function onEmployeeDeleted(callback: () => void): () => void {
  const s = getSocket();
  s.on('employee:deleted', callback);
  return () => s.off('employee:deleted', callback);
}

export function onEmployeeBulkImport(callback: () => void): () => void {
  const s = getSocket();
  s.on('employee:bulk_import', callback);
  return () => s.off('employee:bulk_import', callback);
}

// Invoice events
export function onInvoiceGenerated(callback: (data: { invoiceId: string; invoiceNumber: string }) => void): () => void {
  const s = getSocket();
  s.on('invoice:generated', callback);
  return () => s.off('invoice:generated', callback);
}

export function onInvoiceFinalized(callback: (data: { invoiceId: string }) => void): () => void {
  const s = getSocket();
  s.on('invoice:finalized', callback);
  return () => s.off('invoice:finalized', callback);
}

export function onInvoiceRejected(callback: (data: { invoiceId: string; note?: string }) => void): () => void {
  const s = getSocket();
  s.on('invoice:rejected', callback);
  return () => s.off('invoice:rejected', callback);
}

// Knowledge Hub events
export function onKnowledgeNewDocument(callback: (data: { document: { id: string; title: string; slug: string } }) => void): () => void {
  const s = getSocket();
  s.on('knowledge:new_document', callback);
  return () => s.off('knowledge:new_document', callback);
}

export function onKnowledgeDocumentUpdated(callback: (data: { document: { id: string; title: string; slug: string } }) => void): () => void {
  const s = getSocket();
  s.on('knowledge:document_updated', callback);
  return () => s.off('knowledge:document_updated', callback);
}

export function onKnowledgeRequiredReading(callback: (data: { document: { id: string; title: string; slug: string } }) => void): () => void {
  const s = getSocket();
  s.on('knowledge:required_reading', callback);
  return () => s.off('knowledge:required_reading', callback);
}

export function onKnowledgeFlagCreated(callback: (data: { documentId: string; title: string; reason: string }) => void): () => void {
  const s = getSocket();
  s.on('knowledge:flag_created', callback);
  return () => s.off('knowledge:flag_created', callback);
}

export function onKnowledgeFlagResolved(callback: (data: { flagId: string; documentId: string; status: string }) => void): () => void {
  const s = getSocket();
  s.on('knowledge:flag_resolved', callback);
  return () => s.off('knowledge:flag_resolved', callback);
}

// Finance events
export function onFinanceNotification(callback: (data: { id: string; type: string; title: string; message: string; entity_type?: string; entity_id?: string; priority: string }) => void): () => void {
  const s = getSocket();
  s.on('finance:notification', callback);
  return () => s.off('finance:notification', callback);
}

export function onFinanceExpenseApproved(callback: (data: { expense_id: string; status: string }) => void): () => void {
  const s = getSocket();
  s.on('finance:expense:approved', callback);
  return () => s.off('finance:expense:approved', callback);
}

export function onFinanceBudgetWarning(callback: (data: { budget_id: string; name: string; utilization_pct: number }) => void): () => void {
  const s = getSocket();
  s.on('finance:budget:threshold_warning', callback);
  return () => s.off('finance:budget:threshold_warning', callback);
}

export function onFinanceDoraInsight(callback: (data: { type: string; message: string; entity_type?: string; entity_id?: string }) => void): () => void {
  const s = getSocket();
  s.on('finance:dora:insight', callback);
  return () => s.off('finance:dora:insight', callback);
}
