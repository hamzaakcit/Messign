import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach, expect } from 'vitest';

const mockSendMessage = vi.fn();
const mockSetChannelCreateOpen = vi.fn();
const mockSetSearchOpen = vi.fn();
const mockToggleDoraPanel = vi.fn();
const mockToggleDetailPanel = vi.fn();
const mockOpenThread = vi.fn();
const mockCloseThread = vi.fn();
const mockAddReaction = vi.fn().mockResolvedValue({ reactions: [] });
const mockTogglePin = vi.fn().mockResolvedValue({ messageId: 'm1', isPinned: true });
const mockEditMessage = vi.fn().mockResolvedValue({ messageId: 'm1', content: 'edited', isEdited: true });
const mockDeleteMessage = vi.fn().mockResolvedValue(undefined);
const mockFetchAPI = vi.fn().mockResolvedValue({ id: 'task1', title: 'Test' });
const mockAwardChatXP = vi.fn().mockResolvedValue({ amount: 15, total: 100 });
const mockCreateChannel = vi.fn();
const mockSetEditingMessage = vi.fn();
const mockPerformSearch = vi.fn();
const mockPerformUniversalSearch = vi.fn();
const mockDoraTransformMessage = vi.fn().mockResolvedValue({ text: 'Explained' });
const mockTransformDraft = vi.fn().mockResolvedValue({ text: 'Improved' });

vi.mock('@/lib/api', () => ({
  chatAPI: {
    addReaction: mockAddReaction,
    removeReaction: vi.fn().mockResolvedValue({ reactions: [] }),
    togglePin: mockTogglePin,
    editMessage: mockEditMessage,
    deleteMessage: mockDeleteMessage,
    resolveEmbed: vi.fn().mockResolvedValue(null),
    awardChatXP: mockAwardChatXP,
    createDm: vi.fn(),
    slashSearch: vi.fn().mockResolvedValue([]),
    doraSummarize: vi.fn().mockResolvedValue({ summary: 'test', keyTopics: [], participantCount: 1, messageCount: 5 }),
    doraActionItems: vi.fn().mockResolvedValue({ actionItems: [], confidence: 0.9 }),
    doraSmartReply: vi.fn().mockResolvedValue({ replies: ['Yes', 'No', 'Maybe'], contextSummary: 'test' }),
    doraSummarizeThread: vi.fn().mockResolvedValue({ summary: 't', keyTopics: [], participantCount: 1, messageCount: 1 }),
    doraActionItemsThread: vi.fn().mockResolvedValue({ actionItems: [], confidence: 0.5 }),
    doraTransformMessage: mockDoraTransformMessage,
    doraTransformDraft: mockTransformDraft,
    doraDecisions: vi.fn().mockResolvedValue({ decisions: [], confidence: 0 }),
    doraDecisionsThread: vi.fn().mockResolvedValue({ decisions: [], confidence: 0 }),
    chatDuelRps: vi.fn().mockResolvedValue({
      you: 'rock', house: 'scissors', outcome: 'win', headline: 'You win', taskHint: 'hint',
    }),
    chatDuelCoin: vi.fn().mockResolvedValue({
      call: 'heads', result: 'heads', youWin: true, headline: 'Nice', taskHint: 'hint',
    }),
    chatDuelChamber: vi.fn().mockResolvedValue({
      yourChamber: 2, dangerChamber: 5, hit: false, headline: 'Safe', taskHint: 'hint',
    }),
    doraSuggest: vi.fn().mockResolvedValue({ suggestions: [], query: 'test' }),
    getThreadMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue({ id: 'new-msg', channelId: 'ch1', userId: 'u1', content: 'test' }),
    getSmartFolders: vi.fn().mockResolvedValue([]),
    universalSearch: vi.fn().mockResolvedValue({ messages: [], tasks: [], documents: [], users: [] }),
  },
  fetchAPI: mockFetchAPI,
  API_BASE: '',
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const MOCK_MESSAGE = {
  id: 'm1', channelId: 'ch1', userId: 'u1', content: 'Hello world',
  attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(),
  reactions: [{ emoji: '👍', users: ['u2'] }], isEdited: false, isPinned: false,
  metadata: {}, threadId: null, replyCount: 0,
};

const MOCK_USER = {
  id: 'u1', email: 'a@t.com', name: 'Alice', avatar: '', jobTitle: 'Dev',
  department: 'Eng', level: 1, xp: 0, xpToNextLevel: 100, badges: [],
  stats: { tasksCompleted: 0, messagesSent: 0, hoursLogged: 0, projectsContributed: 0, documentsCreated: 0 },
  status: 'online' as const, role: 'admin' as const, joinedAt: '',
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/usersStore', () => ({
  useUsersStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { users: [MOCK_USER, { ...MOCK_USER, id: 'u2', name: 'Bob' }], fetchUsers: vi.fn() };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { isMobile: false };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  ADMIN_MESSAGES_CHANNEL_ID: '__admin_messages__',
  useChatStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      channels: [{ id: 'ch1', name: 'general', type: 'public', members: ['u1', 'u2'], unreadCount: 0, createdAt: '' }],
      activeChannelId: 'ch1',
      messages: { ch1: [MOCK_MESSAGE] },
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
      threadDoraSummary: null, threadDoraActionItems: null, threadDoraDecisions: null,
      threadDoraSummaryLoading: false, threadDoraActionItemsLoading: false, threadDoraDecisionsLoading: false,
      draftTransformLoading: false,
      composerDraftToApply: null,
      doraPanelOpen: false,
      smartReplies: null, smartReplyLoading: false,
      searchQuery: '', searchResults: [], searchOpen: false,
      searchLoading: false, searchError: null,
      universalSearchResults: null, universalSearchLoading: false, universalSearchError: null, universalSearchTab: 'all',
      mobileSidebarOpen: false, channelCreateOpen: false,
      contextMenuMessage: null, contextMenuPosition: null,
      editingMessageId: null,
      activeThreadId: null, threadMessages: [], threadLoading: false,
      smartFolders: [], smartFoldersLoading: false,
      duelHubOpen: false,
      channelRailCollapsed: false,
      chatTranscriptWide: false,
      setChannelRailCollapsed: vi.fn(),
      fetchChannels: vi.fn(), setActiveChannel: vi.fn(), addChannel: vi.fn(),
      fetchMessages: vi.fn(), sendMessage: mockSendMessage, addMessage: vi.fn(),
      incrementChannelUnread: vi.fn(), addTypingUser: vi.fn(), removeTypingUser: vi.fn(), markChannelAsRead: vi.fn(),
      updateMessageReactions: vi.fn(), editMessage: vi.fn(), deleteMessage: vi.fn(),
      pinMessage: vi.fn(), setEditingMessage: mockSetEditingMessage, updateThreadReplyCount: vi.fn(),
      toggleDetailPanel: mockToggleDetailPanel, setDetailTab: vi.fn(),
      fetchPins: vi.fn(), fetchMedia: vi.fn(),
      toggleDoraPanel: mockToggleDoraPanel, fetchDoraSummary: vi.fn(), fetchDoraActionItems: vi.fn(),
      fetchDoraDecisions: vi.fn(), fetchDoraSuggestions: vi.fn(), fetchSmartReplies: vi.fn(), clearSmartReplies: vi.fn(),
      fetchThreadDoraSummary: vi.fn(), fetchThreadDoraActionItems: vi.fn(), fetchThreadDoraDecisions: vi.fn(),
      requestComposerInsert: vi.fn(), clearComposerInsert: vi.fn(), transformDraft: mockTransformDraft,
      setSearchOpen: mockSetSearchOpen, setSearchQuery: vi.fn(),
      performSearch: mockPerformSearch, performUniversalSearch: mockPerformUniversalSearch,
      setUniversalSearchTab: vi.fn(),
      createChannel: mockCreateChannel, setChannelCreateOpen: mockSetChannelCreateOpen,
      setMobileSidebarOpen: vi.fn(),
      openContextMenu: vi.fn(), closeContextMenu: vi.fn(),
      openThread: mockOpenThread, closeThread: mockCloseThread,
      fetchThreadMessages: vi.fn(), sendThreadReply: vi.fn(),
      fetchSmartFolders: vi.fn(), addSmartFolder: vi.fn(), removeSmartFolder: vi.fn(),
      setDuelHubOpen: vi.fn(),
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { xpGains: [], addXPGain: vi.fn() };
    return sel ? sel(state) : state;
  }),
}));

vi.mock('@/hooks/useSlashCommands', () => ({
  SLASH_COMMANDS: [{ trigger: '/task', label: 'Task', description: 'Search tasks', searchType: 'task', icon: '📋' }],
  useSlashCommands: () => ({
    isOpen: false, activeCommand: null, query: '', results: [], selectedIndex: 0,
    loading: false, open: vi.fn(), close: vi.fn(), search: vi.fn(),
    moveSelection: vi.fn(), setSelectedIndex: vi.fn(), detectSlashCommand: vi.fn().mockReturnValue(null),
    selectCommand: vi.fn(), commands: [{ trigger: '/task', label: 'Task', description: 'Search tasks', searchType: 'task', icon: '📋' }],
  }),
}));

vi.mock('@/hooks/useSmartReply', () => ({
  useSmartReply: () => ({ replies: [], contextSummary: '', loading: false, refresh: vi.fn(), clear: vi.fn() }),
}));

vi.mock('@/hooks/useChatDora', () => ({
  useChatDora: () => ({
    doraSummary: null, doraActionItems: null, doraDecisions: null, doraLoading: false,
    doraPanelOpen: false, toggleDoraPanel: vi.fn(),
    summarize: vi.fn(), getActionItems: vi.fn(), getDecisions: vi.fn(), getKBSuggestions: vi.fn().mockResolvedValue([]),
    createTaskFromActionItem: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/lib/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
  joinChannel: vi.fn(), leaveChannel: vi.fn(),
  emitUserStatus: vi.fn(),
  onMessageReact: vi.fn().mockReturnValue(vi.fn()),
  onMessageEdit: vi.fn().mockReturnValue(vi.fn()),
  onMessageDelete: vi.fn().mockReturnValue(vi.fn()),
  onMessagePin: vi.fn().mockReturnValue(vi.fn()),
  onThreadReply: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('@/lib/authToken', () => ({
  getAccessToken: () => 'test-token',
}));

function renderComponent(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

describe('Chat V2 Buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EnhancedMessageBubble', () => {
    it('renders message with reaction buttons', async () => {
      const { EnhancedMessageBubble } = await import('@/components/chat/EnhancedMessageBubble');
      renderComponent(
        <EnhancedMessageBubble message={MOCK_MESSAGE} user={MOCK_USER} showAvatar currentUserId="u1" />,
      );
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getAllByLabelText(/👍 reaction/).length).toBeGreaterThan(0);
    });

    it('shows reply count badge for messages with replies', async () => {
      const { EnhancedMessageBubble } = await import('@/components/chat/EnhancedMessageBubble');
      const msgWithReplies = { ...MOCK_MESSAGE, replyCount: 3 };
      renderComponent(
        <EnhancedMessageBubble message={msgWithReplies} user={MOCK_USER} showAvatar currentUserId="u1" />,
      );
      expect(screen.getByText('3 replies')).toBeInTheDocument();
    });

    it('clicking reaction calls addReaction API', async () => {
      const { EnhancedMessageBubble } = await import('@/components/chat/EnhancedMessageBubble');
      renderComponent(
        <EnhancedMessageBubble message={MOCK_MESSAGE} user={MOCK_USER} showAvatar currentUserId="u1" />,
      );
      const reactionBtn = screen.getAllByLabelText(/👍 reaction/)[0];
      fireEvent.click(reactionBtn);
      await waitFor(() => {
        expect(mockAddReaction).toHaveBeenCalledWith('ch1', 'm1', '👍');
      });
    });

    it('shows deleted message indicator', async () => {
      const { EnhancedMessageBubble } = await import('@/components/chat/EnhancedMessageBubble');
      const deleted = { ...MOCK_MESSAGE, isDeleted: true };
      renderComponent(
        <EnhancedMessageBubble message={deleted} user={MOCK_USER} showAvatar currentUserId="u1" />,
      );
      expect(screen.getByText('This message was deleted')).toBeInTheDocument();
    });
  });

  describe('EnhancedMessageInput', () => {
    it('renders send button and disables when empty', async () => {
      const { EnhancedMessageInput } = await import('@/components/chat/EnhancedMessageInput');
      renderComponent(<EnhancedMessageInput channelName="general" />);
      const textarea = screen.getByPlaceholderText(/Message #general/);
      expect(textarea).toBeInTheDocument();
    });

    it('emoji picker button opens picker', async () => {
      const { EnhancedMessageInput } = await import('@/components/chat/EnhancedMessageInput');
      renderComponent(<EnhancedMessageInput channelName="general" />);
      const emojiBtn = screen.getAllByLabelText('Insert emoji')[0];
      fireEvent.click(emojiBtn);
      expect(screen.getByText('Smileys')).toBeInTheDocument();
    });

    it('mention button opens mention picker', async () => {
      const { EnhancedMessageInput } = await import('@/components/chat/EnhancedMessageInput');
      renderComponent(<EnhancedMessageInput channelName="general" />);
      const mentionBtn = screen.getByLabelText('Mention someone');
      fireEvent.click(mentionBtn);
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('file upload button exists', async () => {
      const { EnhancedMessageInput } = await import('@/components/chat/EnhancedMessageInput');
      renderComponent(<EnhancedMessageInput channelName="general" />);
      expect(screen.getAllByLabelText('Attach files').length).toBeGreaterThan(0);
    });

    it('Improve draft menu calls transformDraft with action', async () => {
      const { EnhancedMessageInput } = await import('@/components/chat/EnhancedMessageInput');
      renderComponent(<EnhancedMessageInput channelName="general" />);
      const textarea = screen.getByPlaceholderText(/Message #general/);
      fireEvent.change(textarea, { target: { value: 'Draft text here' } });
      fireEvent.click(screen.getByLabelText('Improve draft with Dora'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Professional' }));
      await waitFor(() => {
        expect(mockTransformDraft).toHaveBeenCalledWith('ch1', 'Draft text here', 'professional');
      });
    });
  });

  describe('ChannelCreateModal', () => {
    it('renders create channel form with submit button', async () => {
      const { ChannelCreateModal } = await import('@/components/chat/ChannelCreateModal');
      renderComponent(<ChannelCreateModal />);
      expect(screen.getByRole('heading', { name: 'Create Channel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Channel' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. marketing-strategy')).toBeInTheDocument();
    });

    it('public/private type toggle buttons work', async () => {
      const { ChannelCreateModal } = await import('@/components/chat/ChannelCreateModal');
      renderComponent(<ChannelCreateModal />);
      const privateBtn = screen.getByText('Private');
      fireEvent.click(privateBtn);
      expect(privateBtn.closest('button')).toHaveClass('border-primary-500');
    });
  });

  describe('MessageContextMenu', () => {
    it('renders with copy, pin, create task, reply in thread', async () => {
      const { useChatStore } = await import('@/stores/chatStore');
      (useChatStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((sel?: (s: unknown) => unknown) => {
        const state = {
          contextMenuMessage: { ...MOCK_MESSAGE, threadId: null },
          contextMenuPosition: { x: 100, y: 100 },
          closeContextMenu: vi.fn(),
          setEditingMessage: vi.fn(),
          openThread: vi.fn(),
        };
        return sel ? sel(state) : state;
      });
      const { MessageContextMenu } = await import('@/components/chat/MessageContextMenu');
      renderComponent(<MessageContextMenu />);
      expect(screen.getByText('Copy text')).toBeInTheDocument();
      expect(screen.getByText('Create task')).toBeInTheDocument();
      expect(screen.getByText('Reply in thread')).toBeInTheDocument();
    });

    it('Dora Explain calls doraTransformMessage', async () => {
      const { useChatStore } = await import('@/stores/chatStore');
      (useChatStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((sel?: (s: unknown) => unknown) => {
        const state = {
          contextMenuMessage: { ...MOCK_MESSAGE, threadId: null },
          contextMenuPosition: { x: 100, y: 100 },
          closeContextMenu: vi.fn(),
          setEditingMessage: vi.fn(),
          openThread: vi.fn(),
        };
        return sel ? sel(state) : state;
      });
      const { MessageContextMenu } = await import('@/components/chat/MessageContextMenu');
      renderComponent(<MessageContextMenu />);
      fireEvent.click(screen.getByText('Explain'));
      await waitFor(() => {
        expect(mockDoraTransformMessage).toHaveBeenCalledWith('ch1', 'm1', { action: 'explain' });
      });
    });
  });
});
