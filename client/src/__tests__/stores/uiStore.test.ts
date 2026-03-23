import { useUIStore } from '@/stores/uiStore';

const defaultData = {
  currentView: 'dashboard' as const,
  leftSidebarOpen: true,
  leftSidebarCollapsed: false,
  rightSidebarOpen: false,
  rightSidebarCollapsed: false,
  isMobile: false,
  modalOpen: null as string | null,
  modalData: null as unknown,
  commandSurfaceOpen: false,
  focusMode: false,
  contextDrawerOpen: null as string | null,
};

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState(defaultData);
});

afterEach(() => {
  localStorage.clear();
});

describe('uiStore', () => {
  describe('initial state', () => {
    it('has dashboard as the default view', () => {
      expect(useUIStore.getState().currentView).toBe('dashboard');
    });

    it('has left sidebar open and not collapsed by default', () => {
      const s = useUIStore.getState();
      expect(s.leftSidebarOpen).toBe(true);
      expect(s.leftSidebarCollapsed).toBe(false);
    });

    it('has no modal open and no modal data', () => {
      const s = useUIStore.getState();
      expect(s.modalOpen).toBeNull();
      expect(s.modalData).toBeNull();
    });

    it('is not mobile by default', () => {
      expect(useUIStore.getState().isMobile).toBe(false);
    });
  });

  describe('toggleLeftSidebar', () => {
    it('collapses the left sidebar when open and not yet collapsed', () => {
      useUIStore.setState({ leftSidebarOpen: true, leftSidebarCollapsed: false, isMobile: false });

      useUIStore.getState().toggleLeftSidebar();

      expect(useUIStore.getState().leftSidebarCollapsed).toBe(true);
    });

    it('un-collapses the left sidebar when already collapsed', () => {
      useUIStore.setState({ leftSidebarOpen: true, leftSidebarCollapsed: true, isMobile: false });

      useUIStore.getState().toggleLeftSidebar();

      expect(useUIStore.getState().leftSidebarCollapsed).toBe(false);
    });

    it('opens the left sidebar when it is closed (non-mobile)', () => {
      useUIStore.setState({ leftSidebarOpen: false, isMobile: false });

      useUIStore.getState().toggleLeftSidebar();

      expect(useUIStore.getState().leftSidebarOpen).toBe(true);
    });

    it('toggles left sidebar open/closed in mobile mode', () => {
      useUIStore.setState({ leftSidebarOpen: false, isMobile: true });

      useUIStore.getState().toggleLeftSidebar();
      expect(useUIStore.getState().leftSidebarOpen).toBe(true);

      useUIStore.getState().toggleLeftSidebar();
      expect(useUIStore.getState().leftSidebarOpen).toBe(false);
    });
  });

  describe('openModal / closeModal', () => {
    it('opens a modal by id', () => {
      useUIStore.getState().openModal('confirm-delete');

      const s = useUIStore.getState();
      expect(s.modalOpen).toBe('confirm-delete');
      expect(s.modalData).toBeUndefined();
    });

    it('opens a modal with data', () => {
      useUIStore.getState().openModal('edit-user', { userId: '42' });

      const s = useUIStore.getState();
      expect(s.modalOpen).toBe('edit-user');
      expect(s.modalData).toEqual({ userId: '42' });
    });

    it('closeModal clears modalOpen and modalData', () => {
      useUIStore.getState().openModal('edit-user', { userId: '42' });
      useUIStore.getState().closeModal();

      const s = useUIStore.getState();
      expect(s.modalOpen).toBeNull();
      expect(s.modalData).toBeNull();
    });
  });

  describe('setView', () => {
    it('updates the currentView', () => {
      useUIStore.getState().setView('marketing');
      expect(useUIStore.getState().currentView).toBe('marketing');

      useUIStore.getState().setView('finance');
      expect(useUIStore.getState().currentView).toBe('finance');
    });
  });

  describe('command surface', () => {
    it('opens and closes the command surface', () => {
      useUIStore.getState().openCommandSurface();
      expect(useUIStore.getState().commandSurfaceOpen).toBe(true);

      useUIStore.getState().closeCommandSurface();
      expect(useUIStore.getState().commandSurfaceOpen).toBe(false);
    });

    it('toggles the command surface', () => {
      expect(useUIStore.getState().commandSurfaceOpen).toBe(false);

      useUIStore.getState().toggleCommandSurface();
      expect(useUIStore.getState().commandSurfaceOpen).toBe(true);

      useUIStore.getState().toggleCommandSurface();
      expect(useUIStore.getState().commandSurfaceOpen).toBe(false);
    });
  });
});
