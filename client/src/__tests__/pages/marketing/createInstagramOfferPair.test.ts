import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInstagramOfferPair } from '@/pages/marketing/lib/createInstagramOfferPair';

const createContent = vi.fn();
const draftJourneyEmail = vi.fn();
const associateBrandWithContent = vi.fn();

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    createContent: (...args: unknown[]) => createContent(...args),
    draftJourneyEmail: (...args: unknown[]) => draftJourneyEmail(...args),
    associateBrandWithContent: (...args: unknown[]) => associateBrandWithContent(...args),
  },
}));

describe('createInstagramOfferPair', () => {
  beforeEach(() => {
    createContent.mockReset();
    draftJourneyEmail.mockReset();
    associateBrandWithContent.mockReset();
    associateBrandWithContent.mockResolvedValue({ success: true });
    draftJourneyEmail.mockResolvedValue({ id: 'email-1', channel: 'email', parent_content_id: 'offer-1' });
  });

  it('creates one Instagram post and one email for a product drop', async () => {
    createContent
      .mockResolvedValueOnce({ id: 'offer-1', title: 'Launch' })
      .mockResolvedValueOnce({ id: 'child-1', title: 'Launch', parent_content_id: 'offer-1', channel: 'instagram' });

    const pair = await createInstagramOfferPair('user-1', {
      topic: 'Launch',
      format: 'story',
      brandProfileId: 'brand-1',
    });

    expect(pair.offer.id).toBe('offer-1');
    expect(pair.child?.id).toBe('child-1');
    expect(pair.email?.id).toBe('email-1');
    expect(createContent).toHaveBeenCalledTimes(2);
    expect(createContent).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({
        channel: 'instagram',
        parent_content_id: 'offer-1',
      }),
    );
    expect(draftJourneyEmail).toHaveBeenCalledWith('user-1', 'offer-1');
    const instagramCreates = createContent.mock.calls.filter(
      (call) => (call[1] as { channel?: string }).channel === 'instagram',
    );
    expect(instagramCreates).toHaveLength(1);
  });

  it('creates zero Instagram rows for a cart reminder', async () => {
    createContent.mockResolvedValueOnce({ id: 'offer-1', title: 'Cart' });

    const pair = await createInstagramOfferPair('user-1', {
      topic: 'Cart',
      recipe: 'cart',
    });

    expect(pair.child).toBeNull();
    expect(pair.email?.id).toBe('email-1');
    expect(createContent).toHaveBeenCalledTimes(1);
    expect(createContent).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        content_type: 'offer',
        tags: ['recipe:cart', 'ig_format:feed'],
      }),
    );
    expect(draftJourneyEmail).toHaveBeenCalledWith('user-1', 'offer-1');
    const instagramCreates = createContent.mock.calls.filter(
      (call) => (call[1] as { channel?: string }).channel === 'instagram',
    );
    expect(instagramCreates).toHaveLength(0);
  });

  it('tags a mock image draft so generation skips the provider', async () => {
    createContent.mockResolvedValueOnce({ id: 'offer-1', title: 'Launch' });
    await createInstagramOfferPair('user-1', {
      topic: 'Launch',
      recipe: 'cart',
      mockImage: true,
    });
    expect(createContent).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        tags: ['recipe:cart', 'ig_format:feed', 'image_gen:mock'],
      }),
    );
  });
});
