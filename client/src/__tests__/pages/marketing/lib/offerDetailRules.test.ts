import { describe, expect, it } from 'vitest';
import { offerReviewAction } from '@/pages/marketing/lib/offerReview';
import { journeyEmailSummary } from '@/pages/marketing/lib/journeyEmailSummary';

const post = { id: 'ig', body: 'Caption', image_url: 'https://cdn/x.png', status: 'draft' };
const mail = { id: 'em', body: 'SUBJECT: Hi\nUnsubscribe: {{unsubscribe_url}}', image_url: null, status: 'draft' };

describe('offerReviewAction', () => {
  it('sends the Instagram post to review when the still and caption exist', () => {
    expect(offerReviewAction(post, mail)).toEqual({ targetId: 'ig', label: 'Looks good', disabled: false, reason: null });
  });

  it('waits for the still and the caption', () => {
    expect(offerReviewAction({ ...post, image_url: '' }, mail)).toMatchObject({ disabled: true, reason: 'Waiting for the still and the caption.' });
    expect(offerReviewAction({ ...post, body: ' ' }, null)).toMatchObject({ disabled: true });
  });

  it('reviews the email when the offer has no post (cart)', () => {
    expect(offerReviewAction(null, mail)).toMatchObject({ targetId: 'em', disabled: false });
    expect(offerReviewAction(null, { ...mail, body: '' })).toMatchObject({ disabled: true, reason: 'Waiting for the email text.' });
  });

  it('shows "In review" once sent, and nothing to review without children', () => {
    expect(offerReviewAction({ ...post, status: 'in_review' }, null)).toMatchObject({ label: 'In review', disabled: true });
    expect(offerReviewAction(null, null)).toMatchObject({ targetId: null, disabled: true });
  });
});

describe('journeyEmailSummary', () => {
  it('reads the lines the server drafts', () => {
    const body = ['SUBJECT: Papatya buketi', 'PREVIEW: Bu hafta', 'Product: Papatya buketi', 'Price: ₺450', 'Window: 2026-11-16..2026-11-22', 'Unsubscribe: {{unsubscribe_url}}'].join('\n');
    expect(journeyEmailSummary({ title: 'x', body })).toEqual({
      subject: 'Papatya buketi',
      product: 'Papatya buketi',
      price: '₺450',
      window: '2026-11-16..2026-11-22',
      hasUnsubscribe: true,
    });
  });

  it('falls back to the title and flags a missing opt-out line', () => {
    expect(journeyEmailSummary({ title: 'Window drop', body: 'Product: Book' })).toMatchObject({ subject: 'Window drop', hasUnsubscribe: false });
    expect(journeyEmailSummary({ title: 't', body: 'Abonelikten çık: link' }).hasUnsubscribe).toBe(true);
  });
});
