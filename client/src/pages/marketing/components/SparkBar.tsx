import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { DashboardMetrics } from '@/lib/marketingApi';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';

export type ViewMode = 'board' | 'calendar' | 'builder' | 'intelligence';

interface SparkBarProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  metrics: DashboardMetrics | null;
  loading?: boolean;
  doraOpen: boolean;
  onToggleDora: () => void;
  onCreateCampaign: () => void;
  onCreateContent: () => void;
  onCreateEmail: () => void;
  /** Marketing hub: open Dora + Instagram AI prompt modal */
  onInstagramDraftAi?: () => void;
  /** Open “New content” with Instagram channel preset */
  onCreateInstagramContent?: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

interface SparkChipProps {
  label: string;
  value: string | number;
  sparkData?: Array<{ v: number }>;
  color?: string;
}

function SparkChip({ label, value, sparkData, color = marketingShell.sparkChart.default }: SparkChipProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-2 sm:px-3 rounded-lg bg-app-surface-tertiary border border-white/[0.08] min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-app-muted leading-none truncate">{label}</p>
        <p className="text-xs sm:text-sm font-semibold text-app-text leading-tight truncate">{value}</p>
      </div>
      {sparkData && sparkData.length > 1 && (
        <div className="w-10 sm:w-14 h-5 sm:h-6 shrink-0 hidden sm:block">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function SparkBar({
  mode,
  onModeChange,
  metrics,
  loading,
  doraOpen,
  onToggleDora,
  onCreateCampaign,
  onCreateContent,
  onCreateEmail,
  onInstagramDraftAi,
  onCreateInstagramContent,
}: SparkBarProps): JSX.Element {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const leadSpark = metrics?.monthlyTrend.map((t) => ({ v: t.leads })) ?? [];
  const spendSpark = metrics?.monthlyTrend.map((t) => ({ v: t.spend })) ?? [];

  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 px-3 sm:px-4 py-2 border-b ${marketingShell.borderSubtle} ${marketingShell.bgTop} shrink-0 sticky top-0 z-20 min-w-0`}
    >
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 flex-1 min-w-0 w-full">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 sm:h-10 rounded-lg bg-app-surface-tertiary animate-pulse min-w-0" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 flex-1 min-w-0 w-full">
          <SparkChip
            label="MQLs"
            value={metrics?.mqls ?? 0}
            sparkData={leadSpark}
            color={marketingShell.sparkChart.mql}
          />
          <SparkChip
            label="CPL"
            value={formatCurrency(metrics?.cpl ?? 0)}
            sparkData={spendSpark}
            color={marketingShell.sparkChart.cpl}
          />
          <SparkChip
            label="ROI"
            value={`${(metrics?.roi ?? 0).toFixed(1)}x`}
            color={marketingShell.sparkChart.roi}
          />
          <SparkChip
            label="Open Rate"
            value={`${(metrics?.emailOpenRate ?? 0).toFixed(1)}%`}
            color={marketingShell.sparkChart.openRate}
          />
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0 justify-end flex-wrap sm:justify-end w-full sm:w-auto">
        <button
          type="button"
          onClick={() => onModeChange('board')}
          title="Board"
          className={cn(
            'p-2 rounded-lg transition-colors',
            mode === 'board'
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onModeChange('calendar')}
          title="Calendar"
          aria-pressed={mode === 'calendar'}
          className={cn(
            'p-2 rounded-lg transition-colors',
            mode === 'calendar'
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <CalendarDays className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onModeChange('intelligence')}
          title="Competitor Intelligence"
          aria-pressed={mode === 'intelligence'}
          className={cn(
            'p-2 rounded-lg transition-colors',
            mode === 'intelligence'
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
          )}
        >
          <Radar className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-app-surface-tertiary mx-1" />

        <button
          type="button"
          onClick={onToggleDora}
          title="Dora Agent"
          className={cn(
            'p-2 rounded-lg transition-colors',
            doraOpen
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
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
                  onClick={() => { navigate('/marketing/builder'); setCreateOpen(false); }}
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
