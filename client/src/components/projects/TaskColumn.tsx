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
}

export function TaskColumn({ id, title, color, count, tooltipContent, children }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-app-sidebar rounded-xl border border-app-border overflow-hidden">
      {/* Column Header */}
      <div className="p-2 border-b border-app-border flex items-center gap-2 min-w-0">
        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', color)} />
        <h3 className="font-semibold text-app-text text-sm truncate min-w-0 flex items-center gap-1">
          {title}
          {tooltipContent != null && (
            <InfoTooltip content={tooltipContent} aria-label={`Definition: ${title}`} />
          )}
        </h3>
        <span className="ml-auto px-1.5 py-0.5 bg-app-surface-tertiary rounded text-[10px] text-app-muted shrink-0 tabular-nums">
          {count}
        </span>
      </div>

      {/* Tasks */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] transition-colors',
          isOver && 'bg-primary-500/10'
        )}
      >
        {children}
      </div>
    </div>
  );
}
