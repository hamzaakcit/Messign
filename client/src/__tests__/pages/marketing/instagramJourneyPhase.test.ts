import { describe, expect, it } from 'vitest';
import { instagramJourneyPhase } from '@/pages/marketing/components/instagram/InstagramJourneyStrip';

describe('instagramJourneyPhase', () => {
  it('starts in writing when the draft is empty', () => {
    expect(instagramJourneyPhase({ body: '', imageUrl: null, status: 'draft' })).toBe('writing');
  });

  it('moves to image once a caption exists', () => {
    expect(instagramJourneyPhase({ body: 'Hook line', imageUrl: null, status: 'draft' })).toBe('image');
  });

  it('moves to review when caption and image are both present', () => {
    expect(
      instagramJourneyPhase({ body: 'Hook', imageUrl: 'https://cdn.example/a.png', status: 'draft' }),
    ).toBe('review');
  });

  it('treats in-review as ready', () => {
    expect(
      instagramJourneyPhase({ body: 'Hook', imageUrl: 'https://cdn.example/a.png', status: 'in_review' }),
    ).toBe('ready');
  });
});
