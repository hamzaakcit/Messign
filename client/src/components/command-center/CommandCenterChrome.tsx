import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandCenterChromeProps {
  title: string;
  subtitle?: string;
  /** Extra line under subtitle (e.g. workspace insight). */
  meta?: ReactNode;
  /** Trailing label (e.g. snapshot age). */
  trailing?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

/**
 * Shared header row for Mission Control and marketing command-center toolbars (visual parity).
 */
export function CommandCenterChrome({
  title,
  subtitle,
  meta,
  trailing,
  onRefresh,
  refreshing,
  className,
}: CommandCenterChromeProps): JSX.Element {
  return (
    <div
      className={cn(
        'text-compact shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.06]',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xs font-semibold text-app-text tracking-tight">{title}</h1>
        {subtitle ? <p className="text-[9px] text-app-muted leading-tight">{subtitle}</p> : null}
        {meta ? <div className="text-[10px] text-app-muted/90 mt-0.5 max-w-xl">{meta}</div> : null}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {trailing}
        {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-app-muted" aria-hidden /> : null}
        {onRefresh ? (
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-app-text hover:bg-white/5"
            title="Refresh"
            aria-label="Refresh command center data"
          >
            <RefreshCw className="w-3 h-3" aria-hidden />
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}
