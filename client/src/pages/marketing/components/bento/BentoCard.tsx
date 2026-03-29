import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoCardProps {
  children: ReactNode;
  className?: string;
  /** Highlight ring for “selected” nav / tile state */
  highlighted?: boolean;
  /** When set, renders as a button for accessibility */
  onClick?: () => void;
  /** For toggle-style tiles (e.g. hub nav) */
  'aria-pressed'?: boolean;
  title?: string;
  'aria-label'?: string;
}

/**
 * Dense glass-style tile for the marketing bento grid (v2: `rounded-lg`, aligns with shared bento radius).
 */
export function BentoCard({
  children,
  className,
  highlighted = false,
  onClick,
  'aria-pressed': ariaPressed,
  title,
  'aria-label': ariaLabel,
}: BentoCardProps): JSX.Element {
  const base =
    'rounded-lg border border-white/[0.1] bg-gradient-to-b from-slate-900/85 to-slate-950/95 backdrop-blur-md shadow-sm shadow-black/25 ring-1 ring-violet-500/10 min-h-0 min-w-0 flex flex-col p-2 md:p-3';

  const ring = highlighted ? 'ring-2 ring-violet-500/40 border-violet-500/25' : '';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-pressed={ariaPressed}
        className={cn(
          base,
          ring,
          'items-stretch text-left transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80',
          className,
        )}
      >
        {children}
      </button>
    );
  }

  return <div className={cn(base, ring, className)}>{children}</div>;
}
