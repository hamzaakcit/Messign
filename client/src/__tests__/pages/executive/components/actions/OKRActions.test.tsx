import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { OKRActions } from '@/pages/executive/components/actions/OKRActions';

const mockListGoals = vi.fn();
const mockCheckIn = vi.fn().mockResolvedValue({});

vi.mock('@/lib/okrApi', () => ({
  listGoals: (...args: unknown[]) => mockListGoals(...args),
  checkIn: (...args: unknown[]) => mockCheckIn(...args),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', authUserId: 'u1' } };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('OKRActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no active goals', async () => {
    mockListGoals.mockResolvedValue([]);
    render(<OKRActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no active goals/i)).toBeInTheDocument();
    });
  });

  it('renders goals with status dots', async () => {
    mockListGoals.mockResolvedValue([
      {
        id: 'g1', title: 'Increase Revenue', status: 'on_track', progress: 60,
        key_results: [{ id: 'kr1', title: 'Close 10 deals', current_value: 6, target_value: 10 }],
      },
    ]);

    render(<OKRActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Increase Revenue')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
      expect(screen.getByText('Close 10 deals')).toBeInTheDocument();
    });
  });

  it('performs check-in on a key result', async () => {
    const onSuccess = vi.fn();
    mockListGoals.mockResolvedValue([
      {
        id: 'g1', title: 'Ship Feature', status: 'at_risk', progress: 30,
        key_results: [{ id: 'kr1', title: 'Complete 5 PRs', current_value: 2, target_value: 5 }],
      },
    ]);

    render(<OKRActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Ship Feature')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('2');
    fireEvent.change(input, { target: { value: '4' } });

    const checkInBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(checkInBtn);

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith('kr1', 4, 'Check-in from Command Center', undefined, 'u1');
    });
  });
});
