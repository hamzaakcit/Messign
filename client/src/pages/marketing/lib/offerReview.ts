import type { ContentItem } from '@/lib/marketingApi';

type Child = Pick<ContentItem, 'id' | 'body' | 'image_url' | 'status'>;

export interface OfferReviewAction {
  /** The child "Looks good" sends to review: the Instagram post, or the email when the offer has no post (cart). */
  targetId: string | null;
  label: 'Looks good' | 'In review';
  disabled: boolean;
  /** One line shown on hover when disabled. */
  reason: string | null;
}

/**
 * "Looks good" marks the offer's post for review. It does not schedule and does not post (MC-08), and it waits
 * until the still and the caption exist.
 */
export function offerReviewAction(instagram: Child | null, email: Child | null): OfferReviewAction {
  const target = instagram ?? email;
  if (!target) return { targetId: null, label: 'Looks good', disabled: true, reason: 'Nothing to review yet.' };
  if (target.status === 'in_review') return { targetId: target.id, label: 'In review', disabled: true, reason: 'Already sent to review.' };
  if (instagram) {
    if (!(instagram.image_url ?? '').trim() || !(instagram.body ?? '').trim()) {
      return { targetId: instagram.id, label: 'Looks good', disabled: true, reason: 'Waiting for the still and the caption.' };
    }
  } else if (!(target.body ?? '').trim()) {
    return { targetId: target.id, label: 'Looks good', disabled: true, reason: 'Waiting for the email text.' };
  }
  return { targetId: target.id, label: 'Looks good', disabled: false, reason: null };
}
