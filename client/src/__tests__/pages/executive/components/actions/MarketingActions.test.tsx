import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { MarketingActions } from '@/pages/executive/components/actions/MarketingActions';

const mockList = vi.fn();
const mockPause = vi.fn().mockResolvedValue({});
const mockLaunch = vi.fn().mockResolvedValue({});

vi.mock('@/lib/api', () => ({
  marketingAPI: {
    listCampaigns: (...args: unknown[]) => mockList(...args),
    pauseCampaign: (...args: unknown[]) => mockPause(...args),
    launchCampaign: (...args: unknown[]) => mockLaunch(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('MarketingActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no campaigns', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<MarketingActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no campaigns found/i)).toBeInTheDocument();
    });
  });

  it('renders campaigns with status badges', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Spring Sale', status: 'active', budget_eur: 5000, channel: 'email' },
        { id: 'c2', name: 'Summer Promo', status: 'paused', budget_eur: 3000, channel: 'social' },
      ],
    });

    render(<MarketingActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Spring Sale')).toBeInTheDocument();
      expect(screen.getByText('Summer Promo')).toBeInTheDocument();
    });
  });

  it('pauses an active campaign', async () => {
    const onSuccess = vi.fn();
    mockList.mockResolvedValue({
      data: [{ id: 'c1', name: 'Active Campaign', status: 'active', budget_eur: 1000 }],
    });

    render(<MarketingActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Active Campaign')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pause'));

    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledWith('u1', 'c1');
    });
  });

  it('launches a paused campaign', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'c1', name: 'Paused Campaign', status: 'paused', budget_eur: 2000 }],
    });

    render(<MarketingActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Paused Campaign')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Launch'));

    await waitFor(() => {
      expect(mockLaunch).toHaveBeenCalledWith('u1', 'c1');
    });
  });
});
