import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ViewportContainerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  /**
   * `compact`: v2 high-density (13px-equivalent text + tight leading) via `data-density` + utility classes.
   */
  density?: 'default' | 'compact';
  /** Row layout (e.g. Chat three-pane); default column stack for bento/dashboard shells. */
  orientation?: 'row' | 'col';
}

/**
 * Locks a feature surface to the parent flex region: no accidental page scroll from this wrapper.
 * Pair with `flex-1 min-h-0` parents (App shell main) and internal `overflow-y-auto` on lists only.
 */
export function ViewportContainer({
  children,
  className,
  density = 'compact',
  orientation = 'col',
  ...rest
}: ViewportContainerProps): JSX.Element {
  return (
    <div
      data-density={density === 'compact' ? 'compact' : undefined}
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 overflow-hidden',
        orientation === 'row' ? 'flex-row' : 'flex-col',
        density === 'compact' && 'text-compact',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
