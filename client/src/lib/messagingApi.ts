/** @module messagingApi — Channel, message, and DB-backed chat APIs. */
import { getAccessToken } from './authToken';
import { API_BASE, fetchAPI } from './api';
import type {
  Message, Channel, EmbeddedCard, DoraSummaryResult,
  DoraActionItemsResult, DoraKBSuggestion, SmartReplyResult,
  SlashSearchResult, ChatSearchResult, ChatMediaItem,
  SmartFolder, UniversalSearchResults,
  DoraDecisionsResult, DoraTransformAction, DoraMessageTransformResult,
} from '@/types';

export const channelsAPI = {
  getAll: () => fetchAPI('/channels'),
  getById: (id: string) => fetchAPI(`/channels/${id}`),
  create: (data: { name: string; description?: string; type?: string; members?: string[] }) =>
    fetchAPI('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  markAsRead: (id: string) =>
    fetchAPI(`/channels/${id}/read`, { method: 'POST' }),
};

export const messagesAPI = {
  getByChannel: (channelId: string) => fetchAPI(`/messages/channel/${channelId}`),
  send: (data: { channelId: string; userId: string; content: string }) =>
    fetchAPI('/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

function chatFetch<T>(endpoint: string, userId?: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return fetch(`${API_BASE}${endpoint}`, { ...options, credentials: 'include', headers: { ...headers, ...(options?.headers as Record<string, string>) } }).then((res) => {
    if (!res.ok) {
      return res.json().catch(() => ({})).then((body: unknown) => {
        const err = (body as { error?: string | { message?: string } }).error;
        const message = typeof err === 'string' ? err : (err && typeof err === 'object' && (err as { message?: string }).message) || res.statusText;
        throw new Error(message);
      });
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  });
}

export const chatAPI = {
  // ── Original ──
  getChannels: (userId?: string) =>
    chatFetch<Channel[]>('/chat/channels', userId),
  createDm: (otherUserId: string, userId?: string) =>
    chatFetch<Channel>('/chat/dm', userId, {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),
  getMessages: (channelId: string, userId?: string) =>
    chatFetch<Message[]>(`/chat/channels/${channelId}/messages`, userId),
  sendMessage: (channelId: string, body: { content: string; attachments?: unknown[]; mentions?: string[]; metadata?: Record<string, unknown>; threadId?: string }, userId?: string) =>
    chatFetch<Message>(
      `/chat/channels/${channelId}/messages`, userId,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  markAsRead: (channelId: string, userId?: string) =>
    chatFetch<void>(`/chat/channels/${channelId}/read`, userId, { method: 'POST' }),

  // ── Channel Management ──
  createChannel: (data: { name: string; description?: string; type?: string; members?: string[] }) =>
    chatFetch<Channel>('/chat/channels/create', undefined, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateChannel: (channelId: string, data: { name?: string; description?: string; topic?: string }) =>
    chatFetch<Channel>(`/chat/channels/${channelId}`, undefined, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Message Actions ──
  addReaction: (channelId: string, messageId: string, emoji: string) =>
    chatFetch<{ reactions: Array<{ emoji: string; users: string[] }> }>(
      `/chat/channels/${channelId}/messages/${messageId}/react`, undefined,
      { method: 'POST', body: JSON.stringify({ emoji, action: 'add' }) },
    ),
  removeReaction: (channelId: string, messageId: string, emoji: string) =>
    chatFetch<{ reactions: Array<{ emoji: string; users: string[] }> }>(
      `/chat/channels/${channelId}/messages/${messageId}/react`, undefined,
      { method: 'POST', body: JSON.stringify({ emoji, action: 'remove' }) },
    ),
  togglePin: (channelId: string, messageId: string) =>
    chatFetch<{ messageId: string; isPinned: boolean }>(
      `/chat/channels/${channelId}/messages/${messageId}/pin`, undefined,
      { method: 'POST' },
    ),
  editMessage: (channelId: string, messageId: string, content: string) =>
    chatFetch<{ messageId: string; content: string; isEdited: boolean }>(
      `/chat/channels/${channelId}/messages/${messageId}`, undefined,
      { method: 'PUT', body: JSON.stringify({ content }) },
    ),
  deleteMessage: (channelId: string, messageId: string) =>
    chatFetch<void>(
      `/chat/channels/${channelId}/messages/${messageId}`, undefined,
      { method: 'DELETE' },
    ),

  // ── Pins & Media ──
  getPins: (channelId: string) =>
    chatFetch<Message[]>(`/chat/channels/${channelId}/pins`),
  getMedia: (channelId: string) =>
    chatFetch<ChatMediaItem[]>(`/chat/channels/${channelId}/media`),

  // ── Search ──
  searchMessages: (q: string, channelId?: string) => {
    const params = new URLSearchParams({ q });
    if (channelId) params.set('channelId', channelId);
    return chatFetch<ChatSearchResult[]>(`/chat/search?${params.toString()}`);
  },

  // ── Slash Commands ──
  slashSearch: (type: 'task' | 'document' | 'user' | 'all', q: string, limit?: number) => {
    const params = new URLSearchParams({ type, q });
    if (limit) params.set('limit', String(limit));
    return chatFetch<SlashSearchResult[]>(`/chat/slash/search?${params.toString()}`);
  },

  // ── Embedded Cards ──
  resolveEmbed: (channelId: string, type: string, refId: string) =>
    chatFetch<EmbeddedCard>(`/chat/channels/${channelId}/embed/${type}/${refId}`),

  // ── Dora AI ──
  doraSummarize: (channelId: string, messageCount?: number) =>
    chatFetch<DoraSummaryResult>(
      `/chat/channels/${channelId}/dora/summarize`, undefined,
      { method: 'POST', body: JSON.stringify({ messageCount }) },
    ),
  doraActionItems: (channelId: string, messageCount?: number) =>
    chatFetch<DoraActionItemsResult>(
      `/chat/channels/${channelId}/dora/action-items`, undefined,
      { method: 'POST', body: JSON.stringify({ messageCount }) },
    ),
  doraSmartReply: (channelId: string, options?: { threadId?: string }) =>
    chatFetch<SmartReplyResult>(
      `/chat/channels/${channelId}/dora/smart-reply`, undefined,
      { method: 'POST', body: JSON.stringify({ threadId: options?.threadId }) },
    ),
  doraSuggest: (channelId: string, question: string) =>
    chatFetch<{ suggestions: DoraKBSuggestion[]; query: string }>(
      `/chat/channels/${channelId}/dora/suggest`, undefined,
      { method: 'POST', body: JSON.stringify({ question }) },
    ),
  doraSummarizeThread: (channelId: string, parentMessageId: string, messageCount?: number) =>
    chatFetch<DoraSummaryResult>(
      `/chat/channels/${channelId}/messages/${parentMessageId}/dora/summarize-thread`, undefined,
      { method: 'POST', body: JSON.stringify({ messageCount }) },
    ),
  doraActionItemsThread: (channelId: string, parentMessageId: string, messageCount?: number) =>
    chatFetch<DoraActionItemsResult>(
      `/chat/channels/${channelId}/messages/${parentMessageId}/dora/action-items-thread`, undefined,
      { method: 'POST', body: JSON.stringify({ messageCount }) },
    ),
  doraTransformMessage: (
    channelId: string,
    messageId: string,
    body: { action: DoraTransformAction; targetLocale?: string },
  ) =>
    chatFetch<DoraMessageTransformResult>(
      `/chat/channels/${channelId}/messages/${messageId}/dora/transform`, undefined,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  doraTransformDraft: (
    channelId: string,
    body: { text: string; action: DoraTransformAction; targetLocale?: string },
  ) =>
    chatFetch<DoraMessageTransformResult>(
      `/chat/channels/${channelId}/dora/transform-draft`, undefined,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  doraDecisions: (channelId: string, messageCount?: number) =>
    chatFetch<DoraDecisionsResult>(
      `/chat/channels/${channelId}/dora/decisions`, undefined,
      { method: 'POST', body: JSON.stringify({ messageCount }) },
    ),

  // ── Threads ──
  getThreadMessages: (channelId: string, messageId: string) =>
    chatFetch<Message[]>(`/chat/channels/${channelId}/messages/${messageId}/thread`),

  // ── Universal Search ──
  universalSearch: (q: string) =>
    chatFetch<UniversalSearchResults>(`/chat/search/universal?q=${encodeURIComponent(q)}`),

  // ── Smart Folders (Bookmarks) ──
  getSmartFolders: () =>
    chatFetch<SmartFolder[]>('/chat/bookmarks'),
  createSmartFolder: (data: Omit<SmartFolder, 'id' | 'createdAt'>) =>
    chatFetch<SmartFolder>('/chat/bookmarks', undefined, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteSmartFolder: (folderId: string) =>
    chatFetch<void>(`/chat/bookmarks/${folderId}`, undefined, { method: 'DELETE' }),

  // ── Reactions detail ──
  getReactionUsers: (channelId: string, messageId: string) =>
    chatFetch<Array<{ emoji: string; users: Array<{ id: string; name: string; avatar: string }> }>>(
      `/chat/channels/${channelId}/messages/${messageId}/reactions`,
    ),

  // ── Gamification ──
  awardChatXP: (channelId: string, event: string, targetUserId?: string) =>
    chatFetch<{ amount: number; total: number }>(
      `/chat/channels/${channelId}/xp/award`, undefined,
      { method: 'POST', body: JSON.stringify({ event, targetUserId }) },
    ),
};
