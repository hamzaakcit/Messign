import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DoraColumnInsightBadgeProps {
  message: string;
  className?: string;
}

/**
 * Hover shows full insight via native tooltip (compact column chrome).
 */
export function DoraColumnInsightBadge({ message, className }: DoraColumnInsightBadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 max-w-full rounded px-1.5 py-0.5 text-[10px] font-medium',
        'bg-violet-500/15 text-violet-200/90 border border-violet-500/25 cursor-help',
        className,
      )}
      title={message}
    >
      <Sparkles className="w-3 h-3 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">Dora</span>
    </span>
  );
}
