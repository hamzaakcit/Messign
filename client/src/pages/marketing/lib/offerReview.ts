import type { ContentItem } from '@/lib/marketingApi';

type Child = Pick<ContentItem, 'id' | 'body' | 'image_url' | 'status'>;

export interface OfferReviewAction {
  /** The child the action applies to: the Instagram post, or the email when the offer has no post (cart). */
  targetId: string | null;
  /** `review` sends to review; `approve` approves a post in review (approvers only). */
  kind: 'review' | 'approve';
  label: 'Looks good' | 'In review' | 'Approve' | 'Approved';
  disabled: boolean;
  /** One line shown on hover when disabled. */
  reason: string | null;
}

/**
 * The offer's one primary action. "Looks good" sends the post to review and never schedules or posts (MC-08); it
 * waits until the still and the caption exist. A post in review shows "Approve" to a manager or admin.
 */
export function offerReviewAction(instagram: Child | null, email: Child | null, canApprove = false): OfferReviewAction {
  const target = instagram ?? email;
  if (!target) return { targetId: null, kind: 'review', label: 'Looks good', disabled: true, reason: 'Nothing to review yet.' };
  const status = target.status ?? 'draft';
  if (status === 'approved' || status === 'scheduled' || status === 'published') {
    return { targetId: target.id, kind: 'approve', label: 'Approved', disabled: true, reason: 'Ready for the calendar.' };
  }
  if (status === 'in_review') {
    return canApprove
      ? { targetId: target.id, kind: 'approve', label: 'Approve', disabled: false, reason: null }
      : { targetId: target.id, kind: 'review', label: 'In review', disabled: true, reason: 'A manager or admin approves it.' };
  }
  if (instagram) {
    if (!(instagram.image_url ?? '').trim() || !(instagram.body ?? '').trim()) {
      return { targetId: instagram.id, kind: 'review', label: 'Looks good', disabled: true, reason: 'Waiting for the still and the caption.' };
    }
  } else if (!(target.body ?? '').trim()) {
    return { targetId: target.id, kind: 'review', label: 'Looks good', disabled: true, reason: 'Waiting for the email text.' };
  }
  return { targetId: target.id, kind: 'review', label: 'Looks good', disabled: false, reason: null };
}
