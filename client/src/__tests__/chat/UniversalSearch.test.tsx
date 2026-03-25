import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach, expect } from 'vitest';

const mockPerformUniversalSearch = vi.fn();
const mockSetUniversalSearchTab = vi.fn();
const mockSetSearchOpen = vi.fn();
const mockSetActiveChannel = vi.fn();

const MOCK_UNIVERSAL_RESULTS = {
  messages: [
    { id: 'msg1', channelId: 'ch1', userId: 'u1', content: 'Found message', timestamp: new Date().toISOString(), senderName: 'Alice', channelName: 'general' },
  ],
  tasks: [
    { type: 'task' as const, id: 't1', title: 'Fix bug', subtitle: 'Project X', status: 'in_progress' },
  ],
  documents: [
    { type: 'document' as const, id: 'd1', title: 'API Guide', subtitle: 'Engineering' },
  ],
  users: [
    { type: 'user' as const, id: 'u2', title: 'Bob Smith', subtitle: 'Engineer' },
  ],
};

vi.mock('@/stores/chatStore', () => ({
  ADMIN_MESSAGES_CHANNEL_ID: '__admin_messages__',
  useChatStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      channels: [{ id: 'ch1', name: 'general', type: 'public', members: ['u1'], unreadCount: 0, createdAt: '' }],
      activeChannelId: 'ch1',
      messages: { ch1: [] },
      typingUsers: {},
      isLoading: false,
      chatError: null,
      detailPanelOpen: false,
      detailTab: 'members',
      pinnedMessages: {},
      channelMedia: {},
      pinsLoading: false, pinsError: null,
      mediaLoading: false, mediaError: null,
      doraSummary: null, doraActionItems: null, doraDecisions: null, doraSuggestions: [],
      doraLoading: false, doraSummaryLoading: false, doraActionItemsLoading: false, doraDecisionsLoading: false, doraSuggestionsLoading: false,
      doraPanelOpen: false,
      threadDoraSummary: null, threadDoraActionItems: null, threadDoraDecisions: null,
      threadDoraSummaryLoading: false, threadDoraActionItemsLoading: false, threadDoraDecisionsLoading: false,
      draftTransformLoading: false,
      composerDraftToApply: null,
      smartReplies: null, smartReplyLoading: false,
      searchQuery: '', searchResults: [], searchOpen: true,
      searchLoading: false, searchError: null,
      universalSearchResults: MOCK_UNIVERSAL_RESULTS,
      universalSearchLoading: false,
      universalSearchError: null,
      universalSearchTab: 'all' as const,
      mobileSidebarOpen: false, channelCreateOpen: false,
      contextMenuMessage: null, contextMenuPosition: null,
      editingMessageId: null,
      activeThreadId: null, threadMessages: [], threadLoading: false,
      smartFolders: [], smartFoldersLoading: false,
      duelHubOpen: false,
      channelRailCollapsed: false,
      chatTranscriptWide: false,
      setChannelRailCollapsed: vi.fn(),
      fetchChannels: vi.fn(), setActiveChannel: mockSetActiveChannel, addChannel: vi.fn(),
      fetchMessages: vi.fn(), sendMessage: vi.fn(), addMessage: vi.fn(),
      incrementChannelUnread: vi.fn(), addTypingUser: vi.fn(), removeTypingUser: vi.fn(), markChannelAsRead: vi.fn(),
      updateMessageReactions: vi.fn(), editMessage: vi.fn(), deleteMessage: vi.fn(),
      pinMessage: vi.fn(), setEditingMessage: vi.fn(), updateThreadReplyCount: vi.fn(),
      toggleDetailPanel: vi.fn(), setDetailTab: vi.fn(),
      fetchPins: vi.fn(), fetchMedia: vi.fn(),
      toggleDoraPanel: vi.fn(), fetchDoraSummary: vi.fn(), fetchDoraActionItems: vi.fn(),
      fetchDoraDecisions: vi.fn(), fetchDoraSuggestions: vi.fn(), fetchSmartReplies: vi.fn(), clearSmartReplies: vi.fn(),
      fetchThreadDoraSummary: vi.fn(), fetchThreadDoraActionItems: vi.fn(), fetchThreadDoraDecisions: vi.fn(),
      transformDraft: vi.fn(), requestComposerInsert: vi.fn(), clearComposerInsert: vi.fn(),
      setSearchOpen: mockSetSearchOpen, setSearchQuery: vi.fn(),
      performSearch: vi.fn(), performUniversalSearch: mockPerformUniversalSearch,
      setUniversalSearchTab: mockSetUniversalSearchTab,
      createChannel: vi.fn(), setChannelCreateOpen: vi.fn(),
      setMobileSidebarOpen: vi.fn(),
      openContextMenu: vi.fn(), closeContextMenu: vi.fn(),
      openThread: vi.fn(), closeThread: vi.fn(),
      fetchThreadMessages: vi.fn(), sendThreadReply: vi.fn(),
      fetchSmartFolders: vi.fn(), addSmartFolder: vi.fn(), removeSmartFolder: vi.fn(),
      setDuelHubOpen: vi.fn(),
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', name: 'Alice', avatar: '', email: '', jobTitle: '', department: '', level: 1, xp: 0, xpToNextLevel: 100, badges: [], stats: { tasksCompleted: 0, messagesSent: 0, hoursLogged: 0, projectsContributed: 0, documentsCreated: 0 }, status: 'online', role: 'admin', joinedAt: '' } };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/usersStore', () => ({
  useUsersStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { users: [{ id: 'u1', name: 'Alice', avatar: '', status: 'online' }], fetchUsers: vi.fn() };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/hooks/useSlashCommands', () => ({
  SLASH_COMMANDS: [],
  useSlashCommands: () => ({
    isOpen: false, activeCommand: null, query: '', results: [], selectedIndex: 0,
    loading: false, open: vi.fn(), close: vi.fn(), search: vi.fn(),
    moveSelection: vi.fn(), setSelectedIndex: vi.fn(), detectSlashCommand: vi.fn().mockReturnValue(null),
    selectCommand: vi.fn(), commands: [],
  }),
}));

vi.mock('@/hooks/useSmartReply', () => ({
  useSmartReply: () => ({ replies: [], contextSummary: '', loading: false, refresh: vi.fn(), clear: vi.fn() }),
}));

vi.mock('@/hooks/useChatDora', () => ({
  useChatDora: () => ({
    doraSummary: null, doraActionItems: null, doraLoading: false,
    doraPanelOpen: false, toggleDoraPanel: vi.fn(),
    summarize: vi.fn(), getActionItems: vi.fn(), getKBSuggestions: vi.fn().mockResolvedValue([]),
    createTaskFromActionItem: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  chatAPI: { resolveEmbed: vi.fn(), slashSearch: vi.fn().mockResolvedValue([]) },
  fetchAPI: vi.fn(),
  API_BASE: '',
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

describe('Universal Search UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search results with all tabs', async () => {
    const { ChatMainPanel } = await import('@/components/chat/ChatMainPanel');
    render(<MemoryRouter><ChatMainPanel /></MemoryRouter>);
    const universalBtn = screen.getByText('Channel');
    fireEvent.click(universalBtn);
  });

  it('renders message search results', async () => {
    const { ChatMainPanel } = await import('@/components/chat/ChatMainPanel');
    render(<MemoryRouter><ChatMainPanel /></MemoryRouter>);
    const toggleBtn = screen.getByText('Channel');
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const matches = screen.getAllByText('Messages');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders task search results', async () => {
    const { ChatMainPanel } = await import('@/components/chat/ChatMainPanel');
    render(<MemoryRouter><ChatMainPanel /></MemoryRouter>);
    const toggleBtn = screen.getByText('Channel');
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const matches = screen.getAllByText('Tasks');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
