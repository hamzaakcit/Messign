import type { ReactNode } from 'react';

interface ModuleMetricTileProps {
  title: string;
  error?: string;
  /** Shown when `error` is set; typically reloads the full command-center payload. */
  onRetry?: () => void;
  /** Primary: opens workspace drill-down slide-over. */
  onOpenDetail?: () => void;
  /** Secondary: navigate to full module area in the app. */
  onOpenInApp?: () => void;
  detailLabel?: string;
  openInAppLabel?: string;
  children?: ReactNode;
}

/**
 * Dense bordered tile with optional error state for workspace overview sections.
 * Prefer opening the slide-over (Details) before routing to the full module.
 */
export function ModuleMetricTile({
  title,
  error,
  onRetry,
  onOpenDetail,
  onOpenInApp,
  detailLabel = 'Details',
  openInAppLabel = 'Open app',
  children,
}: ModuleMetricTileProps): JSX.Element {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-app-sidebar/50 backdrop-blur-sm p-3 flex flex-col gap-2 min-h-[100px] min-w-0">
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
          {onOpenDetail ? (
            <button
              type="button"
              onClick={onOpenDetail}
              className="text-[10px] font-medium text-primary-400 hover:underline"
            >
              {detailLabel}
            </button>
          ) : null}
          {onOpenInApp ? (
            <button
              type="button"
              onClick={onOpenInApp}
              className={`text-[10px] hover:underline ${
                onOpenDetail ? 'text-app-muted hover:text-app' : 'text-primary-400'
              }`}
            >
              {openInAppLabel}
            </button>
          ) : null}
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
