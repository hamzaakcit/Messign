import { create } from 'zustand';
import type {
  Channel, Message, Reaction, DoraSummaryResult,
  DoraActionItemsResult, SmartReplyResult, ChatSearchResult, ChatMediaItem,
  DoraKBSuggestion, SmartFolder, UniversalSearchResults,
  DoraDecisionsResult, DoraTransformAction, DoraMessageTransformResult,
} from '@/types';
import { chatAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { joinChannel, leaveChannel } from '@/lib/socket';
import { toast } from 'sonner';

export const ADMIN_MESSAGES_CHANNEL_ID = '__admin_messages__';

const CHANNEL_RAIL_COLLAPSED_KEY = 'messign-chat-channel-rail-collapsed';

function readChannelRailCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CHANNEL_RAIL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export type DetailTab = 'members' | 'pins' | 'media' | 'settings';
export type UniversalSearchTab = 'all' | 'messages' | 'tasks' | 'docs' | 'people';

interface ChatState {
  // Core
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  /** Whether more messages exist above the oldest loaded message (per channel). */
  messagesHasMore: Record<string, boolean>;
  typingUsers: Record<string, string[]>;
  isLoading: boolean;
  chatError: string | null;

  // v2: Detail panel
  detailPanelOpen: boolean;
  detailTab: DetailTab;
  pinnedMessages: Record<string, Message[]>;
  channelMedia: Record<string, ChatMediaItem[]>;
  pinsLoading: boolean;
  pinsError: string | null;
  mediaLoading: boolean;
  mediaError: string | null;

  // v2: Dora AI
  doraSummary: DoraSummaryResult | null;
  doraActionItems: DoraActionItemsResult | null;
  doraSuggestions: DoraKBSuggestion[];
  doraLoading: boolean;
  doraSummaryLoading: boolean;
  doraActionItemsLoading: boolean;
  doraSuggestionsLoading: boolean;
  doraPanelOpen: boolean;
  doraDecisions: DoraDecisionsResult | null;
  doraDecisionsLoading: boolean;

  // v3: Thread-scoped Dora
  threadDoraSummary: DoraSummaryResult | null;
  threadDoraActionItems: DoraActionItemsResult | null;
  threadDoraSummaryLoading: boolean;
  threadDoraActionItemsLoading: boolean;
  threadDoraDecisions: DoraDecisionsResult | null;
  threadDoraDecisionsLoading: boolean;

  // v3: Composer AI
  draftTransformLoading: boolean;
  /** When set, EnhancedMessageInput replaces draft once then clears */
  composerDraftToApply: string | null;

  // v2: Smart Reply
  smartReplies: SmartReplyResult | null;
  smartReplyLoading: boolean;

  // v2: Search
  searchQuery: string;
  searchResults: ChatSearchResult[];
  searchOpen: boolean;
  searchLoading: boolean;
  searchError: string | null;

  // v2: Universal Search
  universalSearchResults: UniversalSearchResults | null;
  universalSearchLoading: boolean;
  universalSearchError: string | null;
  universalSearchTab: UniversalSearchTab;

  // v2: Mobile
  mobileSidebarOpen: boolean;

  // v2: Channel creation
  channelCreateOpen: boolean;

  // v2: Context menu
  contextMenuMessage: Message | null;
  contextMenuPosition: { x: number; y: number } | null;

  // v2: Editing
  editingMessageId: string | null;

  // v2: Threads
  activeThreadId: string | null;
  threadMessages: Message[];
  threadLoading: boolean;

  // v2: Smart Folders
  smartFolders: SmartFolder[];
  smartFoldersLoading: boolean;

  // Channel duels hub (RPS / coin / chamber)
  duelHubOpen: boolean;

  /** Desktop: narrow channel rail (more space for transcript). Persisted in localStorage. */
  channelRailCollapsed: boolean;
  setChannelRailCollapsed: (collapsed: boolean) => void;
  /** When rail collapsed, use wider max-width for message column */
  chatTranscriptWide: boolean;

  // Actions: Core
  hydrateChannels: (channels: Channel[]) => void;
  fetchChannels: (userId: string) => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  addChannel: (channel: Channel) => void;
  fetchMessages: (channelId: string, userId?: string) => Promise<void>;
  loadOlderMessages: (channelId: string, userId?: string) => Promise<void>;
  sendMessage: (content: string, userId: string, options?: { attachments?: unknown[]; mentions?: string[]; metadata?: Record<string, unknown>; threadId?: string }) => Promise<boolean>;
  addMessage: (message: Message) => void;
  incrementChannelUnread: (channelId: string) => void;
  addTypingUser: (channelId: string, userId: string) => void;
  removeTypingUser: (channelId: string, userId: string) => void;
  markChannelAsRead: (channelId: string, userId?: string) => void;

  // Actions: v2 Message actions
  updateMessageReactions: (messageId: string, channelId: string, reactions: Reaction[]) => void;
  editMessage: (messageId: string, channelId: string, content: string) => void;
  deleteMessage: (messageId: string, channelId: string) => void;
  pinMessage: (messageId: string, channelId: string, isPinned: boolean) => void;
  setEditingMessage: (messageId: string | null) => void;
  updateThreadReplyCount: (threadId: string, replyCount: number) => void;

  // Actions: v2 Detail panel
  toggleDetailPanel: () => void;
  setDetailTab: (tab: DetailTab) => void;
  fetchPins: (channelId: string) => Promise<void>;
  fetchMedia: (channelId: string) => Promise<void>;

  // Actions: v2 Dora
  toggleDoraPanel: () => void;
  fetchDoraSummary: (channelId: string) => Promise<void>;
  fetchDoraActionItems: (channelId: string) => Promise<void>;
  fetchDoraSuggestions: (channelId: string, query: string) => Promise<void>;
  fetchDoraDecisions: (channelId: string) => Promise<void>;
  fetchThreadDoraSummary: (channelId: string, parentMessageId: string) => Promise<void>;
  fetchThreadDoraActionItems: (channelId: string, parentMessageId: string) => Promise<void>;
  fetchThreadDoraDecisions: (channelId: string, parentMessageId: string) => Promise<void>;
  fetchSmartReplies: (channelId: string, options?: { threadId?: string }) => Promise<void>;
  requestComposerInsert: (text: string) => void;
  clearComposerInsert: () => void;
  clearSmartReplies: () => void;
  transformDraft: (
    channelId: string,
    text: string,
    action: DoraTransformAction,
    targetLocale?: string,
  ) => Promise<DoraMessageTransformResult | null>;

  // Actions: v2 Search
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  performSearch: (query: string, channelId?: string) => Promise<void>;

  // Actions: v2 Universal Search
  performUniversalSearch: (query: string) => Promise<void>;
  setUniversalSearchTab: (tab: UniversalSearchTab) => void;

  // Actions: v2 Channel management
  createChannel: (data: { name: string; description?: string; type?: string; members?: string[] }) => Promise<void>;
  setChannelCreateOpen: (open: boolean) => void;

  // Actions: v2 Mobile
  setMobileSidebarOpen: (open: boolean) => void;

  // Actions: v2 Context menu
  openContextMenu: (message: Message, position: { x: number; y: number }) => void;
  closeContextMenu: () => void;

  // Actions: v2 Threads
  openThread: (messageId: string) => void;
  closeThread: () => void;
  fetchThreadMessages: (channelId: string, messageId: string) => Promise<void>;
  sendThreadReply: (content: string, userId: string, threadId: string) => Promise<void>;

  // Actions: v2 Smart Folders
  fetchSmartFolders: () => Promise<void>;
  addSmartFolder: (folder: Omit<SmartFolder, 'id' | 'createdAt'>) => Promise<void>;
  removeSmartFolder: (folderId: string) => Promise<void>;

  setDuelHubOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Core state
  channels: [],
  activeChannelId: null,
  messages: {},
  messagesHasMore: {},
  typingUsers: {},
  isLoading: false,
  chatError: null,

  // v2 state
  detailPanelOpen: false,
  detailTab: 'members',
  pinnedMessages: {},
  channelMedia: {},
  pinsLoading: false,
  pinsError: null,
  mediaLoading: false,
  mediaError: null,
  doraSummary: null,
  doraActionItems: null,
  doraSuggestions: [],
  doraLoading: false,
  doraSummaryLoading: false,
  doraActionItemsLoading: false,
  doraSuggestionsLoading: false,
  doraPanelOpen: false,
  doraDecisions: null,
  doraDecisionsLoading: false,
  threadDoraSummary: null,
  threadDoraActionItems: null,
  threadDoraSummaryLoading: false,
  threadDoraActionItemsLoading: false,
  threadDoraDecisions: null,
  threadDoraDecisionsLoading: false,
  draftTransformLoading: false,
  composerDraftToApply: null,
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
  contextMenuMessage: null,
  contextMenuPosition: null,
  editingMessageId: null,
  activeThreadId: null,
  threadMessages: [],
  threadLoading: false,
  smartFolders: [],
  smartFoldersLoading: false,
  duelHubOpen: false,
  channelRailCollapsed: readChannelRailCollapsed(),
  chatTranscriptWide: readChannelRailCollapsed(),

  setChannelRailCollapsed: (collapsed) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHANNEL_RAIL_COLLAPSED_KEY, collapsed ? '1' : '0');
      }
    } catch {
      /* ignore */
    }
    set({ channelRailCollapsed: collapsed, chatTranscriptWide: collapsed });
  },

  // ── Core Actions ──

  hydrateChannels: (channels) => {
    set({ channels, isLoading: false, chatError: null });
    if (channels.length > 0 && !get().activeChannelId) {
      get().setActiveChannel(channels[0].id);
    }
  },

  fetchChannels: async (userId: string) => {
    if (!userId) return;
    try {
      set({ isLoading: true, chatError: null });
      const channels = await chatAPI.getChannels(userId) as Channel[];
      get().hydrateChannels(channels);
    } catch (error) {
      set({ isLoading: false, chatError: error instanceof Error ? error.message : 'Failed to load channels' });
    }
  },

  setActiveChannel: (channelId) => {
    const { activeChannelId } = get();
    const isAdminMessages = channelId === ADMIN_MESSAGES_CHANNEL_ID;
    if (activeChannelId && activeChannelId !== ADMIN_MESSAGES_CHANNEL_ID) {
      leaveChannel(activeChannelId);
    }
    if (isAdminMessages) {
      set({ activeChannelId: channelId });
      return;
    }
    joinChannel(channelId);
    set({
      activeChannelId: channelId,
      smartReplies: null,
      doraSummary: null,
      doraActionItems: null,
      doraDecisions: null,
      threadDoraSummary: null,
      threadDoraActionItems: null,
      threadDoraDecisions: null,
      activeThreadId: null,
      threadMessages: [],
      threadLoading: false,
    });
    if (!get().messages[channelId]) {
      get().fetchMessages(channelId);
    }
    get().markChannelAsRead(channelId);
  },

  addChannel: (channel) => {
    set((state) => {
      if (state.channels.some((c) => c.id === channel.id)) return state;
      return { channels: [...state.channels, channel] };
    });
  },

  fetchMessages: async (channelId, userId) => {
    try {
      const { messages, hasMore } = await chatAPI.getMessagesPage(channelId, { limit: 80 }, userId ?? undefined);
      set((state) => ({
        messages: { ...state.messages, [channelId]: messages },
        messagesHasMore: { ...state.messagesHasMore, [channelId]: hasMore },
        chatError: null,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch messages';
      console.error('Failed to fetch messages:', error);
      set({ chatError: msg });
    }
  },

  loadOlderMessages: async (channelId, userId) => {
    const current = get().messages[channelId] ?? [];
    if (current.length === 0) return;
    const oldestId = current[0].id;
    try {
      const { messages: older, hasMore } = await chatAPI.getMessagesPage(
        channelId,
        { limit: 80, before: oldestId },
        userId ?? undefined,
      );
      set((state) => {
        const prevList = state.messages[channelId] ?? [];
        const seen = new Set(prevList.map((m) => m.id));
        const merged = [...older.filter((m) => !seen.has(m.id)), ...prevList];
        return {
          messages: { ...state.messages, [channelId]: merged },
          messagesHasMore: { ...state.messagesHasMore, [channelId]: hasMore },
        };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load older messages';
      toast.error(msg);
    }
  },

  sendMessage: async (content, userId, options) => {
    const { activeChannelId } = get();
    if (!activeChannelId) return false;
    try {
      const body: { content: string; attachments?: unknown[]; mentions?: string[]; metadata?: Record<string, unknown>; threadId?: string } = {
        content,
        attachments: options?.attachments ?? [],
        mentions: options?.mentions ?? [],
        metadata: options?.metadata ?? {},
      };
      if (options?.threadId) body.threadId = options.threadId;
      const message = await chatAPI.sendMessage(activeChannelId, body, userId) as Message;
      get().addMessage(message);
      if (options?.threadId) {
        set((state) => ({
          threadMessages: [...state.threadMessages, message],
        }));
      }
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      toast.error(msg);
      return false;
    }
  },

  addMessage: (message) => {
    set((state) => {
      const channelMessages = state.messages[message.channelId] || [];
      if (channelMessages.some((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [message.channelId]: [...channelMessages, message],
        },
      };
    });
  },

  incrementChannelUnread: (channelId) => {
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c
      ),
    }));
  },

  addTypingUser: (channelId, userId) => {
    set((state) => {
      const channelTyping = state.typingUsers[channelId] || [];
      if (!channelTyping.includes(userId)) {
        return { typingUsers: { ...state.typingUsers, [channelId]: [...channelTyping, userId] } };
      }
      return state;
    });
  },

  removeTypingUser: (channelId, userId) => {
    set((state) => {
      const channelTyping = state.typingUsers[channelId] || [];
      return { typingUsers: { ...state.typingUsers, [channelId]: channelTyping.filter((id) => id !== userId) } };
    });
  },

  markChannelAsRead: (channelId, userId) => {
    const uid = userId ?? useAuthStore.getState().user?.id;
    if (uid) {
      chatAPI.markAsRead(channelId, uid).catch(() => {});
    }
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },

  // ── v2 Message Actions ──

  updateMessageReactions: (messageId, channelId, reactions) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) => m.id === messageId ? { ...m, reactions } : m),
        },
      };
    });
  },

  editMessage: (messageId, channelId, content) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId ? { ...m, content, isEdited: true } : m
          ),
        },
        editingMessageId: null,
      };
    });
  },

  deleteMessage: (messageId, channelId) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId ? { ...m, content: '[deleted]', isDeleted: true } : m
          ),
        },
      };
    });
  },

  pinMessage: (messageId, channelId, isPinned) => {
    set((state) => {
      const msgs = state.messages[channelId];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId ? { ...m, isPinned } : m
          ),
        },
      };
    });
  },

  setEditingMessage: (messageId) => set({ editingMessageId: messageId }),

  updateThreadReplyCount: (threadId, replyCount) => {
    set((state) => {
      const updated: Record<string, Message[]> = {};
      for (const [chId, msgs] of Object.entries(state.messages)) {
        updated[chId] = msgs.map((m) => m.id === threadId ? { ...m, replyCount } : m);
      }
      return { messages: updated };
    });
  },

  // ── v2 Detail Panel ──

  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
  setDetailTab: (tab) => set({ detailTab: tab, detailPanelOpen: true }),

  fetchPins: async (channelId) => {
    set({ pinsLoading: true, pinsError: null });
    try {
      const pins = await chatAPI.getPins(channelId);
      set((state) => ({ pinnedMessages: { ...state.pinnedMessages, [channelId]: pins }, pinsLoading: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load pinned messages';
      set({ pinsLoading: false, pinsError: msg });
    }
  },

  fetchMedia: async (channelId) => {
    set({ mediaLoading: true, mediaError: null });
    try {
      const media = await chatAPI.getMedia(channelId);
      set((state) => ({ channelMedia: { ...state.channelMedia, [channelId]: media }, mediaLoading: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load media';
      set({ mediaLoading: false, mediaError: msg });
    }
  },

  // ── v2 Dora ──

  toggleDoraPanel: () => set((s) => ({ doraPanelOpen: !s.doraPanelOpen })),

  fetchDoraSummary: async (channelId) => {
    set({ doraSummaryLoading: true, doraLoading: true });
    try {
      const summary = await chatAPI.doraSummarize(channelId);
      set({ doraSummary: summary, doraSummaryLoading: false, doraLoading: false });
    } catch {
      set({ doraSummaryLoading: false, doraLoading: false });
      toast.error('Failed to generate summary');
    }
  },

  fetchDoraActionItems: async (channelId) => {
    set({ doraActionItemsLoading: true, doraLoading: true });
    try {
      const items = await chatAPI.doraActionItems(channelId);
      set({ doraActionItems: items, doraActionItemsLoading: false, doraLoading: false });
    } catch {
      set({ doraActionItemsLoading: false, doraLoading: false });
      toast.error('Failed to detect action items');
    }
  },

  fetchDoraSuggestions: async (channelId, query) => {
    set({ doraSuggestionsLoading: true });
    try {
      const result = await chatAPI.doraSuggest(channelId, query);
      set({ doraSuggestions: result.suggestions, doraSuggestionsLoading: false });
    } catch {
      set({ doraSuggestionsLoading: false });
    }
  },

  fetchDoraDecisions: async (channelId) => {
    set({ doraDecisionsLoading: true });
    try {
      const result = await chatAPI.doraDecisions(channelId);
      set({ doraDecisions: result, doraDecisionsLoading: false });
    } catch {
      set({ doraDecisionsLoading: false });
      toast.error('Failed to extract decisions');
    }
  },

  fetchThreadDoraSummary: async (channelId, parentMessageId) => {
    set({ threadDoraSummaryLoading: true });
    try {
      const summary = await chatAPI.doraSummarizeThread(channelId, parentMessageId);
      set({ threadDoraSummary: summary, threadDoraSummaryLoading: false });
    } catch {
      set({ threadDoraSummaryLoading: false });
      toast.error('Failed to summarize thread');
    }
  },

  fetchThreadDoraActionItems: async (channelId, parentMessageId) => {
    set({ threadDoraActionItemsLoading: true });
    try {
      const items = await chatAPI.doraActionItemsThread(channelId, parentMessageId);
      set({ threadDoraActionItems: items, threadDoraActionItemsLoading: false });
    } catch {
      set({ threadDoraActionItemsLoading: false });
      toast.error('Failed to detect thread action items');
    }
  },

  fetchThreadDoraDecisions: async (channelId, parentMessageId) => {
    set({ threadDoraDecisionsLoading: true });
    try {
      const result = await chatAPI.doraDecisionsThread(channelId, parentMessageId);
      set({ threadDoraDecisions: result, threadDoraDecisionsLoading: false });
    } catch (e) {
      set({ threadDoraDecisionsLoading: false });
      const msg = e instanceof Error ? e.message : 'Failed to extract thread decisions';
      toast.error(msg);
    }
  },

  requestComposerInsert: (text) => set({ composerDraftToApply: text }),
  clearComposerInsert: () => set({ composerDraftToApply: null }),

  fetchSmartReplies: async (channelId, options) => {
    set({ smartReplyLoading: true });
    try {
      const result = await chatAPI.doraSmartReply(channelId, options);
      set({ smartReplies: result, smartReplyLoading: false });
    } catch {
      set({ smartReplyLoading: false });
    }
  },

  transformDraft: async (channelId, text, action, targetLocale) => {
    set({ draftTransformLoading: true });
    try {
      const result = await chatAPI.doraTransformDraft(channelId, { text, action, targetLocale });
      set({ draftTransformLoading: false });
      if (result.text) {
        chatAPI.awardChatXP(channelId, 'chat.dora.transform_used').catch(() => {});
      }
      return result;
    } catch {
      set({ draftTransformLoading: false });
      toast.error('Failed to transform text');
      return null;
    }
  },

  clearSmartReplies: () => set({ smartReplies: null }),

  // ── v2 Search ──

  setSearchOpen: (open) =>
    set({
      searchOpen: open,
      searchResults: open ? get().searchResults : [],
      searchError: open ? get().searchError : null,
      searchLoading: open ? get().searchLoading : false,
      universalSearchResults: open ? get().universalSearchResults : null,
      universalSearchError: open ? get().universalSearchError : null,
      universalSearchLoading: open ? get().universalSearchLoading : false,
    }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  performSearch: async (query, channelId) => {
    if (!query.trim()) {
      set({ searchResults: [], searchError: null, searchLoading: false });
      return;
    }
    set({ searchLoading: true, searchError: null });
    try {
      const results = await chatAPI.searchMessages(query, channelId);
      set({ searchResults: Array.isArray(results) ? results : [], searchLoading: false, searchError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      set({ searchResults: [], searchLoading: false, searchError: msg });
    }
  },

  // ── v2 Universal Search ──

  performUniversalSearch: async (query) => {
    if (!query.trim()) {
      set({ universalSearchResults: null, universalSearchError: null, universalSearchLoading: false });
      return;
    }
    set({ universalSearchLoading: true, universalSearchError: null });
    try {
      const results = await chatAPI.universalSearch(query);
      set({ universalSearchResults: results, universalSearchLoading: false, universalSearchError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      set({ universalSearchResults: null, universalSearchLoading: false, universalSearchError: msg });
    }
  },

  setUniversalSearchTab: (tab) => set({ universalSearchTab: tab }),

  // ── v2 Channel management ──

  createChannel: async (data) => {
    try {
      const channel = await chatAPI.createChannel(data);
      get().addChannel(channel);
      get().setActiveChannel(channel.id);
      set({ channelCreateOpen: false });
      toast.success(`Channel #${channel.name} created`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create channel';
      toast.error(msg);
      throw e;
    }
  },

  setChannelCreateOpen: (open) => set({ channelCreateOpen: open }),

  // ── v2 Mobile ──
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  // ── v2 Context menu ──
  openContextMenu: (message, position) => set({ contextMenuMessage: message, contextMenuPosition: position }),
  closeContextMenu: () => set({ contextMenuMessage: null, contextMenuPosition: null }),

  // ── v2 Threads ──
  openThread: (messageId) => {
    const { activeChannelId } = get();
    set({
      activeThreadId: messageId,
      threadMessages: [],
      threadLoading: true,
      detailPanelOpen: false,
      threadDoraSummary: null,
      threadDoraActionItems: null,
      threadDoraDecisions: null,
    });
    if (activeChannelId) get().fetchThreadMessages(activeChannelId, messageId);
  },
  closeThread: () => set({
    activeThreadId: null,
    threadMessages: [],
    threadLoading: false,
    threadDoraSummary: null,
    threadDoraActionItems: null,
    threadDoraDecisions: null,
  }),

  fetchThreadMessages: async (channelId, messageId) => {
    set({ threadLoading: true });
    try {
      const messages = await chatAPI.getThreadMessages(channelId, messageId);
      set({ threadMessages: messages, threadLoading: false });
    } catch {
      set({ threadLoading: false });
      toast.error('Failed to load thread');
    }
  },

  sendThreadReply: async (content, userId, threadId) => {
    const { activeChannelId } = get();
    if (!activeChannelId) return;
    try {
      const message = await chatAPI.sendMessage(activeChannelId, {
        content,
        threadId,
        attachments: [],
        mentions: [],
        metadata: {},
      }, userId) as Message;
      get().addMessage(message);
      set((state) => ({
        threadMessages: [...state.threadMessages, message],
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send reply';
      toast.error(msg);
    }
  },

  // ── v2 Smart Folders ──
  fetchSmartFolders: async () => {
    set({ smartFoldersLoading: true });
    try {
      const folders = await chatAPI.getSmartFolders();
      set({ smartFolders: folders, smartFoldersLoading: false });
    } catch {
      set({ smartFoldersLoading: false });
    }
  },

  addSmartFolder: async (folder) => {
    try {
      const created = await chatAPI.createSmartFolder(folder);
      set((state) => ({ smartFolders: [...state.smartFolders, created] }));
      toast.success(`Folder "${created.name}" created`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create folder';
      toast.error(msg);
    }
  },

  setDuelHubOpen: (open) => set({ duelHubOpen: open }),

  removeSmartFolder: async (folderId) => {
    try {
      await chatAPI.deleteSmartFolder(folderId);
      set((state) => ({ smartFolders: state.smartFolders.filter((f) => f.id !== folderId) }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete folder';
      toast.error(msg);
    }
  },
}));
