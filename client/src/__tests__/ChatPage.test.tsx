import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach, expect } from 'vitest';
import { ChatV2Layout } from '@/pages/chat/ChatV2Layout';

const MOCK_USER = {
  id: 'u1', authUserId: 'u1', email: 'admin@test.com', name: 'Admin',
  role: 'admin', level: 1, xp: 0, xpToNextLevel: 100,
  avatar: '', jobTitle: '', department: '', joinedAt: '',
  badges: [], stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online' as const,
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  ADMIN_MESSAGES_CHANNEL_ID: '__admin_messages__',
  useChatStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      channels: [],
      activeChannelId: null,
      messages: {},
      typingUsers: {},
      isLoading: false,
      chatError: null,
      detailPanelOpen: false,
      detailTab: 'members',
      pinnedMessages: {},
      channelMedia: {},
      doraSummary: null,
      doraActionItems: null,
      doraSuggestions: {},
      doraLoading: false,
      doraPanelOpen: false,
      smartReplies: null,
      smartReplyLoading: false,
      searchQuery: '',
      searchResults: [],
      searchOpen: false,
      searchLoading: false,
      searchError: null,
      universalSearchResults: null,
      universalSearchLoading: false,
      universalSearchError: null,
      universalSearchTab: 'all',
      mobileSidebarOpen: false,
      channelCreateOpen: false,
      duelHubOpen: false,
      channelRailCollapsed: false,
      chatTranscriptWide: false,
      messagesHasMore: {},
      activeThreadId: null,
      closeThread: vi.fn(),
      loadOlderMessages: vi.fn(),
      hydrateChannels: vi.fn(),
      setChannelRailCollapsed: vi.fn(),
      contextMenuMessage: null,
      contextMenuPosition: null,
      editingMessageId: null,
      setActiveChannel: vi.fn(),
      fetchChannels: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      addMessage: vi.fn(),
      incrementChannelUnread: vi.fn(),
      addTypingUser: vi.fn(),
      removeTypingUser: vi.fn(),
      markChannelAsRead: vi.fn(),
      updateMessageReactions: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      pinMessage: vi.fn(),
      setEditingMessage: vi.fn(),
      toggleDetailPanel: vi.fn(),
      setDetailTab: vi.fn(),
      fetchPins: vi.fn(),
      fetchMedia: vi.fn(),
      toggleDoraPanel: vi.fn(),
      fetchDoraSummary: vi.fn(),
      fetchDoraActionItems: vi.fn(),
      fetchSmartReplies: vi.fn(),
      clearSmartReplies: vi.fn(),
      setSearchOpen: vi.fn(),
      setSearchQuery: vi.fn(),
      performSearch: vi.fn(),
      performUniversalSearch: vi.fn(),
      setUniversalSearchTab: vi.fn(),
      createChannel: vi.fn(),
      setChannelCreateOpen: vi.fn(),
      setMobileSidebarOpen: vi.fn(),
      setDuelHubOpen: vi.fn(),
      openContextMenu: vi.fn(),
      closeContextMenu: vi.fn(),
      addChannel: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { isMobile: false, leftSidebarOpen: true, leftSidebarCollapsed: false };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/usersStore', () => ({
  useUsersStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { users: [], fetchUsers: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { xpGainEvents: [], addXPGain: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/hooks/useChatChannelsQuery', () => ({
  useChatChannelsQuery: () => ({ data: [], isSuccess: true }),
}));

vi.mock('@/lib/socket', () => ({
  joinChannel: vi.fn(),
  leaveChannel: vi.fn(),
}));

describe('ChatV2Layout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Chat sidebar header', () => {
    render(
      <MemoryRouter>
        <ChatV2Layout />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('shows empty state when no channel is selected', () => {
    render(
      <MemoryRouter>
        <ChatV2Layout />
      </MemoryRouter>,
    );
    expect(screen.getByText('Welcome to Chat')).toBeTruthy();
  });

  it('shows Admin Messages button in sidebar', () => {
    render(
      <MemoryRouter>
        <ChatV2Layout />
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin Messages')).toBeTruthy();
  });
});
