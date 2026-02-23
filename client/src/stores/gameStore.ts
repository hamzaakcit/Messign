import { create } from 'zustand';
import type { Badge, Activity, LeaderboardEntry, Notification } from '@/types';
import { badgesAPI, activitiesAPI, leaderboardAPI } from '@/lib/api';

interface XPGainEvent {
  id: string;
  amount: number;
  reason: string;
  timestamp: Date;
}

interface GameState {
  badges: Badge[];
  activities: Activity[];
  leaderboard: LeaderboardEntry[];
  notifications: Notification[];
  xpGainEvents: XPGainEvent[];
  showXPGain: boolean;
  lastXPGain: number;
  isLoading: boolean;
  fetchBadges: () => Promise<void>;
  fetchActivities: () => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
  addActivity: (activity: Activity) => void;
  addXPGain: (amount: number, reason?: string) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  clearXPGain: () => void;
}

let xpEventCounter = 0;

export const useGameStore = create<GameState>((set) => ({
  badges: [],
  activities: [],
  leaderboard: [],
  notifications: [],
  xpGainEvents: [],
  showXPGain: false,
  lastXPGain: 0,
  isLoading: false,

  fetchBadges: async () => {
    try {
      const badges = await badgesAPI.getAll() as Badge[];
      set({ badges });
    } catch (error) {
      console.error('Failed to fetch badges:', error);
    }
  },

  fetchActivities: async () => {
    try {
      const activities = await activitiesAPI.getRecent(20) as Activity[];
      set({ activities });
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  },

  fetchLeaderboard: async () => {
    try {
      const leaderboard = await leaderboardAPI.get(10) as LeaderboardEntry[];
      set({ leaderboard });
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  },

  addActivity: (activity) => {
    set((state) => ({
      activities: [activity, ...state.activities].slice(0, 50),
    }));
  },

  addXPGain: (amount, reason = 'Activity') => {
    const event: XPGainEvent = {
      id: `xp-${xpEventCounter++}`,
      amount,
      reason,
      timestamp: new Date(),
    };
    
    set((state) => ({
      xpGainEvents: [...state.xpGainEvents, event],
      showXPGain: true,
      lastXPGain: amount,
    }));

    // Auto-clear after animation
    setTimeout(() => {
      set((state) => ({
        xpGainEvents: state.xpGainEvents.filter((e) => e.id !== event.id),
        showXPGain: state.xpGainEvents.length > 1,
      }));
    }, 2000);
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
    }));
  },

  markNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
  },

  clearXPGain: () => {
    set({ showXPGain: false });
  },
}));
