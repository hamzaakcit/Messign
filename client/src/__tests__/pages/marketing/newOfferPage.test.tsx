import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewOfferPage } from '@/pages/marketing/NewOfferPage';

const { createInstagramOfferPair, openDetail, createCampaign } = vi.hoisted(() => ({
  createInstagramOfferPair: vi.fn(),
  openDetail: vi.fn(),
  createCampaign: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: { user: { authUserId: string; id: string } }) => unknown) => {
    const state = { user: { authUserId: 'user-1', id: 'user-1' } };
    return selector ? selector(state) : state;
  },
}));

// One object for every render, as the real provider's memoised value is: a fresh object each time would rebuild
// every callback that lists it and hide a stale closure.
const { context } = vi.hoisted(() => ({
  context: { openDetail, campaigns: [{ id: 'c-spring', name: 'Spring Sale' }], invalidateWorkspace: vi.fn() },
}));
vi.mock('@/pages/marketing/MarketingContext', () => ({
  useMarketingContext: () => context,
}));

vi.mock('@/pages/marketing/lib/createInstagramOfferPair', () => ({
  createInstagramOfferPair: (...args: unknown[]) => createInstagramOfferPair(...args),
}));

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    uploadLucyReferenceImage: vi.fn(),
    createCampaign: (...args: unknown[]) => createCampaign(...args),
  },
}));

function renderOffer(): void {
  sessionStorage.setItem('messign.contentTenant', 'bookstore');
  render(
    <MemoryRouter>
      <NewOfferPage />
    </MemoryRouter>,
  );
}

describe('new offer steps', () => {
  beforeEach(() => {
    createInstagramOfferPair.mockReset();
    openDetail.mockReset();
    createCampaign.mockReset();
    createCampaign.mockResolvedValue({ id: 'c-new' });
    createInstagramOfferPair.mockResolvedValue({
      offer: { id: 'offer-1' },
      child: { id: 'ig-1' },
      email: null,
    });
  });

  it('does not leave a product drop until a product is picked', () => {
    renderOffer();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('product: Pick a product from this org’s truth sheet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Materials')).not.toBeInTheDocument();
  });

  it('saves a draft on Looks good and does not ask Lucy', async () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('scene-line').textContent).not.toContain('₺');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText(/Topic/), { target: { value: 'Window drop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
    await waitFor(() => expect(createInstagramOfferPair).toHaveBeenCalled());
    const input = createInstagramOfferPair.mock.calls[0]?.[1] as { userBrief: string; campaignId: string | null };
    expect(input.userBrief).toContain('product: Kürk Mantolu Madonna');
    expect(input.userBrief).toContain('₺189');
    expect(input.campaignId).toBeNull();
    expect(createCampaign).not.toHaveBeenCalled();
    expect(screen.getByText(/does not schedule or post/)).toBeInTheDocument();
  });

  const saveWithCampaign = async (name: string): Promise<void> => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.change(screen.getByLabelText(/^Campaign/), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText(/Topic/), { target: { value: 'Window drop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(`Campaign: ${name}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
    await waitFor(() => expect(createInstagramOfferPair).toHaveBeenCalled());
  };

  it('names the offer under a campaign that exists, without making a new one', async () => {
    await saveWithCampaign('spring sale');
    expect((createInstagramOfferPair.mock.calls[0]?.[1] as { campaignId: string }).campaignId).toBe('c-spring');
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it('makes a campaign from a new name on the offer, with no create-campaign step', async () => {
    await saveWithCampaign('Teachers Day');
    expect(createCampaign).toHaveBeenCalledWith('user-1', { name: 'Teachers Day', channel: 'other' });
    expect((createInstagramOfferPair.mock.calls[0]?.[1] as { campaignId: string }).campaignId).toBe('c-new');
  });

  it('gives an email-only offer no Picture step: four steps, and Next goes straight to the words', () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Recipe/), { target: { value: 'cart' } });
    const steps = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps()).toEqual(['Product', 'Words', 'Preview', 'Looks good']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText(/Topic/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Reference photo')).not.toBeInTheDocument();
    expect(screen.queryByText(/saves the email only/)).not.toBeInTheDocument();
    // Back from Words returns to Product, not to a step that is not there.
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByLabelText(/^Recipe/)).toBeInTheDocument();
  });

  it('keeps the Picture step for an offer with a post', () => {
    renderOffer();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Product', 'Picture', 'Words', 'Preview', 'Looks good']);
  });

  it('calls the direction field what it is: for the email when there is no caption', () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Recipe/), { target: { value: 'cart' } });
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Direction for the email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Caption direction')).not.toBeInTheDocument();
  });

  it('saves the tone with the intent, so it reaches the caption writer', async () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText(/Topic/), { target: { value: 'Window drop: new week' } });
    fireEvent.change(screen.getByLabelText('Tone'), { target: { value: 'quiet and literary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
    await waitFor(() => expect(createInstagramOfferPair).toHaveBeenCalled());
    const brief = (createInstagramOfferPair.mock.calls[0]?.[1] as { userBrief: string }).userBrief;
    expect(brief.split('\n')[0]).toBe('Window drop: new week');
    expect(brief.split('\n')[1]).toBe('Tone: quiet and literary');
  });

  it('opens the scene with the look on the picture step', () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText(/^Look/), { target: { value: 'editorial' } });
    expect(screen.getByTestId('scene-line')).toHaveTextContent(
      'Editorial photograph of a novel in the shop window, titled Kürk Mantolu Madonna, at Karaköy kitapçı vitrini. No letters, numbers, or logos.',
    );
    expect(screen.getByText(/Ultra keeps what is inside this photo/)).toBeInTheDocument();
  });

  it('clears a product that is not on the shop', () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    render(
      <MemoryRouter>
        <NewOfferPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Dora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Materials')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'bookstore' } });
    expect(screen.getByLabelText(/^Product/)).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Dora' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Materials')).not.toBeInTheDocument();
  });
});
