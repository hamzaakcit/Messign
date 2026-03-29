import { create } from 'zustand';

/** Tiles in `MainDashboard` bento grid — drives optional Dora `widgetContext` on home. */
export type MissionControlBentoKey = 'dora' | 'growth' | 'tasks' | 'knowledge' | 'pulse';

interface MissionControlFocusState {
  /** Last hovered/focused bento tile on Mission Control; cleared on leave dashboard. */
  focusedBentoKey: MissionControlBentoKey | null;
  setFocusedBentoKey: (key: MissionControlBentoKey | null) => void;
}

export const useMissionControlFocusStore = create<MissionControlFocusState>((set) => ({
  focusedBentoKey: null,
  setFocusedBentoKey: (key) => set({ focusedBentoKey: key }),
}));
