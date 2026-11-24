import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewOfferPage } from '@/pages/marketing/NewOfferPage';

const { createInstagramOfferPair, openDetail } = vi.hoisted(() => ({
  createInstagramOfferPair: vi.fn(),
  openDetail: vi.fn(),
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

vi.mock('@/pages/marketing/MarketingContext', () => ({
  useMarketingContext: () => ({ openDetail }),
}));

vi.mock('@/pages/marketing/lib/createInstagramOfferPair', () => ({
  createInstagramOfferPair: (...args: unknown[]) => createInstagramOfferPair(...args),
}));

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    uploadLucyReferenceImage: vi.fn(),
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

  it('saves a draft on Looks good and does not ask Lucy', () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Product/), { target: { value: 'Kürk Mantolu Madonna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('scene-line').textContent).not.toContain('₺');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText(/Topic/), { target: { value: 'Window drop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
    expect(createInstagramOfferPair).toHaveBeenCalled();
    const brief = (createInstagramOfferPair.mock.calls[0]?.[1] as { userBrief: string }).userBrief;
    expect(brief).toContain('product: Kürk Mantolu Madonna');
    expect(brief).toContain('₺189');
    expect(screen.getByText(/does not schedule or post/)).toBeInTheDocument();
  });

  it('lets a cart reminder skip the picture', () => {
    renderOffer();
    fireEvent.change(screen.getByLabelText(/^Recipe/), { target: { value: 'cart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/saves the email only/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Reference photo')).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/Content tenant/), { target: { value: 'bookstore' } });
    expect(screen.getByLabelText(/^Product/)).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Dora' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Materials')).not.toBeInTheDocument();
  });
});
