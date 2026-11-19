import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Search, Sparkles, Menu } from 'lucide-react';
import { useUIStore, type View } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUsersStore } from '@/stores/usersStore';
import { useGameStore } from '@/stores/gameStore';
import { LeftSidebar } from './LeftSidebar';
import { effectiveSidebarCollapsed } from './sidebarLayout';
import { MainContent } from './MainContent';
import { XPGainNotification, CelebrationOverlay } from '@/components/ui';
import { CommandSurface, useRecentPages } from '@/components/CommandSurface';
import { FloatingWidget } from '@/components/dora/FloatingWidget';
import { OnboardingWalkthrough } from '@/components/onboarding/OnboardingWalkthrough';
import { MorningBriefingToast } from '@/components/dora/MorningBriefingToast';
import { getSocket, onEmployeeAdded, onEmployeeUpdated, onEmployeeDeleted, onEmployeeBulkImport } from '@/lib/socket';
import { installChatSocketHandlers } from '@/lib/chatSocketBridge';
import { isPathOnSurface, mountsFrozenModules } from '@/lib/productSurface';
import { useEffectiveSurface } from '@/lib/useEffectiveSurface';

const PATH_TO_VIEW: Record<string, string> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/executive': 'executive',
  '/reports': 'reports',
  '/dora': 'dora',
  '/chat': 'chat',
  '/knowledge': 'knowledge',
  '/knowledge-hub': 'knowledge',
  '/achievements': 'achievements',
  '/team': 'team',
  '/projects': 'projects',
  '/settings': 'settings',
  '/finance': 'finance',
  '/crm': 'crm',
  '/marketing': 'marketing',
  '/recruitment': 'recruitment',
  '/support': 'support',
  '/okr': 'okr',
  '/assets': 'assets',
  '/contracts': 'contracts',
  '/culture': 'culture',
};

function getViewFromPath(path: string): string {
  if (path.startsWith('/okr')) return 'okr';
  if (path.startsWith('/executive')) return 'executive';
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/crm')) return 'crm';
  if (path.startsWith('/marketing')) return 'marketing';
  if (path.startsWith('/recruitment')) return 'recruitment';
  if (path.startsWith('/support')) return 'support';
  if (path.startsWith('/assets')) return 'assets';
  if (path.startsWith('/contracts')) return 'contracts';
  if (path.startsWith('/culture')) return 'culture';
  if (path.startsWith('/finance')) return 'finance';
  if (path === '/reimbursements/invoices' || path.startsWith('/reimbursements/invoices/')) return 'invoices';
  if (path.startsWith('/reimbursements')) return 'reimbursements';
  if (path.startsWith('/knowledge-hub')) return 'knowledge';
  if (path.startsWith('/knowledge')) return 'knowledge';
  if (path.startsWith('/projects')) return 'projects';
  if (path.startsWith('/team')) return 'team';
  if (path.startsWith('/achievements')) return 'achievements';
  if (path.startsWith('/chat')) return 'chat';
  if (path.startsWith('/settings')) return 'settings';
  if (path === '/dora/game') return 'game';
  if (path.startsWith('/dora')) return 'dora';
  return PATH_TO_VIEW[path] ?? 'dashboard';
}

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  executive: 'Executive Dashboard',
  reports: 'Report Hub',
  dora: 'Dora',
  game: 'Dora Game',
  chat: 'Chat',
  knowledge: 'Knowledge Hub',
  achievements: 'Achievements',
  team: 'Team Directory',
  projects: 'Projects',
  settings: 'Settings',
  finance: 'Finance',
  reimbursements: 'Reimbursements',
  invoices: 'Invoices',
  crm: 'Sales CRM',
  marketing: 'Marketing',
  recruitment: 'Recruitment',
  support: 'Support',
  okr: 'OKRs & Goals',
  assets: 'Assets',
  contracts: 'Contracts',
  culture: 'Culture',
};

export function AppShell() {
  const location = useLocation();
  const leftSidebarOpen = useUIStore(s => s.leftSidebarOpen);
  const leftSidebarCollapsed = useUIStore(s => s.leftSidebarCollapsed);
  const isMobile = useUIStore(s => s.isMobile);
  const setMobile = useUIStore(s => s.setMobile);
  const setView = useUIStore(s => s.setView);
  const currentView = useUIStore(s => s.currentView);
  const focusMode = useUIStore(s => s.focusMode);
  const commandSurfaceOpen = useUIStore(s => s.commandSurfaceOpen);
  const closeCommandSurface = useUIStore(s => s.closeCommandSurface);
  const toggleCommandSurface = useUIStore(s => s.toggleCommandSurface);
  const toggleFocusMode = useUIStore(s => s.toggleFocusMode);
  const user = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);
  const { recentPages, trackPage } = useRecentPages();
  const surface = useEffectiveSurface();
  const showCompanyOsWidgets = surface !== 'engage';
  /** Chat, projects, tasks, badges, activities, leaderboard: Company-OS data an engage session has no access to (ADR-017). */
  const loadsCompanyOsData = mountsFrozenModules(surface);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandSurface();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandSurface, toggleFocusMode]);

  const fetchChannels = useChatStore(s => s.fetchChannels);
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const fetchTasks = useProjectStore(s => s.fetchTasks);
  const fetchUsers = useUsersStore(s => s.fetchUsers);
  const updateUserStatus = useUsersStore(s => s.updateUserStatus);
  const fetchBadges = useGameStore(s => s.fetchBadges);
  const fetchActivities = useGameStore(s => s.fetchActivities);
  const fetchLeaderboard = useGameStore(s => s.fetchLeaderboard);
  const addActivity = useGameStore(s => s.addActivity);
  const addXPGain = useGameStore(s => s.addXPGain);
  const showXPGain = useGameStore(s => s.showXPGain);
  const lastXPGain = useGameStore(s => s.lastXPGain);

  useEffect(() => {
    const path = location.pathname;
    const view = getViewFromPath(path);
    if (view !== currentView) {
      setView(view as Parameters<typeof setView>[0]);
    }
    const label = VIEW_LABELS[view] ?? view;
    trackPage(path, label);
  }, [location.pathname]);

  useEffect(() => {
    if (!user || !loadsCompanyOsData) return;
    if (user.id) fetchChannels(user.id);
    fetchProjects();
    fetchTasks();
    const t = setTimeout(() => {
      fetchUsers();
      fetchBadges();
      fetchActivities();
      fetchLeaderboard();
    }, 0);
    return () => clearTimeout(t);
  }, [user?.id]);

  useEffect(() => {
    const handleResize = () => {
      setMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setMobile]);

  // Socket handlers use getState() for reactive values. All other store actions
  // (addMessage, addXPGain, etc.) are stable Zustand selectors that never change
  // identity. Only updateUser is included as a dep for ESLint correctness; the
  // effect is effectively mounted once for the lifetime of AppShell.
  useEffect(() => {
    const socket = getSocket();

    const unsubChat = installChatSocketHandlers();

    socket.on('xp:gained', ({ amount }) => {
      addXPGain(amount);
    });

    socket.on('activity:new', (activity) => {
      addActivity(activity);
    });

    socket.on('user:status', ({ userId, status }) => {
      updateUserStatus(userId, status as Parameters<typeof updateUserStatus>[1]);
    });

    const handleEmployeeUpdated = (data: { employee?: { id: string; name?: string; jobTitle?: string; department?: string; email?: string; role?: string; phone?: string; location?: string } }) => {
      const currentUser = useAuthStore.getState().user;
      const emp = data.employee;
      if (currentUser && emp && emp.id === currentUser.id) {
        updateUser({
          name: emp.name ?? currentUser.name,
          jobTitle: emp.jobTitle ?? currentUser.jobTitle,
          department: emp.department ?? currentUser.department,
          email: emp.email ?? currentUser.email,
          role: (emp.role ?? currentUser.role) as import('@/types').UserRole,
          ...(emp.phone !== undefined && { phone: emp.phone }),
          ...(emp.location !== undefined && { location: emp.location }),
        });
      }
    };

    socket.on('employee:updated', handleEmployeeUpdated);

    const refetchUsers = () => { if (loadsCompanyOsData) void fetchUsers(); };
    const unsubAdded = onEmployeeAdded(refetchUsers);
    const unsubUpdated = onEmployeeUpdated(refetchUsers);
    const unsubDeleted = onEmployeeDeleted(refetchUsers);
    const unsubBulkImport = onEmployeeBulkImport(refetchUsers);

    return () => {
      unsubChat();
      socket.off('xp:gained');
      socket.off('activity:new');
      socket.off('user:status');
      socket.off('employee:updated', handleEmployeeUpdated);
      unsubAdded();
      unsubUpdated();
      unsubDeleted();
      unsubBulkImport();
    };
  }, [updateUser]);

  const showSidebar = !focusMode && leftSidebarOpen;
  const sidebarCollapsed = effectiveSidebarCollapsed(leftSidebarCollapsed, isMobile);

  return (
    <div className="h-screen flex bg-app overflow-hidden transition-colors duration-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        Skip to main content
      </a>

      <CommandSurface
        open={commandSurfaceOpen}
        onClose={closeCommandSurface}
        recentPages={recentPages}
      />

      <XPGainNotification amount={lastXPGain} show={showXPGain} />

      {user && <CelebrationOverlay />}
      {user && showCompanyOsWidgets && <MorningBriefingToast />}

      {/* Left Sidebar */}
      <div
        className={`
          ${!showSidebar ? 'w-0' : sidebarCollapsed ? 'w-16' : 'w-60'}
          ${isMobile ? 'absolute z-40 h-full' : 'relative'}
          transition-all duration-200 ease-out overflow-visible
        `}
      >
        {showSidebar && <LeftSidebar collapsed={sidebarCollapsed} />}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <MainContent />
      </div>

      {/* Mobile overlay */}
      {isMobile && leftSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => useUIStore.getState().toggleLeftSidebar()}
        />
      )}

      {/* Focus mode exit pill */}
      {focusMode && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 group">
          <button
            onClick={toggleFocusMode}
            className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 px-3 py-1 rounded-full bg-app-card border border-app text-xs text-app-muted hover:text-app shadow-lg"
          >
            Exit focus mode (⌘.)
          </button>
        </div>
      )}

      {user && !isMobile && showCompanyOsWidgets && <FloatingWidget />}
      {user && showCompanyOsWidgets && <OnboardingWalkthrough />}

      {/* Mobile bottom tab bar */}
      {isMobile && user && !focusMode && <MobileTabBar />}
    </div>
  );
}

const MOBILE_TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'dora', label: 'Dora', icon: Sparkles, path: '/dora' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, path: '/chat' },
  { id: 'search', label: 'Search', icon: Search, path: null },
  { id: 'menu', label: 'Menu', icon: Menu, path: null },
] as const;

function MobileTabBar() {
  const navigate = useNavigate();
  const currentView = useUIStore((s) => s.currentView);
  const setView = useUIStore((s) => s.setView);
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const openCommandSurface = useUIStore((s) => s.openCommandSurface);

  const handleTab = useCallback((tab: typeof MOBILE_TABS[number]) => {
    if (tab.id === 'search') {
      openCommandSurface();
      return;
    }
    if (tab.id === 'menu') {
      toggleLeftSidebar();
      return;
    }
    if (tab.path) {
      setView(tab.id as View);
      navigate(tab.path);
    }
  }, [setView, navigate, toggleLeftSidebar, openCommandSurface]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 bg-app-sidebar border-t border-app safe-area-bottom">
      {MOBILE_TABS.filter((tab) => !tab.path || isPathOnSurface(tab.path)).map((tab) => {
        const isActive = tab.id === currentView;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => handleTab(tab)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors',
              isActive ? 'text-primary-400' : 'text-app-muted',
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
