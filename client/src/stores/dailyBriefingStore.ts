import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyBriefing } from '@/lib/api';

interface DailyBriefingState {
  byUserAndDate: Record<string, DailyBriefing>;
  setBriefing: (userId: string, briefing: DailyBriefing) => void;
  getBriefing: (userId: string, date: string) => DailyBriefing | null;
  clear: () => void;
}

export const useDailyBriefingStore = create<DailyBriefingState>()(
  persist(
    (set, get) => ({
      byUserAndDate: {},
      setBriefing: (userId, briefing) =>
        set((state) => ({
          byUserAndDate: { ...state.byUserAndDate, [`${userId}:${briefing.date}`]: briefing },
        })),
      getBriefing: (userId, date) => get().byUserAndDate[`${userId}:${date}`] ?? null,
      clear: () => set({ byUserAndDate: {} }),
    }),
    {
      name: 'daily-briefing-cache',
      partialize: (state) => ({ byUserAndDate: state.byUserAndDate }),
    },
  ),
);
