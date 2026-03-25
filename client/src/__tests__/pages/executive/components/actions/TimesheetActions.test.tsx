import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { TimesheetActions } from '@/pages/executive/components/actions/TimesheetActions';

const mockGetPendingItems = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();

vi.mock('@/lib/executiveApi', () => ({
  executiveAPI: {
    getPendingItems: (...args: unknown[]) => mockGetPendingItems(...args),
    approveTimesheet: (...args: unknown[]) => mockApprove(...args),
    rejectTimesheet: (...args: unknown[]) => mockReject(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('TimesheetActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no pending timesheets', async () => {
    mockGetPendingItems.mockResolvedValue({ timesheets: [] });
    render(<TimesheetActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending timesheets/i)).toBeInTheDocument();
    });
  });

  it('approves a timesheet', async () => {
    mockGetPendingItems.mockResolvedValue({
      timesheets: [
        { id: 'ts1', userName: 'Alice', period: '2026-03-17', totalHours: 40, submittedAt: new Date().toISOString() },
      ],
    });
    mockApprove.mockResolvedValue({});

    render(<TimesheetActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Approve'));
    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('u1', 'ts1');
    });
  });
});
