import type { RefObject } from 'react';
import type {
  BrandProfileClient,
  Campaign,
  CommandCenterPayload,
  CommandCenterStrategyPlay,
  ContentItem,
  EmailCampaign,
} from '@/lib/marketingApi';
import type { ApprovalQueueItem } from '@/pages/marketing/approvalQueue/types';
import { KanbanBoard, BoardSkeleton, type LaneId } from '@/pages/marketing/components/KanbanBoard';
import type { BoardCardData } from '@/pages/marketing/components/BoardCard';
import { MarketingCommandCenter } from '@/pages/marketing/MarketingCommandCenter';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';

export interface MarketingBoardAndPipelineProps {
  ccData: CommandCenterPayload | null;
  ccLoading: boolean;
  ccError: Error | null;
  /** Shown when brand list failed to load (toolbar + amber line). */
  brandsError?: Error | null;
  ccDays: number;
  onCcDaysChange: (days: number) => void;
  brandList: BrandProfileClient[];
  brandFilter: string | null;
  onBrandFilterChange: (id: string | null) => void;
  onRefreshCommandCenter: () => void;
  onExecuteWithDora: (play: CommandCenterStrategyPlay) => void;
  onOpenCampaign: (id: string) => void;
  onOpenEmail: (id: string) => void;
  onOpenPipeline: () => void;
  onOpenBuilder: () => void;
  onOpenIntelligence: () => void;
  onReconnectSocial: () => void;
  pipelineSectionRef: RefObject<HTMLDivElement | null>;
  filteredContent: ContentItem[];
  campaigns: Campaign[];
  emailCampaigns: EmailCampaign[];
  approvalItems: ApprovalQueueItem[];
  metricsLoading: boolean;
  onCardClick: (card: BoardCardData) => void;
  onCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;
}

/** Board mode: compact marketing command center + Kanban pipeline (extracted from MarketingHub). */
export function MarketingBoardAndPipeline({
  ccData,
  ccLoading,
  ccError,
  brandsError,
  ccDays,
  onCcDaysChange,
  brandList,
  brandFilter,
  onBrandFilterChange,
  onRefreshCommandCenter,
  onExecuteWithDora,
  onOpenCampaign,
  onOpenEmail,
  onOpenPipeline,
  onOpenBuilder,
  onOpenIntelligence,
  onReconnectSocial,
  pipelineSectionRef,
  filteredContent,
  campaigns,
  emailCampaigns,
  approvalItems,
  metricsLoading,
  onCardClick,
  onCardMove,
}: MarketingBoardAndPipelineProps): JSX.Element {
  return (
    <div className={`flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden ${marketingShell.bgStack}`}>
      <MarketingCommandCenter
        variant="compact"
        data={ccData}
        loading={ccLoading}
        error={ccError}
        brandsError={brandsError}
        days={ccDays}
        onDaysChange={onCcDaysChange}
        brandList={brandList}
        brandFilter={brandFilter}
        onBrandFilterChange={onBrandFilterChange}
        onRefresh={onRefreshCommandCenter}
        onExecuteWithDora={onExecuteWithDora}
        onOpenCampaign={onOpenCampaign}
        onOpenEmail={onOpenEmail}
        onOpenPipeline={onOpenPipeline}
        onOpenBuilder={onOpenBuilder}
        onOpenIntelligence={onOpenIntelligence}
        onReconnectSocial={onReconnectSocial}
      />
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
