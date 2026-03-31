import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
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
import type { DashboardMetrics } from '@/lib/marketingApi';
import { ROUTES } from '@/lib/routes';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';

/** SparkBar destinations aligned with path segments. */
export type ViewMode = 'pipeline' | 'calendar' | 'builder' | 'intelligence';

interface SparkBarProps {
  metrics: DashboardMetrics | null;
  loading?: boolean;
  onCreateCampaign: () => void;
  onCreateContent: () => void;
  onCreateEmail: () => void;
  /** Marketing hub: open Lucy Instagram AI prompt modal */
  onInstagramDraftAi?: () => void;
  /** Open "New content" with Instagram channel preset */
  onCreateInstagramContent?: () => void;
}

/** Navigation items for the workspace SparkBar. */
const NAV_ITEMS: {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string[];
  group: 'tools' | 'command-center';
}[] = [
  { label: 'Pipeline', path: ROUTES.MARKETING_PIPELINE, icon: LayoutGrid, match: ['pipeline', 'content'], group: 'tools' },
  { label: 'Calendar', path: ROUTES.MARKETING_CALENDAR, icon: CalendarDays, match: ['calendar'], group: 'tools' },
  { label: 'Builder', path: ROUTES.MARKETING_BUILDER, icon: Mail, match: ['builder'], group: 'tools' },
  { label: 'Intel', path: ROUTES.MARKETING_INTELLIGENCE, icon: Radar, match: ['intelligence'], group: 'tools' },
  { label: 'Brand & Social', path: ROUTES.MARKETING_BRAND_SOCIAL, icon: Share2, match: ['brand-social'], group: 'command-center' },
  { label: 'Funnel', path: ROUTES.MARKETING_FUNNEL, icon: Workflow, match: ['funnel'], group: 'command-center' },
  { label: 'Experiments', path: ROUTES.MARKETING_EXPERIMENTS, icon: FlaskConical, match: ['experiments'], group: 'command-center' },
  { label: 'Sandbox', path: ROUTES.MARKETING_SANDBOX, icon: Sparkles, match: ['sandbox'], group: 'command-center' },
];

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

/**
 * Redesigned SparkBar — contextual workspace navigation.
 *
 * Changes from the old design:
 * - **Labeled tabs** with active pill states instead of icon-only buttons
 * - **Grouped**: Tools (Pipeline, Calendar, Builder, Intel) | Command Center (Brand, Funnel, Experiments, Sandbox)
 * - **Hub link** back to Lucy as a clear escape hatch
 * - **Compact create dropdown** — no metrics in the bar (metrics stay in page content / hub)
 * - **Slimmer height** — single row, no metric chips hogging cognitive space
 */
export function SparkBar({
  onCreateCampaign,
  onCreateContent,
  onCreateEmail,
  onInstagramDraftAi,
  onCreateInstagramContent,
}: SparkBarProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  const path = normalizePath(location.pathname);
  const activeSegment = path.split('/').filter(Boolean)[1] || '';

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 border-b shrink-0 sticky top-0 z-20 min-w-0',
        marketingShell.borderSubtle,
        'bg-gradient-to-r from-app via-app to-slate-950/80',
      )}
    >
      {/* Hub link — escape hatch back to Lucy */}
      <button
        type="button"
        onClick={() => void navigate(ROUTES.MARKETING)}
        title="Back to Lucy Hub"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-300/90 hover:text-purple-200 hover:bg-purple-500/10 transition-colors shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Hub</span>
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-0.5 shrink-0" />

      {/* Navigation tabs */}
      <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 flex-1" aria-label="Marketing workspace navigation">
        {NAV_ITEMS.map((item, idx) => {
          const isActive = item.match.includes(activeSegment);
          const Icon = item.icon;

          // Insert separator between groups
          const prevItem = NAV_ITEMS[idx - 1];
          const showSeparator = prevItem && prevItem.group !== item.group;

          return (
            <div key={item.path} className="flex items-center shrink-0">
              {showSeparator && (
                <div className="w-px h-4 bg-white/[0.06] mx-1" />
              )}
              <button
                type="button"
                onClick={() => void navigate(item.path)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/5 ring-1 ring-primary-500/20'
                    : 'text-app-muted hover:text-app-text hover:bg-white/[0.04]',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-primary-400' : '')} />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Create dropdown */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          title="Create new"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary-500/90 text-white hover:bg-primary-500 transition-colors shadow-sm"
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
                onClick={() => { onCreateCampaign(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Megaphone className="w-3.5 h-3.5 text-app-muted" /> Campaign
              </button>
              <button
                type="button"
                onClick={() => { onCreateContent(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Target className="w-3.5 h-3.5 text-app-muted" /> Content
              </button>
              {onInstagramDraftAi && (
                <button
                  type="button"
                  onClick={() => { onInstagramDraftAi(); setCreateOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
                >
                  <Instagram className="w-3.5 h-3.5 text-pink-300" /> Instagram (AI)
                </button>
              )}
              {onCreateInstagramContent && (
                <button
                  type="button"
                  onClick={() => { onCreateInstagramContent(); setCreateOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
                >
                  <Instagram className="w-3.5 h-3.5 text-pink-300/80" /> Instagram content
                </button>
              )}
              <button
                type="button"
                onClick={() => { onCreateEmail(); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <Mail className="w-3.5 h-3.5 text-app-muted" /> Email
              </button>
              <button
                type="button"
                onClick={() => { void navigate(ROUTES.MARKETING_BUILDER); setCreateOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
              >
                <TrendingUp className="w-3.5 h-3.5 text-app-muted" /> Builder
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
