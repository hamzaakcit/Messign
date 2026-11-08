import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isNavItemOnSurface } from '@/lib/productSurface';
import {
  LayoutDashboard,
  MessageSquare,
  Trophy,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  Wallet,
  Briefcase,
  Target,
  CheckCircle2,
  LifeBuoy,
  UserPlus,
  Package,
  FileSignature,
  Heart,
  Pin,
  PinOff,
  type LucideIcon,
} from 'lucide-react';
import { PilotPlaneSVG } from '@/components/dora/DoraPilot';
import { LucyPilotSVG } from '@/pages/marketing/components/lucy';
import { useUIStore, type View } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useReimbursementContext } from '@/contexts/ReimbursementContext';
import { PersonalOverviewDetailPanel } from '@/components/dashboard';
import { rankingStats, personalOverviewDetail } from '@/data/dashboard';
import { cn } from '@/lib/utils';
import { MessignLogoAnimated } from '@/components/ui';
import { KnowledgeHubIcon } from '@/components/knowledge-hub/icons';
import { API_ORIGIN } from '@/lib/api';
import { getAccessToken } from '@/lib/authToken';
import { onDoraInsightCounts } from '@/lib/socket';
import { DoraInsightCountBadge } from '@/components/dora/DoraInsightCountBadge';
import { ROUTES } from '@/lib/routes';

const VIEW_TO_PATH: Record<string, string> = {
  dashboard: '/dashboard',
  executive: '/executive',
  reports: '/reports',
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
  recruitment: ROUTES.RECRUITMENT,
  support: '/support',
  okr: '/okr',
  assets: '/assets',
  contracts: '/contracts',
  culture: '/culture',
};

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon | null;
  showUnread?: boolean;
  showReimbBadge?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    key: 'core',
    label: 'Core',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'executive', label: 'Executive', icon: LayoutDashboard },
      { id: 'dora', label: 'Dora', icon: null },
      { id: 'chat', label: 'Chat', icon: MessageSquare, showUnread: true },
    ],
  },
  {
    key: 'work',
    label: 'Work',
    items: [
      { id: 'projects', label: 'Projects', icon: Briefcase },
      { id: 'okr', label: 'OKRs & Goals', icon: CheckCircle2 },
    ],
  },
  {
    key: 'business',
    label: 'Business',
    items: [
      { id: 'finance', label: 'Finance', icon: Wallet, showReimbBadge: true },
      { id: 'crm', label: 'Sales CRM', icon: Target },
      { id: 'marketing', label: 'Marketing', icon: null },
      { id: 'recruitment', label: 'Recruitment', icon: UserPlus },
      { id: 'support', label: 'Support', icon: LifeBuoy },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    items: [
      { id: 'knowledge', label: 'Knowledge Hub', icon: null },
      { id: 'assets', label: 'Assets', icon: Package },
      { id: 'contracts', label: 'Contracts', icon: FileSignature },
      { id: 'culture', label: 'Culture', icon: Heart },
    ],
  },
  {
    key: 'system',
    label: 'System',
    items: [
      { id: 'team', label: 'Team Directory', icon: Users },
      { id: 'achievements', label: 'Achievements', icon: Trophy },
      { id: 'reports', label: 'Reports', icon: FileSignature },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const NAV_GROUPS: NavGroup[] = ALL_NAV_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => isNavItemOnSurface(item.id)) }))
  .filter((group) => group.items.length > 0);

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Only ids that exist in the current nav (drops removed modules e.g. legacy `time` from localStorage). */
const VALID_PINNABLE_IDS = new Set(ALL_NAV_ITEMS.map((n) => n.id));

const PINNED_KEY = 'pinned-nav';
const COLLAPSED_GROUPS_KEY = 'sidebar-collapsed-groups';

function getPinnedItems(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    const filtered = ids.filter((id) => VALID_PINNABLE_IDS.has(id));
    if (filtered.length !== ids.length) savePinnedItems(filtered);
    return filtered;
  } catch {
    return [];
  }
}

function savePinnedItems(ids: string[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

function getCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCollapsedGroups(keys: string[]): void {
  localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(keys));
}

function getInsightBadge(id: string, counts: Record<string, number>): number {
  switch (id) {
    case 'finance': return counts.finance ?? 0;
    case 'crm': return counts.sales ?? counts.crm ?? 0;
    case 'marketing': return counts.marketing ?? 0;
    case 'recruitment': return counts.recruitment ?? 0;
    case 'assets': return counts.assets ?? 0;
    case 'contracts': return counts.contracts ?? 0;
    case 'support': return counts.support ?? 0;
    default: return 0;
  }
}

interface LeftSidebarProps {
  collapsed?: boolean;
}

export function LeftSidebar({ collapsed = false }: LeftSidebarProps) {
  const navigate = useNavigate();
  const currentView = useUIStore((s) => s.currentView);
  const setView = useUIStore((s) => s.setView);
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const isMobile = useUIStore((s) => s.isMobile);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  const channels = useChatStore((s) => s.channels);
  const safeChannels = Array.isArray(channels) ? channels : [];
  const reimbContext = useReimbursementContext();
  const [personalDetailOpen, setPersonalDetailOpen] = useState(false);
  const [insightCounts, setInsightCounts] = useState<Record<string, number>>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>(getPinnedItems);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>(getCollapsedGroups);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalUnread = safeChannels.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const isExpanded = !collapsed || hoverExpanded;

  const handleNavClick = useCallback((viewId: string) => {
    setView(viewId as View);
    const path = VIEW_TO_PATH[viewId];
    if (path) navigate(path);
    if (isMobile) toggleLeftSidebar();
  }, [setView, navigate, isMobile, toggleLeftSidebar]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(-5);
      savePinnedItems(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!collapsed || isMobile) return;
    hoverTimer.current = setTimeout(() => setHoverExpanded(true), 200);
  }, [collapsed, isMobile]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverExpanded(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.authUserId || user.id;
    if (!userId) return;

    const controller = new AbortController();
    const fetchCounts = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-User-Id': userId };
        const token = getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_ORIGIN}/api/dora/insights/counts`, {
          credentials: 'include', headers, signal: controller.signal,
        });
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setInsightCounts(data?.counts ?? {});
      } catch {
        if (!controller.signal.aborted) setInsightCounts({});
      }
    };
    void fetchCounts();
    const unsubscribe = onDoraInsightCounts(() => void fetchCounts());
    return () => { controller.abort(); unsubscribe(); };
  }, [user?.id, user?.authUserId]);

  if (!user) return null;

  const pinnedItems = pinnedIds
    .map((id) => ALL_NAV_ITEMS.find((n) => n.id === id))
    .filter((n): n is NavItem => !!n);

  const renderNavButton = (navItem: NavItem, showPinAction: boolean) => {
    const unread = navItem.showUnread && totalUnread > 0 ? totalUnread : 0;
    const reimbBadge = navItem.showReimbBadge && reimbContext ? reimbContext.myPendingCount : 0;
    const badge = unread > 0 ? unread : reimbBadge;
    const insightBadge = getInsightBadge(navItem.id, insightCounts);
    const isPinned = pinnedIds.includes(navItem.id);

    return (
      <div key={navItem.id} className="group/item relative flex items-center">
        <button
          data-testid={
            navItem.id === 'dora'
              ? 'onboarding-dora-nav'
              : navItem.id === 'chat'
                ? 'onboarding-chat-nav'
                : `nav-${navItem.id}`
          }
          onClick={() => handleNavClick(navItem.id)}
          className={cn(
            'w-full flex items-center rounded-lg transition-all duration-150',
            isExpanded ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2',
            currentView === navItem.id
              ? 'bg-app-hover text-app border-l-2 border-primary-500'
              : 'text-app-muted hover:text-app hover:bg-app-hover',
            !isExpanded && 'border-l-0',
          )}
          aria-current={currentView === navItem.id ? 'page' : undefined}
          aria-label={!isExpanded ? navItem.label : undefined}
          title={!isExpanded ? navItem.label : undefined}
        >
          {navItem.id === 'knowledge' ? (
            <KnowledgeHubIcon size={18} active={currentView === 'knowledge'} className="flex-shrink-0" />
          ) : navItem.id === 'dora' ? (
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div style={{
                filter: currentView === 'dora'
                  ? 'drop-shadow(0 0 6px rgba(0,217,213,0.7)) drop-shadow(0 0 12px rgba(59,130,246,0.4))'
                  : 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))',
                transition: 'filter 0.3s ease',
              }}>
                <PilotPlaneSVG size={18} showGoggleGlint={currentView === 'dora'} />
              </div>
            </div>
          ) : navItem.id === 'marketing' ? (
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div
                style={{
                  filter:
                    currentView === 'marketing'
                      ? 'drop-shadow(0 0 6px rgba(168,85,247,0.7)) drop-shadow(0 0 12px rgba(192,38,211,0.4))'
                      : 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))',
                  transition: 'filter 0.3s ease',
                }}
              >
                <LucyPilotSVG size={18} />
              </div>
            </div>
          ) : navItem.icon ? (
            <navItem.icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden />
          ) : null}
          {isExpanded && (
            <>
              <span className="text-sm font-medium flex-1 text-left truncate">{navItem.label}</span>
              <DoraInsightCountBadge count={insightBadge} />
              {badge > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-app-text text-[10px] font-medium">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </>
          )}
        </button>
        {isExpanded && showPinAction && (
          <button
            onClick={() => togglePin(navItem.id)}
            className="absolute right-1 opacity-0 group-hover/item:opacity-100 p-1 rounded text-app-muted hover:text-app transition-opacity"
            aria-label={isPinned ? `Unpin ${navItem.label}` : `Pin ${navItem.label}`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'h-full bg-app-sidebar border-r border-app flex flex-col transition-all duration-200 ease-out',
        collapsed && !hoverExpanded && 'items-center',
        collapsed && hoverExpanded && 'absolute z-50 w-60 shadow-2xl shadow-black/50',
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'p-3 border-b border-app flex items-center gap-2 transition-all duration-200 ease-out',
          !isExpanded ? 'justify-center px-2' : 'justify-between',
        )}
      >
        <div className={cn('flex items-center min-w-0 gap-2', !isExpanded && 'justify-center')}>
          <MessignLogoAnimated
            size={isExpanded ? 32 : 28}
            autoPlay
            loop
            loopDelay={6000}
            playOnHover
            className="shrink-0"
          />
          {isExpanded && (
            <span className="font-semibold text-app text-sm truncate">
              Messign
            </span>
          )}
        </div>
        {isMobile && isExpanded && (
          <button
            onClick={toggleLeftSidebar}
            className="p-1 rounded-lg text-app-muted hover:text-app hover:bg-app-hover"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Pinned Favorites */}
      {pinnedItems.length > 0 && (
        <div className={cn('py-1.5 border-b border-app', isExpanded ? 'px-2' : 'px-1.5 flex flex-col items-center')}>
          {isExpanded && (
            <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-app-muted/60 font-medium">
              Pinned
            </div>
          )}
          <div className="space-y-0.5">
            {pinnedItems.map((item) => renderNavButton(item, true))}
          </div>
        </div>
      )}

      {/* Grouped Navigation */}
      <nav
        data-testid="onboarding-sidebar"
        className={cn(
          'flex-1 py-1.5 overflow-y-auto custom-scrollbar',
          isExpanded ? 'px-2' : 'px-1.5 flex flex-col items-center',
        )}
        aria-label="Main navigation"
      >
        {NAV_GROUPS.map((group) => {
          const isGroupCollapsed = collapsedGroupKeys.includes(group.key);
          const hasActiveItem = group.items.some((i) => i.id === currentView);

          if (!isExpanded) {
            return (
              <div key={group.key} className="space-y-0.5 mb-2 w-full">
                {group.items.map((item) => renderNavButton(item, false))}
              </div>
            );
          }

          return (
            <div key={group.key} className="mb-1">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-1 px-1 py-1 text-[10px] uppercase tracking-widest text-app-muted/60 font-medium hover:text-app-muted transition-colors"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', isGroupCollapsed && '-rotate-90')} />
                <span>{group.label}</span>
                {isGroupCollapsed && hasActiveItem && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
                )}
              </button>
              {!isGroupCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => renderNavButton(item, true))}
                </div>
              )}
            </div>
          );
        })}

        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              'w-full flex items-center rounded-lg transition-all duration-150 text-app-muted hover:text-app hover:bg-app-hover',
              isExpanded ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2',
            )}
            aria-label="Open admin panel"
            title="Admin"
          >
            <Shield className="w-[18px] h-[18px] flex-shrink-0" aria-hidden />
            {isExpanded && <span className="text-sm font-medium flex-1 text-left">Admin</span>}
          </Link>
        )}
      </nav>

      {/* Footer: avatar + collapse + logout */}
      <div className={cn(
        'border-t border-app p-2',
        !isExpanded && 'flex flex-col items-center gap-1',
        isExpanded && 'flex items-center gap-1',
      )}>
        {/* Avatar button */}
        <button
          onClick={() => setPersonalDetailOpen(true)}
          className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          aria-label="View profile"
          title={user.name ?? 'Profile'}
        >
          {user.avatar ? (
            <img src={user.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-medium">
              {(user.name ?? '?')[0].toUpperCase()}
            </div>
          )}
        </button>

        {isExpanded && (
          <span className="flex-1 text-xs text-app-muted truncate">{user.name}</span>
        )}

        {!isMobile && (
          <button
            onClick={toggleLeftSidebar}
            className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}

        <button
          data-testid="sidebar-logout"
          onClick={logout}
          className="p-1.5 rounded-lg text-app-muted hover:text-danger-500 hover:bg-danger-500/10 transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-4 h-4" aria-hidden />
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
