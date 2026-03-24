import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal } from '@/lib/crmApi';

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  isWonColumn?: boolean;
  onClick?: (deal: Deal) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DealCard({ deal, isDragging, isWonColumn, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`deal-card-${deal.id}`}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(deal);
      }}
      className={cn(
        'rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all',
        'bg-app-card border-app-border hover:ring-1 hover:ring-primary-500/20',
        isWonColumn && 'border-l-2 border-l-emerald-500/40',
        dragging && 'opacity-50 shadow-xl ring-2 ring-primary-500 z-50',
      )}
    >
      <h4 className="font-semibold text-[13px] text-app-text leading-tight truncate">
        {deal.title}
      </h4>

      {deal.company_name && (
        <p className="text-xs text-app-muted mt-0.5 truncate">{deal.company_name}</p>
      )}

      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {deal.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-app-surface-tertiary text-app-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-app-border">
        <div className="flex items-center gap-1.5">
          {deal.owner_name ? (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium bg-primary-500/20 text-primary-400 shrink-0"
              title={deal.owner_name}
            >
              {getInitials(deal.owner_name)}
            </div>
          ) : null}

          {deal.expected_close_date && (
            <span className="flex items-center gap-0.5 text-[11px] text-app-muted">
              <Calendar className="w-3 h-3" />
              {new Date(deal.expected_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        <span className="text-xs font-medium text-emerald-400 tabular-nums">
          {formatCurrency(deal.amount, deal.currency)}
        </span>
      </div>
    </div>
  );
}
