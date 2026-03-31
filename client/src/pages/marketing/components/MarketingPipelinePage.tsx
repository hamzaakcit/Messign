import { KanbanBoard, BoardSkeleton } from '@/pages/marketing/components/KanbanBoard';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import { useMarketingContext } from '@/pages/marketing/MarketingContext';

/**
 * Content pipeline one-pager: Kanban lanes.
 * Reads all data from {@link useMarketingContext}.
 */
export function MarketingPipelinePage(): JSX.Element {
  const ctx = useMarketingContext();

  return (
    <div className={`flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden ${marketingShell.bgStack}`}>
      <section
        className={`flex flex-1 min-h-0 flex-col border-t ${marketingShell.borderSubtle} overflow-hidden`}
        aria-label="Content pipeline"
      >
        <div
          className={`shrink-0 px-3 py-1.5 border-b ${marketingShell.borderHairline} ${marketingShell.bgStrip} max-sm:py-1`}
        >
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-app-muted max-sm:sr-only">
            Content pipeline
          </h2>
          <p className="text-[10px] text-app-muted sm:hidden">Pipeline</p>
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-1">
          {ctx.metricsLoading ? (
            <BoardSkeleton />
          ) : (
            <KanbanBoard
              content={ctx.filteredContent}
              campaigns={ctx.campaigns}
              emailCampaigns={ctx.emailCampaigns}
              approvalItems={ctx.approvalItems}
              onCardClick={ctx.handleCardClick}
              onCardMove={(cardId, from, to, card) => void ctx.handleCardMove(cardId, from, to, card)}
            />
          )}
        </div>
      </section>
    </div>
  );
}
