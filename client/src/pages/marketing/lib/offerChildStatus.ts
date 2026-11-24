export type OfferChildState = 'missing' | 'draft' | 'in_review' | 'approved';

export interface OfferChildInput {
  channel?: string | null;
  status?: string | null;
}

/** Map a stored status onto the four words the offer header uses. */
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

function stateFor(children: readonly OfferChildInput[], channel: string): OfferChildState {
  const match = children.find((child) => (child.channel ?? '').toLowerCase() === channel);
  return match ? offerChildState(match.status) : 'missing';
}

/** One line for the offer header. Approving one channel does not change the other word. */
export function offerChildStatusLine(children: readonly OfferChildInput[]): string {
  const instagram = stateFor(children, 'instagram').replace('_', ' ');
  const email = stateFor(children, 'email').replace('_', ' ');
  return `Instagram ${instagram} · Email ${email}`;
}

/** The queue opens the content row named on the item. */
export function approvalContentId(item: { contentId?: string | null }): string | null {
  const id = item.contentId?.trim();
  return id || null;
}
