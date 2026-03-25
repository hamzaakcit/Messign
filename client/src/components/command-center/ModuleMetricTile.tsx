import type { ReactNode } from 'react';

interface ModuleMetricTileProps {
  title: string;
  onOpen: () => void;
  openLabel?: string;
  error?: string;
  /** Shown when `error` is set; typically reloads the full command-center payload. */
  onRetry?: () => void;
  /** Opens workspace drill-down slide-over (same data, larger charts). */
  onDetails?: () => void;
  children?: ReactNode;
}

/**
 * Dense bordered tile with optional error state for workspace overview sections.
 */
export function ModuleMetricTile({
  title,
  onOpen,
  openLabel = 'Open',
  error,
  onRetry,
  onDetails,
  children,
}: ModuleMetricTileProps): JSX.Element {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-app-sidebar/50 p-3 flex flex-col gap-2 min-h-[100px] min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-app-muted truncate">{title}</h3>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {error && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] text-amber-400/95 hover:underline"
            >
              Retry
            </button>
          ) : null}
          {onDetails ? (
            <button
              type="button"
              onClick={onDetails}
              className="text-[10px] text-app-muted hover:text-app hover:underline"
            >
              Details
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="text-[10px] text-primary-400 hover:underline"
          >
            {openLabel}
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-rose-400/90 leading-snug">{error}</p>
      ) : (
        children
      )}
    </div>
  );
}
