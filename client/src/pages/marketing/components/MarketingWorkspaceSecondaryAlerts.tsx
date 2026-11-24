/**
 * Non-blocking brand-list error with retry.
 */
export function MarketingWorkspaceSecondaryAlerts({
  brandsError,
  onRetryBrands,
}: {
  brandsError: Error | null;
  onRetryBrands: () => void;
}): JSX.Element | null {
  if (!brandsError) return null;
  return (
    <div
      className="shrink-0 px-4 py-1 text-[11px] bg-amber-950/40 text-amber-100/95 border-b border-amber-500/25 flex flex-wrap items-center gap-x-4 gap-y-1"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="truncate">Brands: {brandsError.message}</span>
        <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void onRetryBrands()}>
          Retry
        </button>
      </span>
    </div>
  );
}
