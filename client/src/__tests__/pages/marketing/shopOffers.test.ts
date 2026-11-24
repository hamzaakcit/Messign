import { describe, expect, it } from 'vitest';
import { offerMatchesShop, shopOfferRows } from '@/pages/marketing/lib/shopOffers';
import { contentSetupFor } from '@/pages/marketing/lib/contentTenant';
import type { ContentItem } from '@/lib/marketingApi';

function item(partial: Partial<ContentItem> & Pick<ContentItem, 'id'>): ContentItem {
  return {
    organization_id: null,
    campaign_id: null,
    title: partial.title ?? partial.id,
    body: null,
    type: 'social',
    channel: null,
    status: 'draft',
    created_by: null,
    created_at: '2026-11-14T00:00:00.000Z',
    updated_at: '2026-11-14T00:00:00.000Z',
    published_at: null,
    scheduled_for: null,
    ...partial,
  };
}

describe('shop offers', () => {
  it('keeps a book on Kitapyurdu and a feature on Messign', () => {
    const book = 'product: Kürk Mantolu Madonna';
    const dora = 'product: Dora';
    expect(offerMatchesShop(book, contentSetupFor('bookstore'))).toBe(true);
    expect(offerMatchesShop(book, contentSetupFor('messign'))).toBe(false);
    expect(offerMatchesShop(dora, contentSetupFor('florist'))).toBe(false);
    expect(offerMatchesShop(dora, contentSetupFor('bookstore'))).toBe(false);
    expect(offerMatchesShop(dora, contentSetupFor('messign'))).toBe(true);
  });

  it('joins the instagram child and names the step', () => {
    const rows = shopOfferRows(
      [
        item({
          id: 'offer-1',
          content_type: 'offer',
          title: 'Window',
          user_brief: 'product: Kürk Mantolu Madonna\nprice: ₺189',
          created_at: '2026-11-14T02:00:00.000Z',
        }),
        item({
          id: 'ig-1',
          parent_content_id: 'offer-1',
          channel: 'instagram',
          body: 'In the window',
          image_url: 'https://cdn.example/book.jpg',
        }),
      ],
      contentSetupFor('bookstore'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.product).toBe('Kürk Mantolu Madonna');
    expect(rows[0]?.price).toBe('₺189');
    expect(rows[0]?.step).toBe('Review');
    expect(rows[0]?.child?.id).toBe('ig-1');
  });
});
