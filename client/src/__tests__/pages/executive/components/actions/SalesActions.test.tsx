import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { SalesActions } from '@/pages/executive/components/actions/SalesActions';

const mockListDeals = vi.fn();

vi.mock('@/lib/api', () => ({
  crmAPI: {
    listDeals: (...args: unknown[]) => mockListDeals(...args),
    listPipelines: vi.fn().mockResolvedValue([]),
    getDealsByStage: vi.fn().mockResolvedValue({}),
    updateDeal: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('SalesActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no deals', async () => {
    mockListDeals.mockResolvedValue({ data: [] });
    render(<SalesActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no active deals/i)).toBeInTheDocument();
    });
  });

  it('renders deals with stage info', async () => {
    mockListDeals.mockResolvedValue({
      data: [
        { id: 'd1', title: 'Enterprise Deal', amount_eur: 50000, stage_name: 'Proposal', company_name: 'Acme Inc' },
        { id: 'd2', title: 'SMB Deal', amount_eur: 5000, stage_name: 'Discovery', owner_name: 'Alice' },
      ],
    });

    render(<SalesActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Enterprise Deal')).toBeInTheDocument();
      expect(screen.getByText('SMB Deal')).toBeInTheDocument();
      expect(screen.getByText(/Acme Inc/)).toBeInTheDocument();
    });
  });
});
