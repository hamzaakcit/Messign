import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, vi, beforeEach, expect } from 'vitest';
import { ChatDuelHub } from '@/components/chat/ChatDuelHub';

const duelMocks = vi.hoisted(() => ({
  mockSetDuelHubOpen: vi.fn(),
  mockRequestComposerInsert: vi.fn(),
  mockChatDuelRps: vi.fn().mockResolvedValue({
    you: 'paper',
    house: 'rock',
    outcome: 'win',
    headline: 'You win! House takes the chore.',
    taskHint: 'Create a task',
  }),
  mockChatDuelCoin: vi.fn().mockResolvedValue({
    call: 'tails',
    result: 'heads',
    youWin: false,
    headline: 'Missed',
    taskHint: 'hint',
  }),
  mockChatDuelChamber: vi.fn().mockResolvedValue({
    yourChamber: 3,
    dangerChamber: 1,
    hit: false,
    headline: 'Safe click',
    taskHint: 'hint',
  }),
  mockFetchAPI: vi.fn().mockResolvedValue({ id: 't1' }),
  mockAwardChatXP: vi.fn().mockResolvedValue({ amount: 5, total: 10 }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u-challenger' } };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      duelHubOpen: true,
      setDuelHubOpen: duelMocks.mockSetDuelHubOpen,
      activeChannelId: 'ch1',
      channels: [{ id: 'ch1', name: 'general', type: 'public', members: [], unreadCount: 0, createdAt: '' }],
      requestComposerInsert: duelMocks.mockRequestComposerInsert,
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/lib/api', () => ({
  chatAPI: {
    chatDuelRps: duelMocks.mockChatDuelRps,
    chatDuelCoin: duelMocks.mockChatDuelCoin,
    chatDuelChamber: duelMocks.mockChatDuelChamber,
    awardChatXP: duelMocks.mockAwardChatXP,
  },
  fetchAPI: duelMocks.mockFetchAPI,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

describe('ChatDuelHub — full duel flows (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RPS: rock triggers API and shows headline', async () => {
    render(<ChatDuelHub />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^rock$/i }));
    await waitFor(() => {
      expect(duelMocks.mockChatDuelRps).toHaveBeenCalledWith('ch1', 'rock');
    });
    await waitFor(() => {
      expect(screen.getByText(/You win/i)).toBeInTheDocument();
    });
  });

  it('Coin + Chamber tabs run APIs; Create task calls fetchAPI', async () => {
    render(<ChatDuelHub />);
    fireEvent.click(screen.getByRole('button', { name: 'Coin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Heads' }));
    await waitFor(() => {
      expect(duelMocks.mockChatDuelCoin).toHaveBeenCalledWith('ch1', 'heads');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Chamber' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: /Pull my chamber/i }));
    await waitFor(() => {
      expect(duelMocks.mockChatDuelChamber).toHaveBeenCalledWith('ch1', 3);
    });

    fireEvent.click(screen.getByRole('button', { name: 'RPS' }));
    fireEvent.click(screen.getByRole('button', { name: /^scissors$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Create task/i)).toBeInTheDocument();
    });
    const createButtons = screen.getAllByRole('button', { name: /Create task/i });
    fireEvent.click(createButtons[0]!);
    await waitFor(() => {
      expect(duelMocks.mockFetchAPI).toHaveBeenCalled();
    });
  });

  it('Share to composer calls requestComposerInsert after RPS', async () => {
    render(<ChatDuelHub />);
    fireEvent.click(screen.getByRole('button', { name: /^paper$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Share to composer/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Share to composer/i }));
    expect(duelMocks.mockRequestComposerInsert).toHaveBeenCalled();
  });
});
