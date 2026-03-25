import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach, expect } from 'vitest';

const mockCloseThread = vi.fn();
const mockSendThreadReply = vi.fn();
const mockFetchThreadDoraSummary = vi.fn();
const mockFetchThreadDoraActionItems = vi.fn();
const mockFetchThreadDoraDecisions = vi.fn();

const MOCK_PARENT_MSG = {
  id: 'parent-1', channelId: 'ch1', userId: 'u1', content: 'Parent message',
  attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(),
  reactions: [], isEdited: false, isPinned: false, metadata: {}, threadId: null, replyCount: 2,
};

const MOCK_REPLIES = [
  { id: 'reply-1', channelId: 'ch1', userId: 'u2', content: 'Reply one', attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(), reactions: [], threadId: 'parent-1', replyCount: 0 },
  { id: 'reply-2', channelId: 'ch1', userId: 'u1', content: 'Reply two', attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(), reactions: [], threadId: 'parent-1', replyCount: 0 },
];

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      activeThreadId: 'parent-1',
      threadMessages: MOCK_REPLIES,
      threadLoading: false,
      closeThread: mockCloseThread,
      sendThreadReply: mockSendThreadReply,
      fetchThreadDoraSummary: mockFetchThreadDoraSummary,
      fetchThreadDoraActionItems: mockFetchThreadDoraActionItems,
      fetchThreadDoraDecisions: mockFetchThreadDoraDecisions,
      threadDoraSummary: null,
      threadDoraActionItems: null,
      threadDoraDecisions: null,
      threadDoraSummaryLoading: false,
      threadDoraActionItemsLoading: false,
      threadDoraDecisionsLoading: false,
      messages: { ch1: [MOCK_PARENT_MSG] },
      activeChannelId: 'ch1',
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', name: 'Alice', avatar: '' } };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/usersStore', () => ({
  useUsersStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      users: [
        { id: 'u1', name: 'Alice', avatar: '', status: 'online' },
        { id: 'u2', name: 'Bob', avatar: '', status: 'online' },
      ],
    };
    return sel ? sel(state) : state;
  }),
}));

describe('ThreadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders parent message and replies', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    expect(screen.getByText('Thread')).toBeInTheDocument();
    expect(screen.getByText('Parent message')).toBeInTheDocument();
    expect(screen.getByText('Reply one')).toBeInTheDocument();
    expect(screen.getByText('Reply two')).toBeInTheDocument();
    expect(screen.getByText('2 replies')).toBeInTheDocument();
  });

  it('close button calls closeThread', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    const closeBtn = screen.getByRole('button', { name: /close thread/i });
    fireEvent.click(closeBtn);
    expect(mockCloseThread).toHaveBeenCalled();
  });

  it('reply input is rendered with placeholder', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    expect(screen.getByPlaceholderText('Reply in thread...')).toBeInTheDocument();
  });

  it('typing and pressing Enter calls sendThreadReply', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    const input = screen.getByPlaceholderText('Reply in thread...');
    fireEvent.change(input, { target: { value: 'My reply' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(mockSendThreadReply).toHaveBeenCalledWith('My reply', 'u1', 'parent-1');
  });

  it('Summarize thread calls fetchThreadDoraSummary with channel and parent id', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /summarize this thread/i }));
    expect(mockFetchThreadDoraSummary).toHaveBeenCalledWith('ch1', 'parent-1');
  });

  it('Actions button calls fetchThreadDoraActionItems', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /find action items in thread/i }));
    expect(mockFetchThreadDoraActionItems).toHaveBeenCalledWith('ch1', 'parent-1');
  });

  it('Decisions button calls fetchThreadDoraDecisions', async () => {
    const { ThreadPanel } = await import('@/components/chat/ThreadPanel');
    render(<MemoryRouter><ThreadPanel /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /extract decisions from thread/i }));
    expect(mockFetchThreadDoraDecisions).toHaveBeenCalledWith('ch1', 'parent-1');
  });
});
