import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  /** Optional icon or action row */
  headerRight?: ReactNode;
}

/**
 * Glass-style dense card shell for Dashboard bento cells.
 */
export function BentoCard({ children, className, title, headerRight }: BentoCardProps): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-app-card/35 backdrop-blur-sm shadow-sm',
        'flex flex-col min-h-0 min-w-0 overflow-hidden p-2.5',
        className,
      )}
    >
      {(title || headerRight) && (
        <div className="flex items-start justify-between gap-1.5 mb-1.5 shrink-0">
          {title ? (
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-app-muted truncate">{title}</h3>
          ) : (
            <span />
          )}
          {headerRight}
        </div>
      )}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
