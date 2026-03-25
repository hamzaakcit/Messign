import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach } from 'vitest';
import { SupportActions } from '@/pages/executive/components/actions/SupportActions';

const mockListTickets = vi.fn();
const mockUpdateTicket = vi.fn().mockResolvedValue({});
const mockAssignTicket = vi.fn().mockResolvedValue({});

vi.mock('@/lib/api', () => ({
  supportApi: {
    listTickets: (...args: unknown[]) => mockListTickets(...args),
    updateTicket: (...args: unknown[]) => mockUpdateTicket(...args),
    assignTicket: (...args: unknown[]) => mockAssignTicket(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('SupportActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no open tickets', async () => {
    mockListTickets.mockResolvedValue({ data: [] });
    render(<SupportActions userId="u1" onSuccess={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no open tickets/i)).toBeInTheDocument();
    });
  });

  it('renders list of tickets with priority colors', async () => {
    mockListTickets.mockResolvedValue({
      data: [
        { id: 't1', subject: 'Login broken', priority: 'critical', status: 'open' },
        { id: 't2', subject: 'Slow page', priority: 'medium', status: 'open' },
      ],
    });

    render(<SupportActions userId="u1" onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Login broken')).toBeInTheDocument();
      expect(screen.getByText('Slow page')).toBeInTheDocument();
      expect(screen.getByText('critical')).toBeInTheDocument();
    });
  });

  it('resolves a ticket on close click', async () => {
    const onSuccess = vi.fn();
    mockListTickets.mockResolvedValue({
      data: [{ id: 't1', subject: 'Bug', priority: 'low', status: 'open' }],
    });

    render(<SupportActions userId="u1" onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Bug')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Resolve'));

    await waitFor(() => {
      expect(mockUpdateTicket).toHaveBeenCalledWith('u1', 't1', { status: 'resolved' });
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
