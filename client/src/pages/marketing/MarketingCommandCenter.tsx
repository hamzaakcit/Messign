import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';
import type {
  BrandProfileClient,
  CommandCenterPayload,
  CommandCenterStrategyPlay,
} from '@/lib/marketingApi';
import { CommandCenterToolbar } from './command-center/CommandCenterToolbar';
import { BrandSocialColumn } from './command-center/columns/BrandSocialColumn';
import { FunnelColumn } from './command-center/columns/FunnelColumn';
import { ExperimentsColumn } from './command-center/columns/ExperimentsColumn';
import { StrategySandboxColumn } from './command-center/columns/StrategySandboxColumn';
import { marketingShell } from './lib/marketingShellTheme';

function ColumnFallback({ title }: { title: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2 py-3 text-center">
      <p className="text-[10px] text-rose-300/90">{title} failed to render</p>
    </div>
  );
}

export interface MarketingCommandCenterProps {
  data: CommandCenterPayload | null;
  loading: boolean;
  error: Error | null;
  days: number;
  onDaysChange: (days: number) => void;
  brandList: BrandProfileClient[];
  brandFilter: string | null;
  onBrandFilterChange: (id: string | null) => void;
  onRefresh: () => void;
  onExecuteWithDora: (play: CommandCenterStrategyPlay) => void;
  onOpenCampaign: (id: string) => void;
  onOpenEmail: (id: string) => void;
  onOpenPipeline: () => void;
  onOpenBuilder: () => void;
  onOpenIntelligence: () => void;
  onReconnectSocial?: () => void;
  /** Brand list query failed (toolbar shows a one-line warning + amber accent). */
  brandsError?: Error | null;
  /** `compact`: bounded height above the main Kanban; intelligence grid scrolls inside. */
  variant?: 'full' | 'compact';
  /** Single-column one-pager; `all` = four-column grid (default). */
  visibleColumn?: 'all' | 'brand-social' | 'funnel' | 'experiments' | 'sandbox';
}

/**
 * Marketing command center: four-column grid by default, or a single column when `visibleColumn` is set (one-pager routes).
 */
export function MarketingCommandCenter({
  data,
  loading,
  error,
  days,
  onDaysChange,
  brandList,
  brandFilter,
  onBrandFilterChange,
  onRefresh,
  onExecuteWithDora,
  onOpenCampaign,
  onOpenEmail,
  onOpenPipeline,
  onOpenBuilder,
  onOpenIntelligence,
  onReconnectSocial,
  brandsError,
  variant = 'full',
  visibleColumn = 'all',
}: MarketingCommandCenterProps): JSX.Element {
  const isCompact = variant === 'compact';
  const isMultiColumn = visibleColumn === 'all';
  const [intelExpanded, setIntelExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );

  const alertSignup =
    data != null &&
    data.funnelSeries7d.length >= 2 &&
    data.funnelSeries7d[data.funnelSeries7d.length - 1].value <
      data.funnelSeries7d[data.funnelSeries7d.length - 2].value;

  return (
    <div
      className={cn(
        `flex flex-col min-w-0 overflow-hidden ${marketingShell.bgStack}`,
        isCompact ? 'shrink-0 border-b border-white/[0.06]' : 'flex-1 min-h-0',
      )}
      aria-busy={loading}
    >
      <div className="shrink-0">
        <CommandCenterToolbar
          days={days}
          onDaysChange={onDaysChange}
          brandList={brandList}
          brandFilter={brandFilter}
          onBrandFilterChange={onBrandFilterChange}
          onRefresh={() => onRefresh()}
          loading={loading}
          brandsError={brandsError}
        />
        {brandsError ? (
          <div className="h-0.5 w-full bg-amber-500/55 shrink-0" aria-hidden />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1 border-b border-white/[0.04] shrink-0">
        {isCompact && isMultiColumn && (
          <button
            type="button"
            onClick={() => setIntelExpanded((e) => !e)}
            className="flex items-center gap-1 text-[10px] font-medium rounded-md px-2 py-0.5 bg-app-surface-tertiary border border-white/[0.08] text-app-text hover:bg-app-nav-hover"
            title={intelExpanded ? 'Hide command center columns' : 'Show command center columns'}
          >
            {intelExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Grid
          </button>
        )}
        <button
          type="button"
          onClick={onOpenPipeline}
          className="text-[10px] font-medium rounded-md px-2 py-0.5 bg-app-surface-tertiary border border-white/[0.08] text-app-text hover:bg-app-nav-hover"
          title="Scroll to content pipeline"
        >
          Pipeline
        </button>
        <button
          type="button"
          onClick={onOpenBuilder}
          className="text-[10px] font-medium rounded-md px-2 py-0.5 bg-app-surface-tertiary border border-white/[0.08] text-app-text hover:bg-app-nav-hover"
        >
          Builder
        </button>
        <button
          type="button"
          onClick={onOpenIntelligence}
          className="text-[10px] font-medium rounded-md px-2 py-0.5 bg-app-surface-tertiary border border-white/[0.08] text-app-text hover:bg-app-nav-hover"
        >
          Intelligence
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200/90">
          {error.message}
          <button type="button" onClick={() => onRefresh()} className="ml-2 underline text-amber-100">
            Retry
          </button>
        </div>
      )}

      {(!isCompact || intelExpanded || !isMultiColumn) && (
      <div
        className={cn(
          'min-h-0 overflow-x-hidden overflow-y-auto p-2 sm:p-3',
          isCompact && isMultiColumn ? 'max-h-[min(36vh,300px)]' : 'flex-1',
        )}
      >
        {loading && !data ? (
          <div className={cn('grid gap-2 sm:gap-3 w-full min-w-0', isMultiColumn ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1')}>
            {Array.from({ length: isMultiColumn ? 4 : 1 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-xl bg-app-surface-tertiary/80 animate-pulse border border-white/[0.06]',
                  isCompact ? 'h-36 sm:h-40' : 'h-64',
                )}
              />
            ))}
          </div>
        ) : data ? (
          isMultiColumn ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 w-full min-w-0 items-start">
            <ErrorBoundary resetKey="cc-social" fallback={<ColumnFallback title="Brand & Social" />}>
              <BrandSocialColumn data={data.socialPulse} onReconnect={onReconnectSocial} />
            </ErrorBoundary>
            <ErrorBoundary resetKey="cc-funnel" fallback={<ColumnFallback title="Funnel" />}>
              <FunnelColumn
                funnel7d={data.funnel7d}
                funnelSeries7d={data.funnelSeries7d}
                cacRoi={data.cacRoi}
                alertSignupDrop={!!alertSignup}
              />
            </ErrorBoundary>
            <ErrorBoundary resetKey="cc-exp" fallback={<ColumnFallback title="Experiments" />}>
              <ExperimentsColumn
                experiments={data.experiments}
                onOpenCampaign={onOpenCampaign}
                onOpenEmail={onOpenEmail}
              />
            </ErrorBoundary>
            <ErrorBoundary resetKey="cc-dora" fallback={<ColumnFallback title="Lucy Sandbox" />}>
              <div className="flex flex-col gap-2 min-w-0 w-full">
                <p className="text-[10px] text-app-muted">
                  Active campaigns:{' '}
                  <span className="text-app-text font-semibold tabular-nums">{data.activeCampaigns}</span>
                </p>
                <StrategySandboxColumn plays={data.plays} onExecuteWithDora={onExecuteWithDora} />
              </div>
            </ErrorBoundary>
          </div>
          ) : (
          <div className="w-full min-w-0 max-w-4xl mx-auto">
            {visibleColumn === 'brand-social' && (
              <ErrorBoundary resetKey="cc-social" fallback={<ColumnFallback title="Brand & Social" />}>
                <BrandSocialColumn data={data.socialPulse} onReconnect={onReconnectSocial} />
              </ErrorBoundary>
            )}
            {visibleColumn === 'funnel' && (
              <ErrorBoundary resetKey="cc-funnel" fallback={<ColumnFallback title="Funnel" />}>
                <FunnelColumn
                  funnel7d={data.funnel7d}
                  funnelSeries7d={data.funnelSeries7d}
                  cacRoi={data.cacRoi}
                  alertSignupDrop={!!alertSignup}
                />
              </ErrorBoundary>
            )}
            {visibleColumn === 'experiments' && (
              <ErrorBoundary resetKey="cc-exp" fallback={<ColumnFallback title="Experiments" />}>
                <ExperimentsColumn
                  experiments={data.experiments}
                  onOpenCampaign={onOpenCampaign}
                  onOpenEmail={onOpenEmail}
                />
              </ErrorBoundary>
            )}
            {visibleColumn === 'sandbox' && (
              <ErrorBoundary resetKey="cc-dora" fallback={<ColumnFallback title="Lucy Sandbox" />}>
                <div className="flex flex-col gap-2 min-w-0 w-full">
                  <p className="text-[10px] text-app-muted">
                    Active campaigns:{' '}
                    <span className="text-app-text font-semibold tabular-nums">{data.activeCampaigns}</span>
                  </p>
                  <StrategySandboxColumn plays={data.plays} onExecuteWithDora={onExecuteWithDora} />
                </div>
              </ErrorBoundary>
            )}
          </div>
          )
        ) : (
          <p className="text-[11px] text-app-muted px-1">No command center data.</p>
        )}
      </div>
      )}
    </div>
  );
}
