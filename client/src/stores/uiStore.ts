import { create } from 'zustand';

const STORAGE_KEY = 'sidebar-layout';

export type View = 'dashboard' | 'executive' | 'reports' | 'dora' | 'game' | 'chat' | 'projects' | 'knowledge' | 'achievements' | 'team' | 'settings' | 'finance' | 'reimbursements' | 'invoices' | 'crm' | 'marketing' | 'recruitment' | 'support' | 'okr' | 'assets' | 'contracts' | 'culture';

interface SidebarLayout {
  leftOpen: boolean;
  rightOpen: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const defaults: SidebarLayout = {
  leftOpen: true,
  rightOpen: false,
  leftCollapsed: true,
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
  leftSidebarCollapsed: boolean;
  /** @deprecated Right sidebar removed -- kept for backward compat with any remaining references */
  rightSidebarOpen: boolean;
  /** @deprecated */
  rightSidebarCollapsed: boolean;
  isMobile: boolean;
  focusMode: boolean;
  contextDrawerOpen: string | null;
  modalOpen: string | null;
  modalData: unknown;
  commandSurfaceOpen: boolean;
  setView: (view: View) => void;
  toggleLeftSidebar: () => void;
  /** @deprecated */
  toggleRightSidebar: () => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  /** @deprecated */
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setMobile: (isMobile: boolean) => void;
  toggleFocusMode: () => void;
  openContextDrawer: (id: string) => void;
  closeContextDrawer: () => void;
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: () => void;
  openCommandSurface: () => void;
  closeCommandSurface: () => void;
  toggleCommandSurface: () => void;
}

const stored = getStoredSidebarState();

export const useUIStore = create<UIState>((set) => ({
  currentView: 'dashboard',
  leftSidebarOpen: stored.leftOpen,
  leftSidebarCollapsed: stored.leftCollapsed,
  rightSidebarOpen: false,
  rightSidebarCollapsed: false,
  isMobile: false,
  focusMode: false,
  contextDrawerOpen: null,
  modalOpen: null,
  modalData: null,
  commandSurfaceOpen: false,

  setView: (view) => set({ currentView: view }),

  toggleLeftSidebar: () =>
    set((state) => {
      if (state.isMobile) {
        const next = { leftSidebarOpen: !state.leftSidebarOpen };
        persistSidebarState({
          leftOpen: next.leftSidebarOpen,
          rightOpen: false,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: false,
        });
        return next;
      }
      if (!state.leftSidebarOpen) {
        persistSidebarState({
          leftOpen: true,
          rightOpen: false,
          leftCollapsed: state.leftSidebarCollapsed,
          rightCollapsed: false,
        });
        return { leftSidebarOpen: true };
      }
      const next = { leftSidebarCollapsed: !state.leftSidebarCollapsed };
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: false,
        leftCollapsed: next.leftSidebarCollapsed,
        rightCollapsed: false,
      });
      return next;
    }),

  toggleRightSidebar: () => set({ rightSidebarOpen: false }),

  setLeftSidebarCollapsed: (collapsed) =>
    set((state) => {
      persistSidebarState({
        leftOpen: state.leftSidebarOpen,
        rightOpen: false,
        leftCollapsed: collapsed,
        rightCollapsed: false,
      });
      return { leftSidebarCollapsed: collapsed };
    }),

  setRightSidebarCollapsed: () => set({ rightSidebarCollapsed: false }),

  setMobile: (isMobile) =>
    set(() => {
      if (isMobile) {
        return { isMobile, leftSidebarOpen: false, rightSidebarOpen: false };
      }
      const stored = getStoredSidebarState();
      return {
        isMobile: false,
        leftSidebarOpen: stored.leftOpen,
        rightSidebarOpen: false,
        leftSidebarCollapsed: stored.leftCollapsed,
        rightSidebarCollapsed: false,
      };
    }),

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  openContextDrawer: (id) => set({ contextDrawerOpen: id }),
  closeContextDrawer: () => set({ contextDrawerOpen: null }),

  openModal: (modalId, data) => set({ modalOpen: modalId, modalData: data }),
  closeModal: () => set({ modalOpen: null, modalData: null }),

  openCommandSurface: () => set({ commandSurfaceOpen: true }),
  closeCommandSurface: () => set({ commandSurfaceOpen: false }),
  toggleCommandSurface: () => set((s) => ({ commandSurfaceOpen: !s.commandSurfaceOpen })),
}));
