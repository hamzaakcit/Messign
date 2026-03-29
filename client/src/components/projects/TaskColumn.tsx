import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/components/ui';

interface TaskColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  /** Optional tooltip content (e.g. status definition). When set, an Info icon is shown next to the title. */
  tooltipContent?: React.ReactNode;
  children: React.ReactNode;
  /** Mission Control compact density. */
  compact?: boolean;
}

export function TaskColumn({ id, title, color, count, tooltipContent, children, compact }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex-1 min-w-0 flex flex-col bg-app-sidebar/80 backdrop-blur-[1px] rounded-lg border border-app-border overflow-hidden',
      )}
    >
      {/* Column Header */}
      <div className={cn('border-b border-app-border flex items-center gap-2 min-w-0', compact ? 'p-1.5' : 'p-2')}>
        <div className={cn('rounded-full shrink-0', color, compact ? 'w-2 h-2' : 'w-2.5 h-2.5')} />
        <h3
          className={cn(
            'font-semibold text-app-text truncate min-w-0 flex items-center gap-1',
            compact ? 'text-[12px]' : 'text-sm',
          )}
        >
          {title}
          {tooltipContent != null && (
            <InfoTooltip content={tooltipContent} aria-label={`Definition: ${title}`} />
          )}
        </h3>
        <span
          className={cn(
            'ml-auto px-1.5 py-0.5 bg-app-surface-tertiary rounded text-app-muted shrink-0 tabular-nums border border-app-border/50',
            compact ? 'text-[9px]' : 'text-[10px]',
          )}
        >
          {count}
        </span>
      </div>

      {/* Tasks */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto min-h-[120px] transition-colors',
          compact ? 'p-1.5 space-y-1.5' : 'p-2 space-y-2 min-h-[200px]',
          isOver && 'bg-primary-500/10',
        )}
      >
        {children}
      </div>
    </div>
  );
}
