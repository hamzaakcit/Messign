/**
 * Partial approval. One child can be approved while its sibling stays in draft.
 */

export type OfferChildState = 'missing' | 'draft' | 'in_review' | 'approved';

export interface OfferChildRef {
  id: string;
  channel: string;
  status: string;
}

/** The only content row a human approval may change. */
export function approvedContentUpdate(contentId: string): { contentId: string; status: 'approved' } {
  return { contentId, status: 'approved' };
}

/**
 * Apply that update to a sibling list.
 * Every other child keeps the status it already had.
 */
export function statusesAfterApproving(
  children: readonly OfferChildRef[],
  approvedContentId: string,
): OfferChildRef[] {
  const update = approvedContentUpdate(approvedContentId);
  return children.map((child) =>
    child.id === update.contentId ? { ...child, status: update.status } : { ...child },
  );
}

/** Header word for one child. An absent row is `missing`. */
export function offerChildState(status: string | null | undefined): OfferChildState {
  const value = (status ?? '').toLowerCase();
  if (value === 'approved' || value === 'published' || value === 'scheduled' || value === 'ready') {
    return 'approved';
  }
  if (value === 'in_review' || value === 'pending_review' || value === 'ready_for_review') {
    return 'in_review';
  }
  if (!value) return 'missing';
  return 'draft';
}
