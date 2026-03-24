import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import {
  CheckCircle,
  CircleDot,
  Clock,
  Eye,
  Pencil,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentItem, Campaign, EmailCampaign } from '@/lib/marketingApi';
import type { ApprovalQueueItem } from '../approvalQueue/types';
import { deriveRiskLevel } from '../approvalQueue/approvalQueueUtils';
import { BoardCard, BoardCardOverlay, type BoardCardData } from './BoardCard';

export type LaneId = 'draft' | 'review' | 'ready' | 'scheduled' | 'live';

interface KanbanBoardProps {
  content: ContentItem[];
  campaigns: Campaign[];
  emailCampaigns: EmailCampaign[];
  approvalItems: ApprovalQueueItem[];
  onCardClick: (card: BoardCardData) => void;
  onCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;
}

const LANE_CONFIG: Array<{
  id: LaneId;
  icon: React.ElementType;
  accent: string;
  borderColor: string;
}> = [
  { id: 'draft', icon: Pencil, accent: 'text-slate-400', borderColor: 'border-t-slate-500' },
  { id: 'review', icon: Eye, accent: 'text-amber-400', borderColor: 'border-t-amber-500' },
  { id: 'ready', icon: CheckCircle, accent: 'text-emerald-400', borderColor: 'border-t-emerald-500' },
  { id: 'scheduled', icon: Clock, accent: 'text-cyan-400', borderColor: 'border-t-cyan-500' },
  { id: 'live', icon: Zap, accent: 'text-green-400', borderColor: 'border-t-green-500' },
];

function contentToCard(item: ContentItem): BoardCardData {
  return {
    id: `content-${item.id}`,
    type: 'content',
    title: item.title,
    channel: item.channel,
    thumbnailUrl: item.image_url,
    scheduledDate: item.scheduled_date,
    updatedAt: item.updated_at,
    status: item.status,
    sourceData: item,
  };
}

function campaignToCard(c: Campaign): BoardCardData {
  return {
    id: `campaign-${c.id}`,
    type: 'campaign',
    title: c.name,
    channel: c.channel,
    thumbnailUrl: null,
    scheduledDate: c.start_date,
    updatedAt: c.updated_at,
    roi: c.roi,
    status: c.status,
    sourceData: c,
  };
}

function emailToCard(e: EmailCampaign): BoardCardData {
  return {
    id: `email-${e.id}`,
    type: 'email',
    title: e.name,
    channel: 'email',
    thumbnailUrl: null,
    scheduledDate: e.scheduled_at,
    updatedAt: e.updated_at,
    status: e.status,
    sourceData: e,
  };
}

function approvalToCard(a: ApprovalQueueItem): BoardCardData {
  return {
    id: `approval-${a.id}`,
    type: 'approval',
    title: a.title,
    channel: a.targetChannel,
    thumbnailUrl: null,
    scheduledDate: null,
    updatedAt: a.submittedAt,
    score: a.brandVoiceScore,
    riskLevel: deriveRiskLevel(a),
    status: 'in_review',
    sourceData: a,
  };
}

function getLane(card: BoardCardData, approvalIds: Set<string>): LaneId {
  if (card.type === 'approval') return 'review';

  const s = card.status.toLowerCase();

  if (approvalIds.has(card.id)) return 'review';

  if (s === 'published' || s === 'sent' || s === 'active' || s === 'completed') return 'live';
  if (card.scheduledDate && s !== 'draft') return 'scheduled';
  if (s === 'approved' || s === 'ready') return 'ready';
  if (s === 'in_review' || s === 'pending_review' || s === 'ready_for_review') return 'review';

  return 'draft';
}

function Lane({
  laneId,
  cards,
  config,
  onCardClick,
}: {
  laneId: LaneId;
  cards: BoardCardData[];
  config: (typeof LANE_CONFIG)[number];
  onCardClick: (card: BoardCardData) => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });
  const Icon = config.icon;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col flex-1 min-w-[180px] border-t-2 rounded-t-lg bg-white/[0.01]',
        config.borderColor,
        isOver && 'bg-white/[0.03] ring-1 ring-inset ring-white/10',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        <Icon className={cn('w-3.5 h-3.5', config.accent)} />
        <span className={cn(
          'w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold',
          cards.length > 0 ? 'bg-white/[0.08] text-app-text' : 'bg-transparent text-app-muted',
        )}>
          {cards.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <BoardCard key={card.id} card={card} onClick={onCardClick} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[10px] text-app-text/20">
            <CircleDot className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  );
}

function BoardSkeleton(): JSX.Element {
  return (
    <div className="flex gap-2 flex-1 min-h-0 px-3 py-3">
      {LANE_CONFIG.map((config) => (
        <div key={config.id} className={cn('flex flex-col flex-1 min-w-[180px] border-t-2 rounded-t-lg bg-white/[0.01]', config.borderColor)}>
          <div className="flex items-center gap-2 px-3 py-2 shrink-0">
            <div className="w-3.5 h-3.5 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-5 h-5 rounded-full bg-white/[0.06] animate-pulse" />
          </div>
          <div className="flex-1 px-2 pb-2 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse">
                <div className="w-full h-10 rounded-t bg-white/[0.03]" />
                <div className="px-2.5 py-2 space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
                  <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { BoardSkeleton };

export function KanbanBoard({
  content,
  campaigns,
  emailCampaigns,
  approvalItems,
  onCardClick,
  onCardMove,
}: KanbanBoardProps): JSX.Element {
  const [activeCard, setActiveCard] = useState<BoardCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const approvalContentIds = useMemo(
    () => new Set(approvalItems.filter((a) => a.contentId).map((a) => `content-${a.contentId}`)),
    [approvalItems],
  );

  /** Pending approvals already have a board card; skip duplicate content row for same id (avoids two tiles in Review). */
  const allCards = useMemo<BoardCardData[]>(() => {
    const pendingContentIds = new Set(
      approvalItems.map((a) => a.contentId).filter((id): id is string => Boolean(id)),
    );
    const cards: BoardCardData[] = [];
    content.forEach((c) => {
      if (pendingContentIds.has(c.id)) return;
      cards.push(contentToCard(c));
    });
    campaigns.forEach((c) => cards.push(campaignToCard(c)));
    emailCampaigns.forEach((e) => cards.push(emailToCard(e)));
    approvalItems.forEach((a) => cards.push(approvalToCard(a)));
    return cards;
  }, [content, campaigns, emailCampaigns, approvalItems]);

  const lanes = useMemo(() => {
    const grouped: Record<LaneId, BoardCardData[]> = {
      draft: [],
      review: [],
      ready: [],
      scheduled: [],
      live: [],
    };
    allCards.forEach((card) => {
      const lane = getLane(card, approvalContentIds);
      grouped[lane].push(card);
    });
    return grouped;
  }, [allCards, approvalContentIds]);

  const cardMap = useMemo(() => {
    const map = new Map<string, BoardCardData>();
    allCards.forEach((c) => map.set(c.id, c));
    return map;
  }, [allCards]);

  const findLaneForCard = useCallback(
    (cardId: string): LaneId | null => {
      for (const [laneId, cards] of Object.entries(lanes)) {
        if (cards.some((c) => c.id === cardId)) return laneId as LaneId;
      }
      return null;
    },
    [lanes],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const card = cardMap.get(String(event.active.id));
    setActiveCard(card ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const card = cardMap.get(cardId);
    if (!card) return;

    const fromLane = findLaneForCard(cardId);
    const toLane = LANE_CONFIG.some((l) => l.id === over.id)
      ? (over.id as LaneId)
      : findLaneForCard(String(over.id));

    if (!fromLane || !toLane || fromLane === toLane) return;

    onCardMove(cardId, fromLane, toLane, card);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2 flex-1 min-h-0 px-3 py-3 overflow-x-auto">
        {LANE_CONFIG.map((config) => (
          <Lane
            key={config.id}
            laneId={config.id}
            cards={lanes[config.id]}
            config={config}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCard && <BoardCardOverlay card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
