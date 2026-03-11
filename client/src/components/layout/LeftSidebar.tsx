import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Trophy,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Wallet,
  Briefcase,
  Megaphone,
  Clock3,
  Target,
  CheckCircle2,
  LifeBuoy,
  UserPlus,
  Package,
  FileSignature,
} from 'lucide-react';
import { PilotPlaneSVG } from '@/components/dora/DoraPilot';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useReimbursementContext } from '@/contexts/ReimbursementContext';
import { PersonalOverviewCard, PersonalOverviewDetailPanel } from '@/components/dashboard';
import { rankingStats, personalOverviewDetail } from '@/data/dashboard';
import { cn } from '@/lib/utils';
import { MessignLogoAnimated } from '@/components/ui';
import { KnowledgeHubIcon } from '@/components/knowledge-hub/icons';
import { API_ORIGIN } from '@/lib/api';
import { getAccessToken } from '@/lib/authToken';
import { onDoraInsightCounts } from '@/lib/socket';
import { DoraInsightCountBadge } from '@/components/dora/DoraInsightCountBadge';

const VIEW_TO_PATH: Record<string, string> = {
  dashboard: '/dashboard',
  dora: '/dora',
  chat: '/chat',
  knowledge: '/knowledge-hub',
  achievements: '/achievements',
  team: '/team',
  projects: '/projects',
  settings: '/settings',
  finance: '/finance',
  reimbursements: '/reimbursements',
  invoices: '/reimbursements/invoices',
  crm: '/crm',
  marketing: '/marketing',
  recruitment: '/recruitment',
  support: '/support',
  time: '/time',
  okr: '/okr',
  assets: '/assets',
  contracts: '/contracts',
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'dora', label: 'Dora', icon: null },
  { id: 'chat', label: 'Chat', icon: MessageSquare, showUnread: true },
  { id: 'projects', label: 'Project Marketplace', icon: Briefcase },
  { id: 'time', label: 'Time Tracking', icon: Clock3, badgeText: 'NEW' },
  { id: 'knowledge', label: 'Knowledge Hub', icon: LayoutDashboard },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'team', label: 'Team Directory', icon: Users },
  { id: 'finance', label: 'Finance', icon: Wallet, showReimbBadge: true },
  { id: 'crm', label: 'Sales CRM', icon: Target },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, badgeText: 'NEW' },
  { id: 'recruitment', label: 'Recruitment', icon: UserPlus, badgeText: 'NEW' },
  { id: 'assets', label: 'Assets', icon: Package, badgeText: 'NEW' },
  { id: 'contracts', label: 'Contracts', icon: FileSignature, badgeText: 'NEW' },
  { id: 'support', label: 'Support', icon: LifeBuoy, badgeText: 'NEW' },
  { id: 'okr', label: 'OKRs & Goals', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface LeftSidebarProps {
  collapsed?: boolean;
}

export function LeftSidebar({ collapsed = false }: LeftSidebarProps) {
  const navigate = useNavigate();
  const { currentView, setView, toggleLeftSidebar, isMobile } = useUIStore();
  const { user, isAdmin, logout } = useAuthStore();
  const { channels } = useChatStore();
  const reimbContext = useReimbursementContext();
  const [personalDetailOpen, setPersonalDetailOpen] = useState(false);
  const [insightCounts, setInsightCounts] = useState<Record<string, number>>({});
  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  if (!user) return null;

  const handleNavClick = (viewId: string) => {
    setView(viewId as any);
    const path = VIEW_TO_PATH[viewId];
    if (path) navigate(path);
  };

  useEffect(() => {
    if (!user) return;

    const userId = user.authUserId || user.id;
    if (!userId) return;

    const controller = new AbortController();

    const fetchCounts = async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        };
        const token = getAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(`${API_ORIGIN}/api/dora/insights/counts`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setInsightCounts(data?.counts ?? {});
      } catch {
        if (!controller.signal.aborted) {
          setInsightCounts({});
        }
      }
    };

    void fetchCounts();
    const unsubscribe = onDoraInsightCounts(() => {
      void fetchCounts();
    });

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [user?.id, user?.authUserId]);

  return (
    <div
      className={cn(
        'h-full bg-app-sidebar border-r border-app flex flex-col transition-colors duration-200 transition-all duration-300 ease-in-out',
        collapsed && 'items-center'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'p-4 border-b border-app flex items-center gap-2 transition-all duration-300 ease-in-out',
          collapsed ? 'justify-center px-2' : 'justify-between'
        )}
      >
        <div className={cn('flex items-center min-w-0 gap-2.5', collapsed && 'justify-center')}>
          <MessignLogoAnimated
            size={collapsed ? 32 : 48}
            autoPlay
            loop
            loopDelay={6000}
            playOnHover
            className="shrink-0"
          />
          {!collapsed && (
            <span className="font-semibold text-app text-lg truncate transition-opacity duration-300">
              Messign Workspace
            </span>
          )}
        </div>
        {isMobile && !collapsed && (
          <button
            onClick={toggleLeftSidebar}
            className="p-1 rounded-lg text-app-muted hover:text-app hover:bg-app-hover"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Personal Overview - hidden when collapsed */}
      {!collapsed && (
        <div className="px-2 py-2 border-b border-app transition-all duration-300 ease-in-out">
          <PersonalOverviewCard user={user} onClick={() => setPersonalDetailOpen(true)} />
        </div>
      )}

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 py-2 space-y-1 overflow-y-auto transition-all duration-300 ease-in-out',
          collapsed ? 'px-2 w-full flex flex-col items-center' : 'px-3'
        )}
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const unread = 'showUnread' in item && item.showUnread && totalUnread > 0 ? totalUnread : 0;
          const reimbBadge = 'showReimbBadge' in item && item.showReimbBadge && reimbContext ? reimbContext.myPendingCount : 0;
          const insightBadge =
            item.id === 'finance'
              ? insightCounts.finance ?? 0
              : item.id === 'crm'
                ? (insightCounts.sales ?? insightCounts.crm ?? 0)
                : item.id === 'marketing'
                  ? insightCounts.marketing ?? 0
                : item.id === 'recruitment'
                  ? insightCounts.recruitment ?? 0
                : item.id === 'assets'
                  ? insightCounts.assets ?? 0
                : item.id === 'contracts'
                  ? insightCounts.contracts ?? 0
                : item.id === 'support'
                  ? insightCounts.support ?? 0
                  : item.id === 'time'
                    ? insightCounts.time ?? 0
                  : 0;
          const badge = unread > 0 ? unread : reimbBadge;
          const badgeText = 'badgeText' in item ? item.badgeText : undefined;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                'w-full flex items-center rounded-lg transition-all duration-200',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                currentView === item.id
                  ? 'bg-app-hover text-app border-l-2 border-primary-500'
                  : 'text-app-muted hover:text-app hover:bg-app-hover',
                collapsed && 'border-l-0'
              )}
              aria-current={currentView === item.id ? 'page' : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              {item.id === 'knowledge' ? (
                <KnowledgeHubIcon size={20} active={currentView === 'knowledge'} className="flex-shrink-0" />
              ) : item.id === 'dora' ? (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{
                    filter: currentView === 'dora'
                      ? 'drop-shadow(0 0 6px rgba(0,217,213,0.7)) drop-shadow(0 0 12px rgba(59,130,246,0.4))'
                      : 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))',
                    transition: 'filter 0.3s ease',
                  }}>
                    <PilotPlaneSVG size={20} showGoggleGlint={currentView === 'dora'} />
                  </div>
                  {/* Ground glow */}
                  <div style={{
                    position: 'absolute',
                    bottom: -2,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 14,
                    height: 4,
                    borderRadius: '50%',
                    background: currentView === 'dora'
                      ? 'radial-gradient(ellipse, rgba(0,217,213,0.5) 0%, transparent 70%)'
                      : 'radial-gradient(ellipse, rgba(0,217,213,0.15) 0%, transparent 70%)',
                    filter: 'blur(1px)',
                    transition: 'background 0.3s ease',
                  }} />
                </div>
              ) : item.icon ? (
                <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden />
              ) : null}
              {!collapsed && (
                <>
                  <span className="font-medium flex-1 text-left">{item.label}</span>
                  {badgeText && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-300 text-[10px] font-semibold tracking-wide">
                      {badgeText}
                    </span>
                  )}
                  <DoraInsightCountBadge count={insightBadge} />
                  {badge > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-medium">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}

        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              'w-full flex items-center rounded-lg transition-all duration-200 text-app-muted hover:text-app hover:bg-app-hover',
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            )}
            aria-label="Open admin panel"
            title="Admin"
          >
            <Shield className="w-5 h-5 flex-shrink-0" aria-hidden />
            {!collapsed && <span className="font-medium flex-1 text-left">Admin</span>}
          </Link>
        )}
      </nav>

      {/* Log out + Collapse toggle */}
      <div className={cn('p-3 border-t border-app', collapsed && 'w-full flex flex-col items-center gap-1')}>
        {!isMobile && (
          <button
            onClick={toggleLeftSidebar}
            className={cn(
              'rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors',
              collapsed ? 'p-2' : 'p-1.5'
            )}
            aria-label={collapsed ? 'Expand left sidebar' : 'Collapse left sidebar'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        )}
        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center rounded-lg text-app-muted hover:text-danger-500 hover:bg-danger-500/10 transition-all duration-200',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
          )}
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-5 h-5" aria-hidden />
          {!collapsed && <span className="font-medium">Log out</span>}
        </button>
      </div>

      <PersonalOverviewDetailPanel
        user={user}
        detail={personalOverviewDetail}
        rankingStats={rankingStats}
        isOpen={personalDetailOpen}
        onClose={() => setPersonalDetailOpen(false)}
      />
    </div>
  );
}
