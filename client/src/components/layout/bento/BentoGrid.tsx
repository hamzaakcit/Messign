import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoGridProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  /** Tailwind grid-cols-* token, e.g. `grid-cols-12` (default). */
  colsClassName?: string;
}

/**
 * Responsive bento scaffold: `min-h-0` so nested modules can scroll internally inside flex parents.
 */
export function BentoGrid({
  children,
  className,
  colsClassName = 'grid-cols-12',
  ...rest
}: BentoGridProps): JSX.Element {
  return (
    <div
      className={cn('grid min-h-0 w-full gap-2', colsClassName, className)}
      {...rest}
    >
      {children}
    </div>
  );
}
