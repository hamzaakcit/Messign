import { useState, useCallback } from 'react';
import { Plus, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { DollarSign, TrendingUp, Target, BarChart3 } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { PipelineBoard } from '@/components/crm/PipelineBoard';
import { DealCreatePanel } from '@/components/crm/DealCreatePanel';
import { DealDetailPanel } from '@/components/crm/DealDetailPanel';
import { CRMNav } from '@/components/crm/CRMNav';
import { usePipeline } from '@/hooks/usePipeline';
import type { Deal } from '@/lib/crmApi';

type ViewMode = 'board' | 'list';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function PipelineBoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden flex-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-[280px] min-w-[280px] rounded-lg border border-app-border animate-pulse"
          style={{ backgroundColor: 'var(--app-bg)' }}
        >
          <div className="px-3 py-2.5 border-b border-app-border flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/10" />
            <div className="h-4 bg-white/10 rounded w-20" />
            <div className="ml-auto h-4 bg-white/10 rounded w-6" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 - i % 2 }).map((_, j) => (
              <div key={j} className="rounded-lg border border-app-border bg-app-card p-3 space-y-2">
                <div className="h-4 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/2" />
                <div className="flex justify-between mt-2 pt-2 border-t border-white/5">
                  <div className="h-5 w-5 rounded-full bg-white/10" />
                  <div className="h-3 bg-white/10 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CRMPipelinePage() {
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

  const [viewMode, setViewMode] = useState<ViewMode>('board');
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
  }, []);

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
                  onClick={() => setViewMode('board')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    viewMode === 'board'
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-app-hover'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Board
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                    viewMode === 'list'
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-app-hover'
                  }`}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
              </div>

              <button
                onClick={() => setNewDealOpen(true)}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Deal
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {/* Board */}
          {loading ? (
            <PipelineBoardSkeleton />
          ) : viewMode === 'board' ? (
            <PipelineBoard
              stages={stages}
              dealsByStage={effectiveDealsByStage}
              onDealsChange={handleDealsChange}
              onRefetch={handleRefetch}
              onDealClick={handleDealClick}
            />
          ) : (
            <div className="text-sm text-app-muted py-8 text-center">
              List view coming soon. Use Board view to manage deals.
            </div>
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
        onClose={() => setSelectedDeal(null)}
        title={selectedDeal?.title ?? 'Deal Detail'}
        width={640}
      >
        {selectedDeal && (
          <DealDetailPanel
            dealId={selectedDeal.id}
            onClose={() => setSelectedDeal(null)}
            stages={stages}
            onDealUpdated={handleRefetch}
          />
        )}
      </SlideOverPanel>
    </div>
  );
}
