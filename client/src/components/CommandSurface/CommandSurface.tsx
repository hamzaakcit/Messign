import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Fuse from 'fuse.js';
import {
  Search,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Briefcase,
  BookOpen,
  Trophy,
  Users,
  Wallet,
  Settings,
  Shield,
  Sparkles,
  PlusCircle,
  Receipt,
  FileText,
  ListTodo,
  Clock,
  CreditCard,
  Building2,
  BarChart3,
  BookOpenCheck,
  LifeBuoy,
  Target,
  Megaphone,
  UserPlus,
  CheckCircle2,
  Package,
  FileSignature,
  Heart,
  Ticket,
  Mail,
  Swords,
  PanelRightOpen,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';
import { useFinanceStore, type FinanceView } from '@/stores/financeStore';
import { useDoraStore } from '@/stores/doraStore';
import type { RecentPage } from './useRecentPages';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { normalizeChannelList } from '@/lib/chatChannelUtils';
import { useMarketplaceProjectsQuery } from '@/hooks/useMarketplaceProjectsQuery';
import { PROJECTS_MISSION_EVENT, type ProjectsMissionDetail } from '@/lib/projectsMissionEvents';

type ItemType = 'navigate' | 'action' | 'dora';

/** After navigating to /chat, run this chat UI action */
export type ChatCommandAction = 'search' | 'duels' | 'dora' | 'channelCreate' | 'detail';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  keywords: string;
  type: ItemType;
  financeView?: string;
  chatAction?: ChatCommandAction;
  /** When set, switch to this channel (Cmd+K on /chat) */
  chatChannelId?: string;
  /** Open channel details on Files tab */
  chatOpenMediaTab?: boolean;
  /** Projects Mission Control actions (dispatched after navigate to /projects) */
  projectsMission?: ProjectsMissionDetail['action'];
  /** Focus task board on this project id */
  projectsFocusProjectId?: string;
}

const NAV_ITEMS: CommandItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', keywords: 'home overview', type: 'navigate' },
  { id: 'nav-executive', label: 'Executive Dashboard', icon: LayoutDashboard, path: '/executive', keywords: 'executive leadership overview kpis', type: 'navigate' },
  { id: 'nav-reports', label: 'Report Hub', icon: BarChart3, path: '/reports', keywords: 'reports analytics data charts', type: 'navigate' },
  { id: 'nav-dora', label: 'Dora', icon: Sparkles, path: '/dora', keywords: 'ai assistant chat bot', type: 'navigate' },
  { id: 'nav-dora-automations', label: 'Dora Automations', icon: Sparkles, path: '/dora/automations', keywords: 'automation policy builder autonomous', type: 'navigate' },
  { id: 'nav-dora-automation-log', label: 'Dora Automation Log', icon: Clock, path: '/dora/automations/log', keywords: 'automation log executions', type: 'navigate' },
  { id: 'nav-chat', label: 'Chat', icon: MessageSquare, path: '/chat', keywords: 'messages conversations', type: 'navigate' },
  { id: 'nav-projects', label: 'Projects', icon: Briefcase, path: '/projects', keywords: 'marketplace tasks bounties', type: 'navigate' },
  { id: 'nav-okr', label: 'OKRs & Goals', icon: CheckCircle2, path: '/okr', keywords: 'objectives key results goals progress', type: 'navigate' },
  { id: 'nav-knowledge', label: 'Knowledge Hub', icon: BookOpen, path: '/knowledge-hub', keywords: 'docs documents wiki', type: 'navigate' },
  { id: 'nav-achievements', label: 'Achievements', icon: Trophy, path: '/achievements', keywords: 'xp badges gamification', type: 'navigate' },
  { id: 'nav-team', label: 'Team Directory', icon: Users, path: '/team', keywords: 'people employees directory', type: 'navigate' },
  { id: 'nav-finance', label: 'Finance', icon: Wallet, path: '/finance', keywords: 'money budget expense', type: 'navigate' },
  { id: 'nav-finance-expenses', label: 'Finance > Expenses', icon: Receipt, path: '/finance', keywords: 'reimbursement claims spending', type: 'navigate', financeView: 'expenses' },
  { id: 'nav-finance-invoices', label: 'Finance > Invoices', icon: FileText, path: '/finance', keywords: 'bills billing', type: 'navigate', financeView: 'invoices' },
  { id: 'nav-finance-budgets', label: 'Finance > Budgets', icon: Wallet, path: '/finance', keywords: 'allocation spend limit', type: 'navigate', financeView: 'budgets' },
  { id: 'nav-finance-vendors', label: 'Finance > Vendors', icon: Building2, path: '/finance', keywords: 'suppliers partners', type: 'navigate', financeView: 'vendors' },
  { id: 'nav-finance-payments', label: 'Finance > Payments', icon: CreditCard, path: '/finance', keywords: 'pay transfer', type: 'navigate', financeView: 'payments' },
  { id: 'nav-finance-accounting', label: 'Finance > Accounting', icon: BookOpenCheck, path: '/finance', keywords: 'ledger journal', type: 'navigate', financeView: 'accounting' },
  { id: 'nav-finance-reports', label: 'Finance > Reports', icon: BarChart3, path: '/finance', keywords: 'analytics charts data', type: 'navigate', financeView: 'reports' },
  { id: 'nav-crm', label: 'Sales CRM', icon: Target, path: '/crm', keywords: 'sales deals pipeline contacts companies forecast', type: 'navigate' },
  { id: 'nav-marketing', label: 'Marketing', icon: Megaphone, path: '/marketing', keywords: 'campaigns content email leads', type: 'navigate' },
  { id: 'nav-marketing-campaigns', label: 'Marketing > Campaigns', icon: Megaphone, path: '/marketing/campaigns', keywords: 'campaign management', type: 'navigate' },
  { id: 'nav-marketing-builder', label: 'Marketing > Builder', icon: Mail, path: '/marketing/builder', keywords: 'email builder template', type: 'navigate' },
  { id: 'nav-recruitment', label: 'Recruitment', icon: UserPlus, path: ROUTES.RECRUITMENT, keywords: 'hiring jobs candidates interviews pipeline', type: 'navigate' },
  { id: 'nav-support', label: 'Support', icon: LifeBuoy, path: '/support', keywords: 'tickets help desk sla customer support', type: 'navigate' },
  { id: 'nav-assets', label: 'Assets', icon: Package, path: '/assets', keywords: 'equipment inventory hardware software', type: 'navigate' },
  { id: 'nav-contracts', label: 'Contracts', icon: FileSignature, path: '/contracts', keywords: 'agreements legal renewals', type: 'navigate' },
  { id: 'nav-culture', label: 'Culture', icon: Heart, path: '/culture', keywords: 'engagement pulse surveys wellness', type: 'navigate' },
  { id: 'nav-settings', label: 'Settings', icon: Settings, path: '/settings', keywords: 'preferences config profile theme', type: 'navigate' },
  { id: 'nav-admin', label: 'Admin', icon: Shield, path: '/admin', keywords: 'administration management employees', type: 'navigate' },
];

const ACTION_ITEMS: CommandItem[] = [
  { id: 'act-chat-search', label: 'Chat: Search messages', icon: Search, path: '/chat', keywords: 'chat search messages channel find', type: 'action', chatAction: 'search' },
  { id: 'act-chat-duels', label: 'Chat: Channel duels', icon: Swords, path: '/chat', keywords: 'chat duels rock paper scissors coin chamber rps', type: 'action', chatAction: 'duels' },
  { id: 'act-chat-dora', label: 'Chat: Dora assistant', icon: Sparkles, path: '/chat', keywords: 'chat dora ai sidebar assistant', type: 'action', chatAction: 'dora' },
  { id: 'act-chat-channel', label: 'Chat: New channel', icon: PlusCircle, path: '/chat', keywords: 'chat new channel create room', type: 'action', chatAction: 'channelCreate' },
  { id: 'act-chat-details', label: 'Chat: Channel details', icon: PanelRightOpen, path: '/chat', keywords: 'chat members pins files settings panel', type: 'action', chatAction: 'detail' },
  { id: 'act-expense', label: 'Create Expense', icon: PlusCircle, path: '/finance', keywords: 'new expense add claim reimbursement', type: 'action', financeView: 'expenses' },
  { id: 'act-invoice', label: 'New Invoice', icon: FileText, path: '/finance', keywords: 'create invoice bill', type: 'action', financeView: 'invoices' },
  { id: 'act-task', label: 'New Task', icon: ListTodo, path: '/projects', keywords: 'create task todo', type: 'action' },
  { id: 'act-campaign', label: 'New Campaign', icon: Megaphone, path: '/marketing/campaigns', keywords: 'create campaign marketing', type: 'action' },
  { id: 'act-ticket', label: 'Create Ticket', icon: Ticket, path: '/support', keywords: 'new ticket support request', type: 'action' },
  { id: 'act-job', label: 'Post Job', icon: UserPlus, path: ROUTES.RECRUITMENT, keywords: 'new job posting hire', type: 'action' },
  { id: 'act-dora', label: 'Ask Dora', icon: Sparkles, path: '/dora', keywords: 'ai question help assistant', type: 'action' },
];

/** Cmd+K when on /projects — also merged into Fuse index */
const PROJECTS_CMD_ITEMS: CommandItem[] = [
  {
    id: 'proj-mc-hub',
    label: 'Mission Control: Opportunity Hub',
    icon: Briefcase,
    keywords: 'projects marketplace opportunities hub',
    type: 'action',
    projectsMission: 'hub',
  },
  {
    id: 'proj-mc-tasks',
    label: 'Mission Control: Tasks board',
    icon: LayoutGrid,
    keywords: 'projects tasks kanban board mission',
    type: 'action',
    projectsMission: 'tasks',
  },
  {
    id: 'proj-mc-propose',
    label: 'Mission Control: Propose project',
    icon: PlusCircle,
    keywords: 'projects propose new marketplace',
    type: 'action',
    projectsMission: 'propose',
  },
  {
    id: 'proj-mc-create-task',
    label: 'Mission Control: Create task',
    icon: ListTodo,
    keywords: 'projects create task todo',
    type: 'action',
    projectsMission: 'create-task',
  },
  {
    id: 'proj-mc-optimize',
    label: 'Mission Control: Suggest optimization',
    icon: Sparkles,
    keywords: 'projects dora optimization bottlenecks',
    type: 'action',
    projectsMission: 'open-optimize',
  },
];

const ALL_ITEMS = [...NAV_ITEMS, ...ACTION_ITEMS, ...PROJECTS_CMD_ITEMS];

const TYPE_BADGES: Record<ItemType, string> = {
  navigate: 'Navigate',
  action: 'Action',
  dora: 'Ask Dora',
};

interface CommandSurfaceProps {
  open: boolean;
  onClose: () => void;
  recentPages: RecentPage[];
}

export function CommandSurface({ open, onClose, recentPages }: CommandSurfaceProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { data: marketplaceProjects = [] } = useMarketplaceProjectsQuery(user?.id);
  const { setActiveView } = useFinanceStore();
  const createSession = useDoraStore((s) => s.createSession);
  const setActiveSession = useDoraStore((s) => s.setActiveSession);
  const channelsRaw = useChatStore((s) => s.channels);
  const channels = useMemo(() => normalizeChannelList(channelsRaw), [channelsRaw]);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channelMedia = useChatStore((s) => s.channelMedia);
  const fetchMedia = useChatStore((s) => s.fetchMedia);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const fuse = useMemo(
    () =>
      new Fuse(ALL_ITEMS, {
        keys: ['label', 'keywords'],
        threshold: 0.4,
        includeScore: true,
      }),
    [],
  );

  const results = useMemo(() => {
    if (!query.trim()) return { nav: [], actions: ACTION_ITEMS, showRecent: true };

    const matches = fuse.search(query);
    const nav: CommandItem[] = [];
    const actions: CommandItem[] = [];

    for (const m of matches) {
      if (m.item.type === 'navigate') nav.push(m.item);
      else if (m.item.type === 'action') actions.push(m.item);
    }

    return { nav, actions, showRecent: false };
  }, [query, fuse]);

  const showDoraFallback = query.trim().length > 0;

  const flatItems = useMemo(() => {
    const items: { item: CommandItem | null; group: string; isDoraFallback?: boolean }[] = [];

    if (results.showRecent && recentPages.length > 0) {
      for (const rp of recentPages) {
        const found = NAV_ITEMS.find((n) => n.path === rp.path && !n.financeView);
        items.push({
          item: found ?? { id: `recent-${rp.path}`, label: rp.label, icon: Clock, path: rp.path, keywords: '', type: 'navigate' },
          group: 'Recent',
        });
      }
    }

    for (const it of results.nav) items.push({ item: it, group: 'Navigation' });
    for (const it of results.actions) items.push({ item: it, group: 'Quick Actions' });

    if (location.pathname.startsWith('/chat')) {
      const q = query.trim().toLowerCase();
      const chList = q
        ? channels.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.description?.toLowerCase().includes(q) ?? false),
          )
        : channels.slice(0, 12);
      for (const c of chList) {
        items.push({
          item: {
            id: `cmd-ch-${c.id}`,
            label: `#${c.name}`,
            icon: Hash,
            type: 'action',
            keywords: `channel ${c.name}`,
            chatChannelId: c.id,
          },
          group: 'Channels',
        });
      }
      const media = activeChannelId ? channelMedia[activeChannelId] ?? [] : [];
      const mediaList = q
        ? media.filter((m) => (m.name ?? '').toLowerCase().includes(q))
        : media.slice(0, 20);
      mediaList.forEach((m, idx) => {
        const name = m.name ?? 'File';
        items.push({
          item: {
            id: `cmd-file-${activeChannelId}-${idx}-${name}`,
            label: name,
            icon: FileText,
            type: 'action',
            keywords: `file attachment media ${name}`,
            chatOpenMediaTab: true,
          },
          group: 'Files in channel',
        });
      });
    }

    if (location.pathname.startsWith('/projects')) {
      const q = query.trim().toLowerCase();
      const active = marketplaceProjects.filter((p) => p.recruitment_status === 'active');
      const focusList = q
        ? active.filter((p) => p.name.toLowerCase().includes(q))
        : active.slice(0, 10);
      for (const p of focusList) {
        items.push({
          item: {
            id: `proj-focus-${p.id}`,
            label: `Focus tasks: ${p.name}`,
            icon: LayoutGrid,
            type: 'action',
            keywords: `project ${p.name} focus tasks mission`,
            projectsFocusProjectId: p.id,
          },
          group: 'Projects',
        });
      }
    }

    if (showDoraFallback) {
      items.push({
        item: { id: 'dora-fallback', label: `Ask Dora: "${query}"`, icon: Sparkles, path: '/dora', keywords: '', type: 'dora' },
        group: 'Dora',
        isDoraFallback: true,
      });
    }

    return items;
  }, [
    results,
    recentPages,
    showDoraFallback,
    query,
    location.pathname,
    channels,
    activeChannelId,
    channelMedia,
    marketplaceProjects,
  ]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (open && location.pathname.startsWith('/chat') && activeChannelId) {
      void fetchMedia(activeChannelId);
    }
  }, [open, location.pathname, activeChannelId, fetchMedia]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeItem = useCallback(
    (item: CommandItem | null, isDoraFallback?: boolean) => {
      if (!item) return;

      onClose();

      if (item.chatChannelId) {
        if (!location.pathname.startsWith('/chat')) navigate('/chat');
        window.setTimeout(() => {
          useChatStore.getState().setActiveChannel(item.chatChannelId!);
        }, 0);
        return;
      }

      if (item.chatOpenMediaTab) {
        if (!location.pathname.startsWith('/chat')) navigate('/chat');
        window.setTimeout(() => {
          const st = useChatStore.getState();
          st.setDetailTab('media');
          if (!st.detailPanelOpen) st.toggleDetailPanel();
        }, 0);
        return;
      }

      if (item.projectsFocusProjectId) {
        navigate({ pathname: '/projects', search: `tab=tasks&project=${encodeURIComponent(item.projectsFocusProjectId)}` }, { replace: true });
        return;
      }

      if (item.projectsMission) {
        const mission = item.projectsMission;
        if (mission === 'hub') {
          navigate({ pathname: '/projects', search: '' }, { replace: true });
          return;
        }
        if (mission === 'tasks') {
          navigate({ pathname: '/projects', search: 'tab=tasks' }, { replace: true });
          return;
        }
        if (mission === 'propose') {
          navigate({ pathname: '/projects', search: '' }, { replace: true });
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent(PROJECTS_MISSION_EVENT, { detail: { action: 'propose' } }));
          }, 0);
          return;
        }
        navigate({ pathname: '/projects', search: 'tab=tasks' }, { replace: true });
        window.setTimeout(() => {
          const detail: ProjectsMissionDetail =
            mission === 'create-task' ? { action: 'create-task' } : { action: 'open-optimize' };
          window.dispatchEvent(new CustomEvent(PROJECTS_MISSION_EVENT, { detail }));
        }, 0);
        return;
      }

      if (isDoraFallback || (item.type === 'dora' && item.id === 'dora-fallback')) {
        const session = createSession();
        setActiveSession(session.id);
        navigate('/dora');
        // Pre-fill handled by storing the query for Dora to pick up
        setTimeout(() => {
          const input = document.querySelector<HTMLTextAreaElement>('[data-dora-input]');
          if (input) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value',
            )?.set;
            nativeInputValueSetter?.call(input, query);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 300);
        return;
      }

      if (item.path) {
        navigate(item.path);
        if (item.financeView) {
          setActiveView(item.financeView as FinanceView);
        }
      }

      if (item.chatAction && item.path === '/chat') {
        window.setTimeout(() => {
          const chat = useChatStore.getState();
          switch (item.chatAction) {
            case 'search':
              chat.setSearchOpen(true);
              break;
            case 'duels':
              chat.setDuelHubOpen(true);
              break;
            case 'dora':
              if (!chat.doraPanelOpen) chat.toggleDoraPanel();
              break;
            case 'channelCreate':
              chat.setChannelCreateOpen(true);
              break;
            case 'detail':
              if (!chat.detailPanelOpen) chat.toggleDetailPanel();
              break;
            default:
              break;
          }
        }, 0);
      }
    },
    [navigate, onClose, setActiveView, createSession, setActiveSession, query, location.pathname],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flatItems[selectedIndex];
      if (entry) executeItem(entry.item, entry.isDoraFallback);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  let currentGroup = '';

  return (
    <div
      className="cmd-surface-overlay fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette: search, navigate, or ask Dora"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="cmd-surface-panel relative w-full max-w-[560px] mx-4 rounded-2xl border overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--app-sidebar)',
          borderColor: 'var(--app-border-strong)',
        }}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--app-border)' }}>
          <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--app-text-tertiary)' }} aria-hidden />
          <input
            data-testid="command-surface-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search anything, take action, or ask Dora..."
            className="flex-1 bg-transparent text-base outline-none"
            style={{ color: 'var(--app-text)', caretColor: 'var(--primary-500)' }}
            aria-label="Search command"
          />
          <kbd
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono select-none"
            style={{
              backgroundColor: 'var(--app-card)',
              color: 'var(--app-text-tertiary)',
              border: '1px solid var(--app-border)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-surface-results"
          role="region"
          aria-label="Command options"
          className="max-h-[360px] overflow-y-auto py-1"
        >
          {flatItems.length === 0 && !query && (
            <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--app-text-tertiary)' }}>
              Start typing to search pages, actions, or ask Dora...
            </div>
          )}

          {flatItems.length === 0 && query && (
            <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--app-text-tertiary)' }}>
              No results found
            </div>
          )}

          {flatItems.map((entry, idx) => {
            const item = entry.item;
            if (!item) return null;
            const Icon = item.icon;
            const showGroupHeader = entry.group !== currentGroup;
            if (showGroupHeader) currentGroup = entry.group;
            const isSelected = idx === selectedIndex;

            return (
              <div key={item.id}>
                {showGroupHeader && (
                  <div
                    className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--app-text-tertiary)' }}
                  >
                    {entry.group}
                  </div>
                )}
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => executeItem(item, entry.isDoraFallback)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-75',
                  )}
                  style={{
                    backgroundColor: isSelected ? 'var(--app-nav-active-bg)' : 'transparent',
                    color: isSelected ? 'var(--app-nav-active-text)' : 'var(--app-text-muted)',
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: 'var(--app-card)',
                      color: 'var(--app-text-tertiary)',
                      border: '1px solid var(--app-border)',
                    }}
                  >
                    {TYPE_BADGES[item.type]}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 border-t flex items-center gap-4 text-[11px]"
          style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-tertiary)' }}
        >
          <span>
            <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--app-card)', color: 'var(--app-text-tertiary)' }}>
              ↑↓
            </kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--app-card)', color: 'var(--app-text-tertiary)' }}>
              ↵
            </kbd>{' '}
            select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--app-card)', color: 'var(--app-text-tertiary)' }}>
              esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
