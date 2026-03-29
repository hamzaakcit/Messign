import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Instagram,
  LayoutGrid,
  Mail,
  Megaphone,
  Plus,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardMetrics } from '@/lib/marketingApi';
import { ROUTES } from '@/lib/routes';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import { MarketingMetricChips } from '@/pages/marketing/components/MarketingMetricChips';

/** SparkBar destinations aligned with path segments (pipeline replaces legacy combined “board”). */
export type ViewMode = 'pipeline' | 'calendar' | 'builder' | 'intelligence';

interface SparkBarProps {
  metrics: DashboardMetrics | null;
  loading?: boolean;
  onCreateCampaign: () => void;
  onCreateContent: () => void;
  onCreateEmail: () => void;
  /** Marketing hub: open Lucy Instagram AI prompt modal */
  onInstagramDraftAi?: () => void;
  /** Open “New content” with Instagram channel preset */
  onCreateInstagramContent?: () => void;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function SparkBar({
  metrics,
  loading,
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
  const isPipeline = path === ROUTES.MARKETING_PIPELINE;
  const isCalendar = path === ROUTES.MARKETING_CALENDAR;
  const isIntel = path === ROUTES.MARKETING_INTELLIGENCE;
  const isLucy = path === ROUTES.MARKETING;

  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-3 sm:px-4 py-2 border-b ${marketingShell.borderSubtle} ${marketingShell.bgTop} shrink-0 sticky top-0 z-20 min-w-0`}
    >
      <MarketingMetricChips metrics={metrics} loading={loading} variant="strip" className="flex-1" />

      <div className="flex items-center gap-1 shrink-0 justify-end flex-wrap sm:justify-end w-full sm:w-auto">
        <button
          type="button"
          onClick={() => void navigate(ROUTES.MARKETING_PIPELINE)}
          title="Pipeline"
          className={cn(
            'p-2 rounded-lg transition-colors',
            isPipeline
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void navigate(ROUTES.MARKETING_CALENDAR)}
          title="Calendar"
          aria-pressed={isCalendar}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isCalendar
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <CalendarDays className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void navigate(ROUTES.MARKETING_INTELLIGENCE)}
          title="Competitor Intelligence"
          aria-pressed={isIntel}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isIntel
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <Radar className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-app-surface-tertiary mx-1" />

        <button
          type="button"
          onClick={() => void navigate(ROUTES.MARKETING)}
          title="Lucy — CMO copilot"
          aria-pressed={isLucy}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isLucy ? 'text-purple-300 bg-purple-500/15' : 'text-app-muted hover:text-purple-300 hover:bg-purple-500/15',
          )}
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen((o) => !o)}
            title="Create new"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {createOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCreateOpen(false)} />
              <div
                className={`absolute right-0 top-full mt-1 z-50 w-44 rounded-lg ${marketingShell.popoverMenu}`}
              >
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
    </div>
  );
}
