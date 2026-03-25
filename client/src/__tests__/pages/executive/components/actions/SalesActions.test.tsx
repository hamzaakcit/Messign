import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { SalesActions } from '@/pages/executive/components/actions/SalesActions';

const mockListDeals = vi.fn();
const mockListPipelines = vi.fn();
const mockGetPipeline = vi.fn();
const mockMoveDealToStage = vi.fn();

vi.mock('@/lib/api', () => ({
  crmAPI: {
    listDeals: (...args: unknown[]) => mockListDeals(...args),
    listPipelines: (...args: unknown[]) => mockListPipelines(...args),
    getPipeline: (...args: unknown[]) => mockGetPipeline(...args),
    moveDealToStage: (...args: unknown[]) => mockMoveDealToStage(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('SalesActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no deals', async () => {
    mockListDeals.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <SalesActions userId="u1" onSuccess={vi.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/no active deals/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open full crm/i })).toHaveAttribute('href', '/crm');
    });
  });

  it('renders deals with stage info', async () => {
    mockListDeals.mockResolvedValue({
      data: [
        { id: 'd1', title: 'Enterprise Deal', amount_eur: 50000, stage_id: 'st1', stage_name: 'Lead', company_name: 'Acme Inc' },
        { id: 'd2', title: 'SMB Deal', amount_eur: 5000, stage_id: 'st1', stage_name: 'Lead', owner_name: 'Alice' },
      ],
    });

    render(
      <MemoryRouter>
        <SalesActions userId="u1" onSuccess={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Enterprise Deal')).toBeInTheDocument();
      expect(screen.getByText('SMB Deal')).toBeInTheDocument();
      expect(screen.getByText(/Acme Inc/)).toBeInTheDocument();
    });
  });

  it('advances deal using default pipeline and next stage id', async () => {
    mockListDeals.mockResolvedValue({
      data: [{ id: 'd1', title: 'Deal A', amount_eur: 1000, stage_id: 'st1', stage_name: 'Lead' }],
    });
    mockListPipelines.mockResolvedValue([
      { id: 'p-oth', name: 'Other', is_default: false },
      { id: 'p-def', name: 'Default', is_default: true },
    ]);
    mockGetPipeline.mockResolvedValue({
      stages: [
        { id: 'st1', name: 'Lead', position: 0 },
        { id: 'st2', name: 'Qualified', position: 1 },
      ],
    });

    render(
      <MemoryRouter>
        <SalesActions userId="u1" onSuccess={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Deal A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /advance/i }));

    await waitFor(() => {
      expect(mockGetPipeline).toHaveBeenCalledWith('u1', 'p-def');
      expect(mockMoveDealToStage).toHaveBeenCalledWith('u1', 'd1', 'st2');
    });
  });
});
