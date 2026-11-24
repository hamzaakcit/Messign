import { create } from 'zustand';
import type { HelpId } from '@/lib/helpContent';

interface HelpDrawerState {
  openId: HelpId | null;
  open: (id: HelpId) => void;
  close: () => void;
}

export const useHelpDrawer = create<HelpDrawerState>((set) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
}));
