import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { marketingAPI } from '@/lib/marketingApi';
import { ContentDetailPanel } from '@/pages/marketing/components/ContentDetailPanel';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { authUserId: 'user-1', id: 'user-1' } }),
}));

vi.mock('@/pages/marketing/MarketingContext', () => ({
  useMarketingContext: () => ({ openDetail: vi.fn() }),
}));

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    getContent: vi.fn(async (_userId: string, id: string) => {
      if (id === 'offer-1') {
        return {
          id: 'offer-1',
          organization_id: null,
          campaign_id: null,
          title: 'Window drop',
          body: null,
          type: 'social',
          content_type: 'offer',
          channel: 'internal',
          status: 'draft',
          created_by: 'user-1',
          created_at: '2026-11-14T00:00:00.000Z',
          updated_at: '2026-11-14T00:00:00.000Z',
          published_at: null,
          scheduled_for: null,
          user_brief: [
            'Window drop',
            '',
            'product: Kürk Mantolu Madonna',
            'materials: A novel in the shop window.',
            'place: Karaköy kitapçı vitrini',
            'price: ₺189',
            'style: editorial',
          ].join('\n'),
        };
      }
      return {
      id: 'child-1',
      organization_id: null,
      campaign_id: null,
      title: 'Window drop',
      body: 'The novel is in the window.',
      type: 'social',
      channel: 'instagram',
      status: 'draft',
      created_by: 'user-1',
      created_at: '2026-11-14T00:00:00.000Z',
      updated_at: '2026-11-14T00:00:00.000Z',
      published_at: null,
      scheduled_for: null,
      image_url: 'https://cdn.example/still.png',
      user_brief: [
        'Window drop',
        '',
        'product: Kürk Mantolu Madonna',
        'materials: A novel in the shop window.',
        'place: Karaköy kitapçı vitrini',
        'in_frame: the closed book standing face-out in the glass',
        'keep_out: people, flowers, a crown, letters',
        'price: ₺189',
        'claim: Bu hafta vitrinde',
      ].join('\n'),
      image_generation_metadata: {
        fal_returned_prompt: 'Photorealistic photograph of Kürk Mantolu Madonna at Karaköy kitapçı vitrini, returned.',
      },
      tags: ['recipe:product_drop', 'ig_format:feed'],
    };
    }),
    listContent: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'child-1',
          channel: 'instagram',
          parent_content_id: 'offer-1',
          body: 'The novel is in the window.',
          image_url: 'https://cdn.example/still.png',
          title: 'Window drop',
          status: 'draft',
        },
      ],
    }),
    updateContent: vi.fn().mockResolvedValue({}),
    draftJourneyEmail: vi.fn().mockResolvedValue({ id: 'email-1' }),
    regenerateContentImage: vi.fn().mockResolvedValue({
      success: true,
      image_url: 'https://cdn.example/still.png',
      error: null,
    }),
    instagramPublishMode: vi.fn().mockResolvedValue({ mode: 'mock' }),
    getInstagramConnection: vi.fn().mockResolvedValue({ connected: false, accountId: null, username: null }),
  },
}));

describe('offer sheet on the detail panel', () => {
  it('shows the sheet product and the prompt Fal returned', async () => {
    render(<ContentDetailPanel contentId="child-1" onUpdated={() => undefined} />);
    const sheet = await screen.findByTestId('offer-sheet-detail');
    expect(sheet).toHaveTextContent('Product: Kürk Mantolu Madonna');
    expect(sheet).toHaveTextContent(
      'Scene sent to Fal: Photorealistic photograph of a novel in the shop window, titled Kürk Mantolu Madonna, at Karaköy kitapçı vitrini. In frame: the closed book standing face-out in the glass. Keep out: people, flowers, a crown, letters. No letters, numbers, or logos.',
    );
    expect(sheet.textContent?.split('Scene sent to Fal:')[1]?.split('Prompt Fal returned')[0]).not.toContain('₺');
    expect(sheet).toHaveTextContent(
      'Prompt Fal returned: Photorealistic photograph of Kürk Mantolu Madonna at Karaköy kitapçı vitrini, returned.',
    );
  });

  it('opens an offer as the still and the caption', async () => {
    render(<ContentDetailPanel contentId="offer-1" onUpdated={() => undefined} />);
    const detail = await screen.findByTestId('offer-detail');
    expect(detail).toHaveTextContent('Kürk Mantolu Madonna');
    expect(detail).toHaveTextContent('The novel is in the window.');
    expect(detail.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/still.png');
    expect(screen.queryByRole('button', { name: 'Hashtags' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Timing' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Engagement Score/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Access token/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('publish-off')).toBeInTheDocument();
    expect(screen.getByTestId('scene-line')).toHaveTextContent(
      'Editorial photograph of a novel in the shop window, titled Kürk Mantolu Madonna, at Karaköy kitapçı vitrini. No letters, numbers, or logos.',
    );
    expect(screen.getByText('Look: Editorial')).toBeInTheDocument();
    expect(screen.queryByText('Reference photo attached')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(marketingAPI.regenerateContentImage).toHaveBeenCalledWith(
      'user-1',
      'child-1',
      expect.objectContaining({
        style_preset: 'editorial',
        image_prompt:
          'Editorial photograph of a novel in the shop window, titled Kürk Mantolu Madonna, at Karaköy kitapçı vitrini. No letters, numbers, or logos.',
      }),
    );
  });

  it('has one primary action that sends the post to review, and the rest under the menu', async () => {
    render(<ContentDetailPanel contentId="offer-1" onUpdated={() => undefined} />);
    await screen.findByTestId('offer-detail');
    const looksGood = await screen.findByRole('button', { name: 'Looks good' });
    expect(looksGood).toBeEnabled();
    fireEvent.click(looksGood);
    expect(marketingAPI.updateContent).toHaveBeenCalledWith('user-1', 'child-1', { submit_for_review: true });
    expect(marketingAPI.scheduleContent).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Open Instagram post' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Open email' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Draft journey email' }));
    expect(marketingAPI.draftJourneyEmail).toHaveBeenCalledWith('user-1', 'offer-1');
  });

  it('shows the journey email on the offer without opening the builder', async () => {
    vi.mocked(marketingAPI.listContent).mockResolvedValueOnce({
      data: [
        { id: 'child-1', channel: 'instagram', parent_content_id: 'offer-1', body: 'The novel is in the window.', image_url: 'https://cdn.example/still.png', title: 'Window drop', status: 'draft' },
        {
          id: 'email-1', channel: 'email', parent_content_id: 'offer-1', title: 'Window drop', status: 'draft',
          body: 'SUBJECT: Kürk Mantolu Madonna vitrinde\nProduct: Kürk Mantolu Madonna\nPrice: ₺189\nUnsubscribe: {{unsubscribe_url}}',
        },
      ],
    } as never);
    render(<ContentDetailPanel contentId="offer-1" onUpdated={() => undefined} />);
    const block = await screen.findByTestId('journey-email');
    expect(block).toHaveTextContent('Kürk Mantolu Madonna vitrinde');
    expect(block).toHaveTextContent('₺189');
    expect(screen.getByTestId('journey-email-unsubscribe')).toHaveTextContent('Included');
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Open email' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Draft journey email' })).not.toBeInTheDocument();
  });
});
