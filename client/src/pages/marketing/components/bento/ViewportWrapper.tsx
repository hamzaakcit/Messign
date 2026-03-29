import type { ReactNode } from 'react';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { cn } from '@/lib/utils';

export interface ViewportWrapperProps {
  children: ReactNode;
  className?: string;
}

/**
 * Locks the marketing Lucy shell: no page scroll, width clipped to the viewport (`max-w-[100vw]`).
 * Height fills the parent flex region (`h-full`); pair the parent with `flex-1 min-h-0` (see MarketingHub).
 */
export function ViewportWrapper({ children, className }: ViewportWrapperProps): JSX.Element {
  return (
    <ViewportContainer
      density="compact"
      className={cn('max-h-none max-w-[100vw] overflow-x-hidden overflow-y-hidden', className)}
    >
      {children}
    </ViewportContainer>
  );
}
