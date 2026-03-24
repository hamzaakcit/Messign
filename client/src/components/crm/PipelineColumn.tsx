import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal, DealStage } from '@/lib/crmApi';
import { DealCard } from './DealCard';

interface PipelineColumnProps {
  stage: DealStage;
  deals: Deal[];
  onDealClick?: (deal: Deal) => void;
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function PipelineColumn({ stage, deals, onDealClick }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [collapsed, setCollapsed] = useState(stage.is_lost);

  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div
      data-testid={stage.is_won ? 'pipeline-stage-won' : stage.is_lost ? 'pipeline-stage-lost' : `pipeline-stage-${stage.id}`}
      className={cn(
        'flex flex-col rounded-lg border border-app-border overflow-hidden shrink-0',
        'w-[280px] min-w-[280px] max-h-full',
      )}
      style={{ backgroundColor: 'var(--app-card)' }}
    >
      <div
        className="px-3 py-2.5 border-b border-app-border flex items-center gap-2 shrink-0 cursor-pointer select-none"
        onClick={() => stage.is_lost && setCollapsed(prev => !prev)}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <h3 className="font-semibold text-sm text-app-text truncate flex-1">{stage.name}</h3>
        <span className="px-1.5 py-0.5 bg-app-surface-tertiary rounded text-[10px] text-app-muted shrink-0 tabular-nums">
          {deals.length}
        </span>
        {totalValue > 0 && (
          <span className="text-[10px] text-app-muted tabular-nums shrink-0">
            {formatValue(totalValue)}
          </span>
        )}
        {stage.is_lost && (
          collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-app-muted shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-app-muted shrink-0" />
        )}
      </div>

      {!collapsed && (
        <div
          ref={setNodeRef}
          data-testid={stage.is_won ? 'pipeline-stage-won-dropzone' : undefined}
          className={cn(
            'flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors',
            isOver && 'bg-primary-500/10',
          )}
        >
          <SortableContext
            items={deals.map(d => d.id)}
            strategy={verticalListSortingStrategy}
          >
            {deals.map(deal => (
              <DealCard
                key={deal.id}
                deal={deal}
                isWonColumn={stage.is_won}
                onClick={onDealClick}
              />
            ))}
          </SortableContext>

          {deals.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-app-muted">
              No deals
            </div>
          )}
        </div>
      )}

      {collapsed && (
        <div
          ref={setNodeRef}
          className="px-3 py-2 text-xs text-app-muted"
        >
          {deals.length} deal{deals.length !== 1 ? 's' : ''} &middot; {formatValue(totalValue)}
        </div>
      )}
    </div>
  );
}
