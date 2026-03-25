import { ErrorBoundary } from '@/components/ErrorBoundary';
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
}

/**
 * High-density four-column Intelligence Kanban for Marketing.
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
}: MarketingCommandCenterProps): JSX.Element {
  const alertSignup =
    data != null &&
    data.funnelSeries7d.length >= 2 &&
    data.funnelSeries7d[data.funnelSeries7d.length - 1].value <
      data.funnelSeries7d[data.funnelSeries7d.length - 2].value;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#080a0e]">
      <CommandCenterToolbar
        days={days}
        onDaysChange={onDaysChange}
        brandList={brandList}
        brandFilter={brandFilter}
        onBrandFilterChange={onBrandFilterChange}
        onRefresh={() => onRefresh()}
        loading={loading}
      />
      <div className="flex flex-wrap items-center gap-2 px-3 py-1 border-b border-white/[0.04] shrink-0">
        <button
          type="button"
          onClick={onOpenPipeline}
          className="text-[10px] font-medium rounded-md px-2 py-0.5 bg-app-surface-tertiary border border-white/[0.08] text-app-text hover:bg-app-nav-hover"
        >
          Content pipeline
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

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto p-3">
        {loading && !data ? (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 min-w-[1080px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-app-surface-tertiary/80 animate-pulse border border-white/[0.06]" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 min-w-[1080px] items-start">
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
            <ErrorBoundary resetKey="cc-dora" fallback={<ColumnFallback title="Dora Sandbox" />}>
              <div className="flex flex-col gap-2 min-w-[260px]">
                <p className="text-[10px] text-app-muted">
                  Active campaigns:{' '}
                  <span className="text-app-text font-semibold tabular-nums">{data.activeCampaigns}</span>
                </p>
                <StrategySandboxColumn plays={data.plays} onExecuteWithDora={onExecuteWithDora} />
              </div>
            </ErrorBoundary>
          </div>
        ) : (
          <p className="text-[11px] text-app-muted px-1">No command center data.</p>
        )}
      </div>
    </div>
  );
}
