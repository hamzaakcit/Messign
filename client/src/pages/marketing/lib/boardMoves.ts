import type { LaneId } from '../components/KanbanBoard';
import type { BoardCardData } from '../components/BoardCard';

export type BoardMove = 'submit_for_review' | 'approve' | null;

/** The pipeline only allows moves that change real state; anything else is refused with a message. */
export function boardMove(fromLane: LaneId, toLane: LaneId, card: Pick<BoardCardData, 'type'>): BoardMove {
  if (fromLane === 'draft' && toLane === 'review' && card.type === 'content') return 'submit_for_review';
  if (fromLane === 'review' && toLane === 'ready' && card.type === 'approval') return 'approve';
  return null;
}

export function refusedMoveMessage(toLane: LaneId): string {
  if (toLane === 'live') return 'Posts go live from the calendar, not by dragging.';
  if (toLane === 'scheduled') return 'Pick a day in the calendar to schedule this.';
  return 'This card can’t move there.';
}
