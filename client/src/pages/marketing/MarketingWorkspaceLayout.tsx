import { Outlet } from 'react-router-dom';
import { useMarketingContext } from './MarketingContext';
import { WorkspaceTopBar } from './components/WorkspaceTopBar';
import { MarketingWorkspaceSecondaryAlerts } from './components/MarketingWorkspaceSecondaryAlerts';

/**
 * Error banner — shown at the top of the workspace when bootstrap data fails to load.
 */
function WorkspaceBootstrapBanner({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}): JSX.Element | null {
  if (!error) return null;
  return (
    <div
      className="shrink-0 px-4 py-1.5 text-xs bg-rose-950/50 text-rose-100 border-b border-rose-500/30 flex items-center justify-between gap-2"
      role="alert"
    >
      <span className="truncate">{error.message}</span>
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void onRetry()}>
        Retry
      </button>
    </div>
  );
}

/**
 * Workspace layout — wraps all non-hub marketing routes (`/marketing/pipeline`, `/marketing/calendar`, etc.)
 * with contextual navigation and a visually distinct canvas.
 *
 * Rendered via `<Outlet />` from the parent `<Route element={<MarketingWorkspaceLayout />}>`.
 */
export function MarketingWorkspaceLayout(): JSX.Element {
  const ctx = useMarketingContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      {/* Error banners */}
      <WorkspaceBootstrapBanner error={ctx.bootstrapError} onRetry={() => void ctx.refetchBootstrap()} />
      <MarketingWorkspaceSecondaryAlerts
        funnelError={ctx.funnelError}
        brandsError={ctx.brandsError}
        onRetryFunnel={() => void ctx.refetchFunnel()}
        onRetryBrands={() => void ctx.refetchBrands()}
      />

      {/* Contextual top navigation */}
      <WorkspaceTopBar />

      {/* Page canvas — visually inset to reinforce "focused workspace" vs hub overview */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.25)]">
        <Outlet />
      </div>
    </div>
  );
}
