import type { RefObject } from 'react';
import type { Campaign, ContentItem, EmailCampaign } from '@/lib/marketingApi';
import type { ApprovalQueueItem } from '@/pages/marketing/approvalQueue/types';
import { KanbanBoard, BoardSkeleton, type LaneId } from '@/pages/marketing/components/KanbanBoard';
import type { BoardCardData } from '@/pages/marketing/components/BoardCard';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';

export interface MarketingPipelinePageProps {
  pipelineSectionRef?: RefObject<HTMLDivElement | null>;
  filteredContent: ContentItem[];
  campaigns: Campaign[];
  emailCampaigns: EmailCampaign[];
  approvalItems: ApprovalQueueItem[];
  metricsLoading: boolean;
  onCardClick: (card: BoardCardData) => void;
  onCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;
}

/**
 * Content pipeline one-pager: Kanban lanes (extracted from the former workspace board).
 */
export function MarketingPipelinePage({
  pipelineSectionRef,
  filteredContent,
  campaigns,
  emailCampaigns,
  approvalItems,
  metricsLoading,
  onCardClick,
  onCardMove,
}: MarketingPipelinePageProps): JSX.Element {
  return (
    <div className={`flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden ${marketingShell.bgStack}`}>
      <section
        ref={pipelineSectionRef as RefObject<HTMLElement>}
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
          {metricsLoading ? (
            <BoardSkeleton />
          ) : (
            <KanbanBoard
              content={filteredContent}
              campaigns={campaigns}
              emailCampaigns={emailCampaigns}
              approvalItems={approvalItems}
              onCardClick={onCardClick}
              onCardMove={onCardMove}
            />
          )}
        </div>
      </section>
    </div>
  );
}
