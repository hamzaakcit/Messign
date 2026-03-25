import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, LayoutGrid, CircleDot, ChevronDown } from 'lucide-react';
import { DollarSign, TrendingUp, Target, BarChart3 } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { PipelineBoard } from '@/components/crm/PipelineBoard';
import { PipelineRadialChart } from '@/components/visualizations/PipelineRadialChart';
import { PageSkeleton, ErrorState } from '@/components/ui';
import { DealCreatePanel } from '@/components/crm/DealCreatePanel';
import { DealDetailPanel } from '@/components/crm/DealDetailPanel';
import { CRMNav } from '@/components/crm/CRMNav';
import { usePipeline } from '@/hooks/usePipeline';
import type { Deal } from '@/lib/crmApi';
import { formatCrmCurrencyCompact } from '@/lib/crmCurrency';

type ViewMode = 'kanban' | 'radial';

function formatCurrency(value: number): string {
  return formatCrmCurrencyCompact(value, 'EUR');
}


export function CRMPipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    pipelines,
    activePipelineId,
    setActivePipelineId,
    stages,
    dealsByStage,
    metrics,
    loading,
    error,
    refetch,
  } = usePipeline();

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [localDealsByStage, setLocalDealsByStage] = useState<Map<string, Deal[]> | null>(null);

  const effectiveDealsByStage = localDealsByStage ?? dealsByStage;

  const handleDealsChange = useCallback((updated: Map<string, Deal[]>) => {
    setLocalDealsByStage(updated);
  }, []);

  const handleRefetch = useCallback(() => {
    setLocalDealsByStage(null);
    refetch();
  }, [refetch]);

  const handleDealClick = useCallback((deal: Deal) => {
    setSelectedDeal(deal);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('deal', deal.id);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const dealIdFromUrl = searchParams.get('deal');
  useEffect(() => {
    if (!dealIdFromUrl || loading || error) return;
    const all = Array.from(dealsByStage.values()).flat();
    const match = all.find((d) => d.id === dealIdFromUrl);
    if (match) setSelectedDeal(match);
  }, [dealIdFromUrl, dealsByStage, loading, error]);

  const clearDealParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('deal');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleDealCreated = useCallback(() => {
    setNewDealOpen(false);
    refetch();
  }, [refetch]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4 flex flex-col min-h-full">
          <CRMNav />
          <DoraInsightBar module="sales" />

          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard
              title="Pipeline Value"
              value={formatCurrency(metrics?.totalPipeline ?? 0)}
              subtitle={`Weighted: ${formatCurrency(metrics?.weightedPipeline ?? 0)}`}
              icon={DollarSign}
            />
            <KPICard
              title="Deals Won"
              value={metrics?.dealsWon ?? 0}
              subtitle="This period"
              icon={TrendingUp}
            />
            <KPICard
              title="Win Rate"
              value={`${(metrics?.winRate ?? 0).toFixed(1)}%`}
              subtitle={`${metrics?.dealsLost ?? 0} lost`}
              icon={Target}
            />
            <KPICard
              title="Avg Deal Size"
              value={formatCurrency(metrics?.avgDealSize ?? 0)}
              icon={BarChart3}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {pipelines.length > 1 && (
                <div className="relative">
                  <select
                    value={activePipelineId ?? ''}
                    onChange={e => setActivePipelineId(e.target.value)}
                    className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-8 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none" />
                </div>
              )}

              {pipelines.length === 1 && (
                <h2 className="text-lg font-semibold text-app-text">{pipelines[0]?.name}</h2>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-app-border overflow-hidden">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    viewMode === 'kanban'
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-app-hover'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Kanban
                </button>
                <button
                  onClick={() => setViewMode('radial')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    viewMode === 'radial'
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-app-hover'
                  }`}
                >
                  <CircleDot className="w-4 h-4" />
                  Radial
                </button>
              </div>

              <button
                data-testid="crm-new-deal"
                onClick={() => setNewDealOpen(true)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Deal
              </button>
            </div>
          </div>

          {/* Board / Radial / Error */}
          {loading ? (
            <PageSkeleton variant="kanban" />
          ) : error ? (
            <ErrorState message={error} onRetry={handleRefetch} />
          ) : viewMode === 'kanban' ? (
            <PipelineBoard
              stages={stages}
              dealsByStage={effectiveDealsByStage}
              onDealsChange={handleDealsChange}
              onRefetch={handleRefetch}
              onDealClick={handleDealClick}
            />
          ) : (
            <PipelineRadialChart
              stages={stages}
              dealsByStage={effectiveDealsByStage}
              totalValue={metrics?.totalPipeline ?? 0}
            />
          )}
        </div>
      </div>

      {/* New Deal Slide-Over */}
      <SlideOverPanel
        isOpen={newDealOpen}
        onClose={() => setNewDealOpen(false)}
        title="New Deal"
        width={520}
      >
        {activePipelineId && (
          <DealCreatePanel
            pipelineId={activePipelineId}
            stages={stages}
            onCreated={handleDealCreated}
            onCancel={() => setNewDealOpen(false)}
          />
        )}
      </SlideOverPanel>

      {/* Deal Detail Slide-Over */}
      <SlideOverPanel
        isOpen={!!selectedDeal}
        onClose={() => {
          setSelectedDeal(null);
          clearDealParam();
        }}
        title={selectedDeal?.title ?? 'Deal Detail'}
        width={640}
      >
        {selectedDeal && (
          <DealDetailPanel
            dealId={selectedDeal.id}
            onClose={() => {
              setSelectedDeal(null);
              clearDealParam();
            }}
            stages={stages}
            onDealUpdated={handleRefetch}
          />
        )}
      </SlideOverPanel>
    </div>
  );
}
