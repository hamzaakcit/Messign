import { memo, type ReactNode } from 'react';
import { Plus, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompactKpiCardProps {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  onClick?: () => void;
  onQuickAdd?: () => void;
  onQuickPing?: () => void;
  pingDisabled?: boolean;
  chart?: ReactNode;
  className?: string;
}

function DeltaBadge({ deltaPct }: { deltaPct: number }): JSX.Element {
  const pos = deltaPct >= 0;
  return (
    <span
      className={cn(
        'text-[10px] font-semibold tabular-nums',
        pos ? 'text-emerald-400' : 'text-rose-400',
      )}
    >
      {pos ? '+' : ''}
      {deltaPct.toFixed(1)}%
      <span className="text-app-muted font-normal ml-0.5">vs last week</span>
    </span>
  );
}

export const CompactKpiCard = memo(function CompactKpiCard({
  label,
  value,
  sub,
  deltaPct,
  deltaLabel,
  onClick,
  onQuickAdd,
  onQuickPing,
  pingDisabled,
  chart,
  className,
}: CompactKpiCardProps): JSX.Element {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'w-full text-left rounded-lg border border-white/[0.06] bg-[#12141a]/90 p-2.5',
        'hover:bg-[#161922] hover:border-white/10 transition-colors',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-app-muted">{label}</p>
          <p className="text-xl font-bold tabular-nums text-app-text leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-app-muted mt-0.5 truncate">{sub}</p>}
          {deltaPct != null && Number.isFinite(deltaPct) && (
            <div className="mt-1">
              <DeltaBadge deltaPct={deltaPct} />
              {deltaLabel && <span className="text-[9px] text-app-muted ml-1">{deltaLabel}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 shrink-0">
          {onQuickAdd && (
            <button
              type="button"
              title="Quick add task"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd();
              }}
              className="p-1 rounded-md bg-primary-500/20 text-primary-300 hover:bg-primary-500/30"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {onQuickPing && (
            <button
              type="button"
              title="Ping teammate"
              disabled={pingDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onQuickPing();
              }}
              className="p-1 rounded-md bg-white/5 text-app-muted hover:bg-white/10 disabled:opacity-30"
            >
              <Radio className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {chart && <div className="mt-2 h-[52px] w-full">{chart}</div>}
    </div>
  );
});
