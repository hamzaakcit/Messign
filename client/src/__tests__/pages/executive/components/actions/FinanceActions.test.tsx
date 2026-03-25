import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { FinanceActions } from '@/pages/executive/components/actions/FinanceActions';

const mockApprove = vi.fn().mockResolvedValue({ success: true });
const mockReject = vi.fn().mockResolvedValue({ success: true });
const mockList = vi.fn();

vi.mock('@/lib/api', () => ({
  financeAPI: {
    listExpenses: (...args: unknown[]) => mockList(...args),
    approveExpense: (...args: unknown[]) => mockApprove(...args),
    rejectExpense: (...args: unknown[]) => mockReject(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('FinanceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no pending expenses', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<FinanceActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending expenses/i)).toBeInTheDocument();
    });
  });

  it('renders list of pending expenses', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'e1', title: 'Hotel Stay', original_amount: 250, original_currency: 'EUR', submitted_by_name: 'Alice', status: 'submitted' },
        { id: 'e2', title: 'Client Dinner', original_amount: 85, original_currency: 'EUR', submitted_by_name: 'Bob', status: 'submitted' },
      ],
    });

    render(<FinanceActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Hotel Stay')).toBeInTheDocument();
      expect(screen.getByText('Client Dinner')).toBeInTheDocument();
    });
  });

  it('calls approveExpense and removes item on approve', async () => {
    const onSuccess = vi.fn();
    mockList.mockResolvedValue({
      data: [{ id: 'e1', title: 'Lunch', original_amount: 20, status: 'submitted' }],
    });

    render(<FinanceActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Lunch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Approve'));

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('u1', 'e1');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('calls rejectExpense on reject', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'e1', title: 'Taxi', original_amount: 15, status: 'submitted' }],
    });

    render(<FinanceActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Taxi')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Reject'));

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('u1', 'e1', 'Rejected from command center');
    });
  });
});
