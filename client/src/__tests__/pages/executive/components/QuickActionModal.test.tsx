import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  financeAPI: { listExpenses: vi.fn().mockResolvedValue({ data: [] }), approveExpense: vi.fn(), rejectExpense: vi.fn() },
  crmAPI: { listDeals: vi.fn().mockResolvedValue({ data: [] }), listPipelines: vi.fn().mockResolvedValue([]), getDealsByStage: vi.fn().mockResolvedValue({}), updateDeal: vi.fn() },
  supportApi: { listTickets: vi.fn().mockResolvedValue({ data: [] }), updateTicket: vi.fn(), assignTicket: vi.fn() },
  marketingAPI: { listCampaigns: vi.fn().mockResolvedValue({ data: [] }), pauseCampaign: vi.fn(), launchCampaign: vi.fn() },
  recruitmentAPI: { listApplications: vi.fn().mockResolvedValue({ data: [] }), moveApplicationStage: vi.fn(), rejectApplication: vi.fn() },
}));

vi.mock('@/lib/okrApi', () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  checkIn: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', authUserId: 'u1' } };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { QuickActionModal } from '@/pages/executive/components/QuickActionModal';

function renderModal(ui: ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('QuickActionModal', () => {
  const baseProps = {
    onClose: vi.fn(),
    onDataChanged: vi.fn(),
    userId: 'u1',
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns null when department is null', () => {
    const { container } = renderModal(<QuickActionModal {...baseProps} department={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders Finance Actions modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="finance" />);
    expect(screen.getByText('Finance Actions')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no pending expenses/i)).toBeInTheDocument();
    });
  });

  it('renders Sales Pipeline modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="sales" />);
    expect(screen.getByText('Sales Pipeline')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no active deals/i)).toBeInTheDocument();
    });
  });

  it('renders Support Tickets modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="support" />);
    expect(screen.getByText('Support Tickets')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no open tickets/i)).toBeInTheDocument();
    });
  });

  it('renders Marketing Campaigns modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="marketing" />);
    expect(screen.getByText('Marketing Campaigns')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no campaigns found/i)).toBeInTheDocument();
    });
  });

  it('renders Applications Review modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="hr" />);
    expect(screen.getByText('Applications Review')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no pending applications/i)).toBeInTheDocument();
    });
  });

  it('renders OKR Check-in modal with empty state', async () => {
    renderModal(<QuickActionModal {...baseProps} department="okr" />);
    expect(screen.getByText('OKR Check-in')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/no active goals/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when modal close is triggered', () => {
    renderModal(<QuickActionModal {...baseProps} department="finance" />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });
});
