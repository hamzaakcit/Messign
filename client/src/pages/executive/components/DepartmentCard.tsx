import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

interface MetricItem {
  label: string;
  value: string | number;
  suffix?: string;
}

interface DepartmentCardProps {
  id: string;
  title: string;
  icon: ReactNode;
  iconColor: string;
  metrics: MetricItem[];
  chart?: ReactNode;
  actionLabel: string;
  onAction: () => void;
  pendingCount?: number;
  className?: string;
}

export function DepartmentCard({
  id,
  title,
  icon,
  iconColor,
  metrics,
  chart,
  actionLabel,
  onAction,
  pendingCount,
  className,
}: DepartmentCardProps): JSX.Element {
  return (
    <div
      id={`dept-${id}`}
      data-testid={`dept-card-${id}`}
      className={cn(
        'rounded-lg border border-app bg-app-card p-4 flex flex-col',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: iconColor }}>{icon}</span>
          <h3 className="text-sm font-semibold text-app">{title}</h3>
        </div>
        {pendingCount != null && pendingCount > 0 && (
          <Badge className="bg-amber-500/20 text-amber-300 text-xs px-1.5 py-0.5">
            {pendingCount}
          </Badge>
        )}
      </div>

      {chart && <div className="h-28 mb-3">{chart}</div>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 flex-1">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[11px] text-app-muted truncate">{m.label}</div>
            <div className="text-sm font-semibold text-app">
              {m.value}
              {m.suffix && <span className="text-xs font-normal text-app-muted ml-0.5">{m.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      <button
        data-testid={`action-btn-${id}`}
        onClick={onAction}
        className="w-full py-1.5 text-xs font-medium rounded-md border border-app
                   text-app-muted hover:text-app hover:bg-app-hover transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}
