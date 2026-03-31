import { Outlet } from 'react-router-dom';
import { SparkBar } from './components/SparkBar';
import { useMarketingContext } from './MarketingContext';
import { buildMarketingModeLocation } from './lib/marketingPathUtils';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Workspace layout for all non-hub marketing routes (`/marketing/pipeline`, `/marketing/calendar`, etc.).
 *
 * Visual distinction from the Lucy hub:
 * - Sleek SparkBar top-nav with labeled tabs + active states
 * - Full-bleed workspace canvas (no bento grid, no gradient hero)
 * - Subtle background shift to signal "focused tool" vs "command center"
 */
export function MarketingWorkspaceLayout(): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SparkBar
        metrics={ctx.metrics}
        loading={ctx.metricsLoading}
        onCreateCampaign={() => ctx.setCreateCampaignOpen(true)}
        onCreateContent={ctx.openCreateContentDefault}
        onCreateEmail={() => void navigate(buildMarketingModeLocation('builder', location.search))}
        onInstagramDraftAi={ctx.handleInstagramDraftAi}
        onCreateInstagramContent={ctx.handleCreateInstagramContent}
      />

      {/* Workspace canvas — visually distinct from hub */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden bg-app">
        <Outlet />
      </div>
    </div>
  );
}
