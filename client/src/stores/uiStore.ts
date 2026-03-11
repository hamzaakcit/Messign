import { create } from 'zustand';

const STORAGE_KEY = 'sidebar-layout';

type View = 'dashboard' | 'dora' | 'game' | 'chat' | 'projects' | 'knowledge' | 'achievements' | 'team' | 'settings' | 'finance' | 'reimbursements' | 'invoices' | 'crm' | 'support' | 'time' | 'okr';

interface SidebarLayout {
  leftOpen: boolean;
  rightOpen: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const defaults: SidebarLayout = {
  leftOpen: true,
  rightOpen: true,
  leftCollapsed: false,
  rightCollapsed: false,
};

function getStoredSidebarState(): SidebarLayout {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarLayout>;
      return { ...defaults, ...parsed };
    }
  } catch {}
  return defaults;
}

function persistSidebarState(state: SidebarLayout) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

interface UIState {
  currentView: View;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  isMobile: boolean;
  modalOpen: string | null;
  modalData: any;
  commandSurfaceOpen: boolean;
  setView: (view: View) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setMobile: (isMobile: boolean) => void;
  openModal: (modalId: string, data?: any) => void;
  closeModal: () => void;
  openCommandSurface: () => void;
  closeCommandSurface: () => void;
  toggleCommandSurface: () => void;
}

const stored = getStoredSidebarState();

export const useUIStore = create<UIState>((set) => ({
  currentView: 'dashboard',
  leftSidebarOpen: stored.leftOpen,
  rightSidebarOpen: stored.rightOpen,
  leftSidebarCollapsed: stored.leftCollapsed,
  rightSidebarCollapsed: stored.rightCollapsed,
  isMobile: false,
  modalOpen: null,
  modalData: null,
  commandSurfaceOpen: false,

  setView: (view) => set({ currentView: view }),

  toggleLeftSidebar: () =>
    set((state) => {
      const isMobile = state.isMobile;
      if (isMobile) {
        const next = { leftSidebarOpen: !state.leftSidebarOpen };
        persistSidebarState({
          leftOpen: next.leftSidebarOpen,
          rightOpen: state.rightSidebarOpen,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: state.rightSidebarCollapsed,
        });
        return next;
      }
      if (!state.leftSidebarOpen) {
        const next = { leftSidebarOpen: true };
        persistSidebarState({
          leftOpen: true,
          rightOpen: state.rightSidebarOpen,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: state.rightSidebarCollapsed,
        });
        return next;
      }
      const next = { leftSidebarCollapsed: !state.leftSidebarCollapsed };
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: state.rightSidebarOpen,
        leftCollapsed: next.leftSidebarCollapsed,
        rightCollapsed: state.rightSidebarCollapsed,
      });
      return next;
    }),

  toggleRightSidebar: () =>
    set((state) => {
      const isMobile = state.isMobile;
      if (isMobile) {
        const next = { rightSidebarOpen: !state.rightSidebarOpen };
        persistSidebarState({
          leftOpen: state.leftSidebarOpen,
          rightOpen: next.rightSidebarOpen,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: state.rightSidebarCollapsed,
        });
        return next;
      }
      if (!state.rightSidebarOpen) {
        const next = { rightSidebarOpen: true };
        persistSidebarState({
          leftOpen: state.leftSidebarOpen,
          rightOpen: true,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: state.rightSidebarCollapsed,
        });
        return next;
      }
      const next = { rightSidebarCollapsed: !state.rightSidebarCollapsed };
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: state.rightSidebarOpen,
        leftCollapsed: state.leftSidebarCollapsed,
        rightCollapsed: next.rightSidebarCollapsed,
      });
      return next;
    }),

  setLeftSidebarCollapsed: (collapsed) =>
    set((state) => {
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: state.rightSidebarOpen,
        leftCollapsed: collapsed,
        rightCollapsed: state.rightSidebarCollapsed,
      });
      return { leftSidebarCollapsed: collapsed };
    }),

  setRightSidebarCollapsed: (collapsed) =>
    set((state) => {
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: state.rightSidebarOpen,
        leftCollapsed: state.leftSidebarCollapsed,
        rightCollapsed: collapsed,
      });
      return { rightSidebarCollapsed: collapsed };
    }),

  setMobile: (isMobile) =>
    set((_state) => {
      if (isMobile) {
        return { isMobile, leftSidebarOpen: false, rightSidebarOpen: false };
      }
      const stored = getStoredSidebarState();
      return {
        isMobile: false,
        leftSidebarOpen: stored.leftOpen,
        rightSidebarOpen: stored.rightOpen,
        leftSidebarCollapsed: stored.leftCollapsed,
        rightSidebarCollapsed: stored.rightCollapsed,
      };
    }),

  openModal: (modalId, data) => set({ modalOpen: modalId, modalData: data }),

  closeModal: () => set({ modalOpen: null, modalData: null }),

  openCommandSurface: () => set({ commandSurfaceOpen: true }),
  closeCommandSurface: () => set({ commandSurfaceOpen: false }),
  toggleCommandSurface: () => set((s) => ({ commandSurfaceOpen: !s.commandSurfaceOpen })),
}));
