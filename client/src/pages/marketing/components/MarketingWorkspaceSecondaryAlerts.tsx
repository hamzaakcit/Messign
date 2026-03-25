/**
 * Non-blocking workspace errors (funnel + brand list) with per-slice retry.
 */
export function MarketingWorkspaceSecondaryAlerts({
  funnelError,
  brandsError,
  onRetryFunnel,
  onRetryBrands,
}: {
  funnelError: Error | null;
  brandsError: Error | null;
  onRetryFunnel: () => void;
  onRetryBrands: () => void;
}): JSX.Element | null {
  if (!funnelError && !brandsError) return null;
  return (
    <div
      className="shrink-0 px-4 py-1 text-[11px] bg-amber-950/40 text-amber-100/95 border-b border-amber-500/25 flex flex-wrap items-center gap-x-4 gap-y-1"
      role="status"
      aria-live="polite"
    >
      {funnelError ? (
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">Funnel: {funnelError.message}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void onRetryFunnel()}>
            Retry
          </button>
        </span>
      ) : null}
      {brandsError ? (
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">Brands: {brandsError.message}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void onRetryBrands()}>
            Retry
          </button>
        </span>
      ) : null}
    </div>
  );
}
