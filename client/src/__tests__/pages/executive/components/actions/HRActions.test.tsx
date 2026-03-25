import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { HRActions } from '@/pages/executive/components/actions/HRActions';

const mockList = vi.fn();
const mockMove = vi.fn().mockResolvedValue({});
const mockReject = vi.fn().mockResolvedValue({});

vi.mock('@/lib/api', () => ({
  recruitmentAPI: {
    listApplications: (...args: unknown[]) => mockList(...args),
    moveApplicationStage: (...args: unknown[]) => mockMove(...args),
    rejectApplication: (...args: unknown[]) => mockReject(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('HRActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no applications', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<HRActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no pending applications/i)).toBeInTheDocument();
    });
  });

  it('renders pending applications', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'a1', candidate_name: 'Charlie Rose', job_title: 'Senior Engineer', stage: 'screening', applied_at: '2026-01-01' },
      ],
    });

    render(<HRActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Charlie Rose')).toBeInTheDocument();
      expect(screen.getByText(/Senior Engineer/)).toBeInTheDocument();
    });
  });

  it('advances application stage', async () => {
    const onSuccess = vi.fn();
    mockList.mockResolvedValue({
      data: [{ id: 'a1', candidate_name: 'Alice', stage: 'screening' }],
    });

    render(<HRActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Advance'));

    await waitFor(() => {
      expect(mockMove).toHaveBeenCalledWith('u1', 'a1', 'interview');
    });
  });

  it('rejects application', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'a1', candidate_name: 'Bob', stage: 'applied' }],
    });

    render(<HRActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Reject'));

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('u1', 'a1', 'Rejected from command center');
    });
  });
});
