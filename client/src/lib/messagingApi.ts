/** @module messagingApi — Channel, message, and DB-backed chat APIs. */
import { getAccessToken } from './authToken';
import { API_BASE, fetchAPI } from './api';

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
  getChannels: (userId?: string) =>
    chatFetch<{ id: string; name: string; description?: string; type: string; members: string[]; unreadCount: number; createdAt: string }[]>('/chat/channels', userId),
  createDm: (otherUserId: string, userId?: string) =>
    chatFetch<{ id: string; name: string; description?: string; type: string; members: string[]; unreadCount: number; createdAt: string }>('/chat/dm', userId, {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),
  getMessages: (channelId: string, userId?: string) =>
    chatFetch<{ id: string; channelId: string; userId: string; content: string; attachments: unknown[]; mentions: string[]; xpGained: number; timestamp: string; senderName?: string; senderAvatar?: string }[]>(
      `/chat/channels/${channelId}/messages`,
      userId
    ),
  sendMessage: (channelId: string, body: { content: string; attachments?: unknown[]; mentions?: string[] }, userId?: string) =>
    chatFetch<{ id: string; channelId: string; userId: string; content: string; attachments: unknown[]; mentions: string[]; xpGained: number; timestamp: string; senderName?: string; senderAvatar?: string }>(
      `/chat/channels/${channelId}/messages`,
      userId,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  markAsRead: (channelId: string, userId?: string) =>
    chatFetch<void>(`/chat/channels/${channelId}/read`, userId, { method: 'POST' }),
};
