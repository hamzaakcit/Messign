import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { TimesheetActions } from '@/pages/executive/components/actions/TimesheetActions';

const mockList = vi.fn();
const mockApprove = vi.fn().mockResolvedValue({});
const mockReject = vi.fn().mockResolvedValue({});

vi.mock('@/lib/api', () => ({
  timeApi: {
    listTimesheets: (...args: unknown[]) => mockList(...args),
    approveTimesheet: (...args: unknown[]) => mockApprove(...args),
    rejectTimesheet: (...args: unknown[]) => mockReject(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('TimesheetActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no pending timesheets', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<TimesheetActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending timesheets/i)).toBeInTheDocument();
    });
  });

  it('renders pending timesheets', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'ts1', user_name: 'Alice', week_start_date: '2026-01-06', total_hours: 40, status: 'submitted' },
      ],
    });

    render(<TimesheetActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText(/40.0h/)).toBeInTheDocument();
    });
  });

  it('approves timesheet', async () => {
    const onSuccess = vi.fn();
    mockList.mockResolvedValue({
      data: [{ id: 'ts1', user_name: 'Bob', total_hours: 38, status: 'submitted' }],
    });

    render(<TimesheetActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Approve'));

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('u1', 'ts1');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('rejects timesheet', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'ts1', user_name: 'Charlie', total_hours: 20, status: 'submitted' }],
    });

    render(<TimesheetActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Reject'));

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('u1', 'ts1', 'Rejected from command center');
    });
  });
});
