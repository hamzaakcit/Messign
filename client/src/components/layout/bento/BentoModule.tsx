import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoModuleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
}

/**
 * Default chrome for a bento tile: sharp border, no heavy shadow, `min-h-0` for internal scroll.
 */
export function BentoModule({ children, className, ...rest }: BentoModuleProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-app-border bg-app-card/60',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
