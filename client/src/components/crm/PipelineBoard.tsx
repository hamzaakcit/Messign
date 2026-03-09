import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI } from '@/lib/crmApi';
import type { Deal, DealStage } from '@/lib/crmApi';
import { PipelineColumn } from './PipelineColumn';
import { DealCard } from './DealCard';

interface PipelineBoardProps {
  stages: DealStage[];
  dealsByStage: Map<string, Deal[]>;
  onDealsChange: (updated: Map<string, Deal[]>) => void;
  onRefetch: () => void;
  onDealClick?: (deal: Deal) => void;
}

export function PipelineBoard({
  stages,
  dealsByStage,
  onDealsChange,
  onRefetch,
  onDealClick,
}: PipelineBoardProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId ?? user?.id ?? '';
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findDealById = useCallback(
    (dealId: string): Deal | undefined => {
      for (const deals of dealsByStage.values()) {
        const found = deals.find(d => d.id === dealId);
        if (found) return found;
      }
      return undefined;
    },
    [dealsByStage],
  );

  const findStageForDeal = useCallback(
    (dealId: string): string | undefined => {
      for (const [stageId, deals] of dealsByStage.entries()) {
        if (deals.some(d => d.id === dealId)) return stageId;
      }
      return undefined;
    },
    [dealsByStage],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const deal = findDealById(event.active.id as string);
    if (deal) setActiveDeal(deal);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over || !userId) return;

    const dealId = active.id as string;
    const overId = over.id as string;

    const sourceStageId = findStageForDeal(dealId);
    if (!sourceStageId) return;

    let targetStageId: string | undefined;

    if (stages.some(s => s.id === overId)) {
      targetStageId = overId;
    } else {
      targetStageId = findStageForDeal(overId);
    }

    if (!targetStageId || targetStageId === sourceStageId) return;

    const deal = findDealById(dealId);
    if (!deal) return;

    const prev = new Map(dealsByStage);
    const sourceDeals = [...(prev.get(sourceStageId) ?? [])];
    const targetDeals = [...(prev.get(targetStageId) ?? [])];

    const idx = sourceDeals.findIndex(d => d.id === dealId);
    if (idx !== -1) sourceDeals.splice(idx, 1);
    targetDeals.push({ ...deal, stage_id: targetStageId });

    const next = new Map(prev);
    next.set(sourceStageId, sourceDeals);
    next.set(targetStageId, targetDeals);
    onDealsChange(next);

    try {
      await crmAPI.moveDealToStage(userId, dealId, targetStageId);
      onRefetch();
    } catch (err) {
      onDealsChange(prev);
      toast.error(err instanceof Error ? err.message : 'Failed to move deal');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-0 flex-1">
        {stages.map(stage => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            deals={dealsByStage.get(stage.id) ?? []}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
