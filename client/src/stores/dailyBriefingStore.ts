import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyBriefing } from '@/lib/api';

interface DailyBriefingState {
  byDate: Record<string, DailyBriefing>;
  setBriefing: (briefing: DailyBriefing) => void;
  getBriefing: (date: string) => DailyBriefing | null;
  clear: () => void;
}

export const useDailyBriefingStore = create<DailyBriefingState>()(
  persist(
    (set, get) => ({
      byDate: {},
      setBriefing: (briefing) =>
        set((state) => ({
          byDate: { ...state.byDate, [briefing.date]: briefing },
        })),
      getBriefing: (date) => get().byDate[date] ?? null,
      clear: () => set({ byDate: {} }),
    }),
    {
      name: 'daily-briefing-cache',
      partialize: (state) => ({ byDate: state.byDate }),
    },
  ),
);
