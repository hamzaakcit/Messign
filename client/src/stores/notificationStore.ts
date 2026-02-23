import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType =
  | 'xp_awarded'
  | 'badge_earned'
  | 'admin_message'
  | 'admin_announcement'
  | 'level_up'
  | 'mention'
  | 'system'
  | 'task_assigned'
  | 'reimbursement_approved'
  | 'reimbursement_rejected'
  | 'knowledge_new_document'
  | 'knowledge_document_updated'
  | 'knowledge_required_reading'
  | 'knowledge_flag_created'
  | 'knowledge_flag_resolved';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  timestamp: string; // ISO string for persist/rehydration
  actionUrl?: string;
  actionLabel?: string;
  metadata?: {
    xpAmount?: number;
    badge?: { id: string; name: string; icon: string; rarity: string };
    fromUser?: { id: string; name: string; avatar?: string };
    newLevel?: number;
    [key: string]: unknown;
  };
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  addNotification: (data: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (data) => {
        const notification: Notification = {
          ...data,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          timestamp: new Date().toISOString(),
          read: false,
        };
        set((state) => {
          const next = [notification, ...state.notifications];
          return {
            notifications: next,
            unreadCount: state.unreadCount + 1,
          };
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const next = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          const notif = state.notifications.find((n) => n.id === id);
          const wasUnread = notif && !notif.read;
          return {
            notifications: next,
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      deleteNotification: (id) => {
        set((state) => {
          const notif = state.notifications.find((n) => n.id === id);
          const wasUnread = notif && !notif.read;
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
          };
        });
      },

      clearAll: () => {
        set({ notifications: [], unreadCount: 0 });
      },
    }),
    {
      name: 'notification-storage',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50),
        unreadCount: state.unreadCount,
      }),
    }
  )
);
