/** @module notificationsApi — In-app notification CRUD and preference management. */
import { fetchWithUserId } from './apiCore';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  module: string | null;
  severity: 'info' | 'warning' | 'critical' | 'success';
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  event_type: string;
  in_app: boolean;
  email: boolean;
  push: boolean;
}

export const notificationsAPI = {
  list: (userId: string, params?: { unread?: boolean; module?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.unread) qs.set('unread', 'true');
    if (params?.module) qs.set('module', params.module);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return fetchWithUserId<AppNotification[]>(`/notifications${qs.toString() ? `?${qs.toString()}` : ''}`, userId);
  },
  unreadCount: (userId: string) => fetchWithUserId<{ count: number }>('/notifications/unread-count', userId),
  markRead: (userId: string, id: string) =>
    fetchWithUserId<{ ok: boolean }>(`/notifications/${id}/read`, userId, { method: 'PUT' }),
  markAllRead: (userId: string) =>
    fetchWithUserId<{ ok: boolean }>('/notifications/read-all', userId, { method: 'PUT' }),
  remove: (userId: string, id: string) =>
    fetchWithUserId<{ ok: boolean }>(`/notifications/${id}`, userId, { method: 'DELETE' }),
  preferences: (userId: string) =>
    fetchWithUserId<NotificationPreference[]>('/notifications/preferences', userId),
  updatePreferences: (userId: string, rows: Array<{ event_type: string; in_app: boolean; email: boolean; push?: boolean }>) =>
    fetchWithUserId<{ ok: boolean }>('/notifications/preferences', userId, {
      method: 'PUT',
      body: JSON.stringify(rows),
    }),
};
