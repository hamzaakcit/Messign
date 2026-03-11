import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUsersStore } from '@/stores/usersStore';
import { useGameStore } from '@/stores/gameStore';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { MainContent } from './MainContent';
import { XPGainNotification } from '@/components/ui';
import { CommandSurface, useRecentPages } from '@/components/CommandSurface';
import { FloatingWidget } from '@/components/dora/FloatingWidget';
import { FloatingTimer } from '@/components/time/FloatingTimer';
import { toast } from 'sonner';
import { getSocket, onEmployeeAdded, onEmployeeUpdated, onEmployeeDeleted, onEmployeeBulkImport, onSocketError, offSocketError } from '@/lib/socket';

const PATH_TO_VIEW: Record<string, string> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/executive': 'executive',
  '/reports': 'reports',
  '/notifications': 'notifications',
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
  '/time': 'time',
  '/okr': 'okr',
  '/assets': 'assets',
  '/contracts': 'contracts',
};

function getViewFromPath(path: string): string {
  if (path.startsWith('/okr')) return 'okr';
  if (path.startsWith('/executive')) return 'executive';
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/notifications')) return 'notifications';
  if (path.startsWith('/crm')) return 'crm';
  if (path.startsWith('/marketing')) return 'marketing';
  if (path.startsWith('/recruitment')) return 'recruitment';
  if (path.startsWith('/support')) return 'support';
  if (path.startsWith('/time')) return 'time';
  if (path.startsWith('/assets')) return 'assets';
  if (path.startsWith('/contracts')) return 'contracts';
  if (path.startsWith('/finance')) return 'finance';
  if (path === '/reimbursements/invoices' || path.startsWith('/reimbursements/invoices/')) return 'invoices';
  if (path.startsWith('/reimbursements')) return 'reimbursements';
  if (path.startsWith('/knowledge-hub')) return 'knowledge';
  if (path.startsWith('/knowledge')) return 'knowledge';
  if (path === '/dora/game') return 'game';
  if (path.startsWith('/dora')) return 'dora';
  return PATH_TO_VIEW[path] ?? 'dashboard';
}

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  executive: 'Executive Dashboard',
  reports: 'Report Hub',
  notifications: 'Notifications',
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
  time: 'Time Tracking',
  okr: 'OKRs & Goals',
  assets: 'Assets',
  contracts: 'Contracts',
};

export function AppShell() {
  const location = useLocation();
  const { leftSidebarOpen, rightSidebarOpen, leftSidebarCollapsed, rightSidebarCollapsed, isMobile, setMobile, setView, currentView, commandSurfaceOpen, closeCommandSurface, toggleCommandSurface } = useUIStore();
  const { user, updateUser } = useAuthStore();
  const { recentPages, trackPage } = useRecentPages();

  // Global Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandSurface();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandSurface]);
  const { fetchChannels, addMessage, incrementChannelUnread } = useChatStore();
  const { fetchProjects, fetchTasks } = useProjectStore();
  const { fetchUsers, updateUserStatus } = useUsersStore();
  const { fetchBadges, fetchActivities, fetchLeaderboard, addActivity, addXPGain, showXPGain, lastXPGain } = useGameStore();

  // Sync URL to view + track recent pages
  useEffect(() => {
    const path = location.pathname;
    const view = getViewFromPath(path);
    if (view !== currentView) {
      setView(view as 'dashboard' | 'executive' | 'reports' | 'notifications' | 'dora' | 'game' | 'chat' | 'knowledge' | 'achievements' | 'team' | 'projects' | 'settings' | 'finance' | 'reimbursements' | 'invoices' | 'crm' | 'marketing' | 'recruitment' | 'support' | 'time' | 'okr' | 'assets' | 'contracts');
    }
    const label = VIEW_LABELS[view] ?? view;
    trackPage(path, label);
  }, [location.pathname]);

  // Initialize app data when user is present
  useEffect(() => {
    if (!user) return;
    if (user.id) fetchChannels(user.id);
    fetchProjects();
    fetchTasks();
    fetchUsers();
    fetchBadges();
    fetchActivities();
    fetchLeaderboard();
  }, [user?.id]);

  // Handle responsive layout
  useEffect(() => {
    const handleResize = () => {
      setMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setMobile]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();

    socket.on('message:new', (message: { userId?: string; channelId?: string; senderName?: string; content?: string }) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId && message.userId === currentUserId) return;
      addMessage(message as any);
      // Notify unread when message is in a channel we're not viewing
      const { activeChannelId, channels } = useChatStore.getState();
      const viewingThisChannel = activeChannelId === message.channelId;
      if (message.channelId && !viewingThisChannel) {
        incrementChannelUnread(message.channelId);
        const channelName = channels.find((c) => c.id === message.channelId)?.name ?? 'Chat';
        const from = message.senderName ?? 'Someone';
        const preview = typeof message.content === 'string' && message.content.length > 0
          ? message.content.slice(0, 80) + (message.content.length > 80 ? '…' : '')
          : 'New message';
        toast(`${from} in ${channelName}`, { description: preview });
        if (typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${from} in ${channelName}`, { body: preview });
        }
      }
    });

    socket.on('xp:gained', ({ amount }) => {
      addXPGain(amount);
    });

    socket.on('activity:new', (activity) => {
      addActivity(activity);
    });

    socket.on('user:status', ({ userId, status }) => {
      updateUserStatus(userId, status as any);
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
          role: (emp.role ?? currentUser.role) as 'admin' | 'manager' | 'member',
          ...(emp.phone !== undefined && { phone: emp.phone }),
          ...(emp.location !== undefined && { location: emp.location }),
        });
      }
    };

    socket.on('employee:updated', handleEmployeeUpdated);

    const handleSocketError = (err: { message?: string; code?: string; channelId?: string }) => {
      if (err.code === 'CHANNEL_NOT_FOUND') {
        toast.error('Channel not found. Refreshing channel list.');
        const uid = useAuthStore.getState().user?.id;
        if (uid) fetchChannels(uid);
      } else if (err.code === 'SEND_FAILED' || err.message) {
        toast.error(err.message ?? 'Something went wrong');
      }
    };
    onSocketError(handleSocketError);

    const unsubAdded = onEmployeeAdded(() => fetchUsers());
    const unsubUpdated = onEmployeeUpdated(() => fetchUsers());
    const unsubDeleted = onEmployeeDeleted(() => fetchUsers());
    const unsubBulkImport = onEmployeeBulkImport(() => fetchUsers());

    return () => {
      socket.off('message:new');
      socket.off('xp:gained');
      socket.off('activity:new');
      socket.off('user:status');
      socket.off('employee:updated', handleEmployeeUpdated);
      offSocketError(handleSocketError);
      unsubAdded();
      unsubUpdated();
      unsubDeleted();
      unsubBulkImport();
    };
  }, [updateUser]);

  return (
    <div className="h-screen flex bg-app overflow-hidden transition-colors duration-200">
      {/* Command Surface (Cmd+K) */}
      <CommandSurface
        open={commandSurfaceOpen}
        onClose={closeCommandSurface}
        recentPages={recentPages}
      />

      {/* MP Gain Notification */}
      <XPGainNotification amount={lastXPGain} show={showXPGain} />

      {/* Left Sidebar */}
      <div
        className={`
          ${!leftSidebarOpen ? 'w-0' : leftSidebarCollapsed ? 'w-16' : 'w-72'}
          ${isMobile ? 'absolute z-40 h-full' : 'relative'}
          transition-all duration-300 ease-in-out overflow-hidden
        `}
      >
        {leftSidebarOpen && <LeftSidebar collapsed={leftSidebarCollapsed} />}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <MainContent />
      </div>

      {/* Right Sidebar */}
      <div
        className={`
          ${!rightSidebarOpen ? 'w-0' : rightSidebarCollapsed ? 'w-12' : 'w-80'}
          ${isMobile ? 'absolute right-0 z-40 h-full' : 'relative'}
          transition-all duration-300 ease-in-out overflow-hidden
        `}
      >
        {rightSidebarOpen && <RightSidebar collapsed={rightSidebarCollapsed} />}
      </div>

      {/* Mobile overlay */}
      {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => {
            if (leftSidebarOpen) useUIStore.getState().toggleLeftSidebar();
            if (rightSidebarOpen) useUIStore.getState().toggleRightSidebar();
          }}
        />
      )}

      {/* Floating Dora Widget (global, persists across pages) */}
      {user && <FloatingTimer />}
      {user && <FloatingWidget />}
    </div>
  );
}
