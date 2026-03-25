import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_ORIGIN, {
      autoConnect: false,
      withCredentials: true,
      transports: ['polling', 'websocket'],
      /**
       * Engine.IO obtains a session via long-polling first, then upgrades to WebSocket. That upgrade
       * often fails behind multi-instance APIs (no sticky sessions / no Redis adapter) or picky proxies,
       * producing: "WebSocket is closed before the connection is established" while the app still works.
       * Default: stay on long-polling only (`upgrade: false`). Set `VITE_SOCKET_WEBSOCKET_UPGRADE=1`
       * when the API is a single node or you use a Socket.IO Redis adapter and WS upgrade is reliable.
       */
      upgrade: import.meta.env.VITE_SOCKET_WEBSOCKET_UPGRADE === '1',
    });
  }
  return socket;
}

export function connectSocket(_userId?: string) {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getAccessToken() };
    s.connect();
    s.emit('user:join');
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

export function emitTyping(channelId: string, _userId: string, isTyping: boolean) {
  getSocket().emit(isTyping ? 'typing:start' : 'typing:stop', { channelId });
}

export function emitUserStatus(data: { status: string; statusText?: string }): void {
  getSocket().emit('user:status', data);
}

// Chat v2 real-time events
export function onMessageReact(callback: (data: { messageId: string; channelId: string; reactions: Array<{ emoji: string; users: string[] }> }) => void): () => void {
  const s = getSocket();
  s.on('message:react', callback);
  return () => s.off('message:react', callback);
}

export function onMessageEdit(callback: (data: { messageId: string; channelId: string; content: string; editedAt: string; userId: string }) => void): () => void {
  const s = getSocket();
  s.on('message:edit', callback);
  return () => s.off('message:edit', callback);
}

export function onMessageDelete(callback: (data: { messageId: string; channelId: string }) => void): () => void {
  const s = getSocket();
  s.on('message:delete', callback);
  return () => s.off('message:delete', callback);
}

export function onMessagePin(callback: (data: { messageId: string; channelId: string; isPinned: boolean; pinnedBy: string }) => void): () => void {
  const s = getSocket();
  s.on('message:pin', callback);
  return () => s.off('message:pin', callback);
}

export function onThreadReply(callback: (data: { messageId: string; channelId: string; threadId: string; replyCount: number }) => void): () => void {
  const s = getSocket();
  s.on('thread:reply', callback);
  return () => s.off('thread:reply', callback);
}

export function joinChannel(channelId: string) {
  getSocket().emit('channel:join', channelId);
}

export function leaveChannel(channelId: string) {
  getSocket().emit('channel:leave', channelId);
}

export function updateTaskStatus(taskId: string, status: string, _userId?: string) {
  getSocket().emit('task:update', { taskId, status });
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

export interface DoraRealtimeInsight {
  id: string;
  module: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DoraInsightCountsEvent {
  module?: string | null;
  updatedAt?: string;
}

export function onDoraNewInsight(callback: (insight: DoraRealtimeInsight) => void): () => void {
  const s = getSocket();
  s.on('dora:new-insight', callback);
  return () => s.off('dora:new-insight', callback);
}

export function offDoraNewInsight(callback: (insight: DoraRealtimeInsight) => void) {
  getSocket().off('dora:new-insight', callback);
}

export function onDoraInsightCounts(callback: (payload: DoraInsightCountsEvent) => void): () => void {
  const s = getSocket();
  s.on('dora:insight-counts', callback);
  return () => s.off('dora:insight-counts', callback);
}

export function offDoraInsightCounts(callback: (payload: DoraInsightCountsEvent) => void) {
  getSocket().off('dora:insight-counts', callback);
}

export interface TimeTimerUpdateEvent {
  type: 'started' | 'stopped' | 'discarded';
  timerId?: string;
  userId?: string;
}

export function onTimeTimerUpdate(callback: (payload: TimeTimerUpdateEvent) => void): () => void {
  const s = getSocket();
  s.on('time:timer-update', callback);
  return () => s.off('time:timer-update', callback);
}
