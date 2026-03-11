import { cn } from '@/lib/utils';

interface DoraInsightCountBadgeProps {
  count?: number;
  className?: string;
}

export function DoraInsightCountBadge({ count = 0, className }: DoraInsightCountBadgeProps) {
  if (!count) return null;

  return (
    <span
      className={cn(
        'min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-medium',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
