import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  FlaskConical,
  Instagram,
  LayoutGrid,
  Mail,
  Megaphone,
  Plus,
  Radar,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import { useMarketingContext } from '@/pages/marketing/MarketingContext';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  path: string;
  /** If set, this tab is a Command Center column route. */
  group?: 'cc';
}

const PRIMARY_TABS: TabDef[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid, path: ROUTES.MARKETING_PIPELINE },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, path: ROUTES.MARKETING_CALENDAR },
  { id: 'builder', label: 'Builder', icon: Mail, path: ROUTES.MARKETING_BUILDER },
  { id: 'intelligence', label: 'Intel', icon: Radar, path: ROUTES.MARKETING_INTELLIGENCE },
];

const CC_TABS: TabDef[] = [
  { id: 'brand-social', label: 'Brand & Social', icon: Share2, path: ROUTES.MARKETING_BRAND_SOCIAL, group: 'cc' },
  { id: 'funnel', label: 'Funnel', icon: Workflow, path: ROUTES.MARKETING_FUNNEL, group: 'cc' },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical, path: ROUTES.MARKETING_EXPERIMENTS, group: 'cc' },
  { id: 'sandbox', label: 'Sandbox', icon: Sparkles, path: ROUTES.MARKETING_SANDBOX, group: 'cc' },
];

const ALL_TABS = [...PRIMARY_TABS, ...CC_TABS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  return p.replace(/\/$/, '') || '/';
}

function getActiveTabId(pathname: string): string | null {
  const p = normalizePath(pathname);
  // /marketing/content shares pipeline's tab
  if (p === ROUTES.MARKETING_CONTENT) return 'pipeline';
  const match = ALL_TABS.find((t) => normalizePath(t.path) === p);
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceTopBar(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const ctx = useMarketingContext();

  const [createOpen, setCreateOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);

  const activeTab = getActiveTabId(location.pathname);
  const isActiveCc = CC_TABS.some((t) => t.id === activeTab);
  const activeCcLabel = CC_TABS.find((t) => t.id === activeTab)?.label;

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 sm:px-3 py-1.5 shrink-0 z-20 min-w-0',
        'border-b bg-app-surface-tertiary/40 backdrop-blur-sm',
        marketingShell.borderSubtle,
      )}
    >
      {/* ← Lucy home */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.MARKETING)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-purple-300 hover:bg-purple-500/10 transition-colors shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Lucy</span>
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-1 shrink-0" />

      {/* Primary tabs */}
      <nav className="flex items-center gap-0.5 overflow-x-auto min-w-0" aria-label="Marketing workspace">
        {PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-primary-500/15 text-primary-300'
                  : 'text-app-muted hover:text-app-text hover:bg-white/[0.04]',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {active && (
                <span className="absolute -bottom-[7px] left-2 right-2 h-0.5 rounded-full bg-primary-400" />
              )}
            </button>
          );
        })}

        {/* Command Center dropdown trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setCcOpen((o) => !o)}
            className={cn(
              'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
              isActiveCc
                ? 'bg-primary-500/15 text-primary-300'
                : 'text-app-muted hover:text-app-text hover:bg-white/[0.04]',
            )}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>{activeCcLabel ?? 'Command Center'}</span>
            <ChevronDown className={cn('w-3 h-3 opacity-60 transition-transform', ccOpen && 'rotate-180')} />
            {isActiveCc && (
              <span className="absolute -bottom-[7px] left-2 right-2 h-0.5 rounded-full bg-primary-400" />
            )}
          </button>

          {ccOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCcOpen(false)} />
              <div className={`absolute left-0 top-full mt-1 z-50 w-48 rounded-lg ${marketingShell.popoverMenu}`}>
                {CC_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        navigate(tab.path);
                        setCcOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors',
                        active
                          ? 'text-primary-300 bg-primary-500/10'
                          : 'text-app-text hover:bg-app-nav-hover',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5 text-app-muted" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Create dropdown */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          title="Create new"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary-500/90 text-white hover:bg-primary-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {createOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} />
            <div className={`absolute right-0 top-full mt-1 z-50 w-44 rounded-lg ${marketingShell.popoverMenu}`}>
              <button
                type="button"
                onClick={() => { ctx.openCreateCampaign(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Megaphone className="w-3.5 h-3.5 text-app-muted" /> Campaign
              </button>
              <button
                type="button"
                onClick={() => { ctx.openCreateContent('default'); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Target className="w-3.5 h-3.5 text-app-muted" /> Content
              </button>
              <button
                type="button"
                onClick={() => { ctx.handleInstagramDraftAi(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-300" /> Instagram (AI)
              </button>
              <button
                type="button"
                onClick={() => { ctx.handleCreateInstagramContent(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-300/80" /> Instagram content
              </button>
              <button
                type="button"
                onClick={() => { navigate(ROUTES.MARKETING_BUILDER); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Mail className="w-3.5 h-3.5 text-app-muted" /> Email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
