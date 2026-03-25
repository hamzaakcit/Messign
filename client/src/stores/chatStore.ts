import { create } from 'zustand';
import type {
  Channel, Message, Reaction, DoraSummaryResult,
  DoraActionItemsResult, SmartReplyResult, ChatSearchResult, ChatMediaItem,
  DoraKBSuggestion,
} from '@/types';
import { chatAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { joinChannel, leaveChannel } from '@/lib/socket';

export const ADMIN_MESSAGES_CHANNEL_ID = '__admin_messages__';

export type DetailTab = 'members' | 'pins' | 'media' | 'settings';

interface ChatState {
  // Core
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  isLoading: boolean;
  chatError: string | null;

  // v2: Detail panel
  detailPanelOpen: boolean;
  detailTab: DetailTab;
  pinnedMessages: Record<string, Message[]>;
  channelMedia: Record<string, ChatMediaItem[]>;

  // v2: Dora AI
  doraSummary: DoraSummaryResult | null;
  doraActionItems: DoraActionItemsResult | null;
  doraSuggestions: Record<string, DoraKBSuggestion[]>;
  doraLoading: boolean;
  doraPanelOpen: boolean;

  // v2: Smart Reply
  smartReplies: SmartReplyResult | null;
  smartReplyLoading: boolean;

  // v2: Search
  searchQuery: string;
  searchResults: ChatSearchResult[];
  searchOpen: boolean;

  // v2: Mobile
  mobileSidebarOpen: boolean;

  // v2: Channel creation
  channelCreateOpen: boolean;

  // v2: Context menu
  contextMenuMessage: Message | null;
  contextMenuPosition: { x: number; y: number } | null;

  // v2: Editing
  editingMessageId: string | null;

  // Actions: Core
  fetchChannels: (userId: string) => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  addChannel: (channel: Channel) => void;
  fetchMessages: (channelId: string, userId?: string) => Promise<void>;
  sendMessage: (content: string, userId: string, options?: { attachments?: unknown[]; mentions?: string[]; metadata?: Record<string, unknown> }) => Promise<void>;
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

  // Actions: v2 Detail panel
  toggleDetailPanel: () => void;
  setDetailTab: (tab: DetailTab) => void;
  fetchPins: (channelId: string) => Promise<void>;
  fetchMedia: (channelId: string) => Promise<void>;

  // Actions: v2 Dora
  toggleDoraPanel: () => void;
  fetchDoraSummary: (channelId: string) => Promise<void>;
  fetchDoraActionItems: (channelId: string) => Promise<void>;
  fetchSmartReplies: (channelId: string) => Promise<void>;
  clearSmartReplies: () => void;

  // Actions: v2 Search
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  performSearch: (query: string, channelId?: string) => Promise<void>;

  // Actions: v2 Channel management
  createChannel: (data: { name: string; description?: string; type?: string; members?: string[] }) => Promise<void>;
  setChannelCreateOpen: (open: boolean) => void;

  // Actions: v2 Mobile
  setMobileSidebarOpen: (open: boolean) => void;

  // Actions: v2 Context menu
  openContextMenu: (message: Message, position: { x: number; y: number }) => void;
  closeContextMenu: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Core state
  channels: [],
  activeChannelId: null,
  messages: {},
  typingUsers: {},
  isLoading: false,
  chatError: null,

  // v2 state
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
  mobileSidebarOpen: false,
  channelCreateOpen: false,
  contextMenuMessage: null,
  contextMenuPosition: null,
  editingMessageId: null,

  // ── Core Actions ──

  fetchChannels: async (userId: string) => {
    if (!userId) return;
    try {
      set({ isLoading: true, chatError: null });
      const channels = await chatAPI.getChannels(userId) as Channel[];
      set({ channels, isLoading: false, chatError: null });
      if (channels.length > 0 && !get().activeChannelId) {
        get().setActiveChannel(channels[0].id);
      }
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
    set({ activeChannelId: channelId, smartReplies: null, doraSummary: null, doraActionItems: null });
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
      const messages = await chatAPI.getMessages(channelId, userId ?? undefined) as Message[];
      set((state) => ({
        messages: { ...state.messages, [channelId]: messages },
        chatError: null,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch messages';
      console.error('Failed to fetch messages:', error);
      set({ chatError: msg });
    }
  },

  sendMessage: async (content, userId, options) => {
    const { activeChannelId } = get();
    if (!activeChannelId) return;
    try {
      const body = {
        content,
        attachments: options?.attachments ?? [],
        mentions: options?.mentions ?? [],
        metadata: options?.metadata ?? {},
      };
      const message = await chatAPI.sendMessage(activeChannelId, body, userId) as Message;
      get().addMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
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

  // ── v2 Detail Panel ──

  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
  setDetailTab: (tab) => set({ detailTab: tab, detailPanelOpen: true }),

  fetchPins: async (channelId) => {
    try {
      const pins = await chatAPI.getPins(channelId);
      set((state) => ({ pinnedMessages: { ...state.pinnedMessages, [channelId]: pins } }));
    } catch (e) {
      console.error('Failed to fetch pins:', e);
    }
  },

  fetchMedia: async (channelId) => {
    try {
      const media = await chatAPI.getMedia(channelId);
      set((state) => ({ channelMedia: { ...state.channelMedia, [channelId]: media } }));
    } catch (e) {
      console.error('Failed to fetch media:', e);
    }
  },

  // ── v2 Dora ──

  toggleDoraPanel: () => set((s) => ({ doraPanelOpen: !s.doraPanelOpen })),

  fetchDoraSummary: async (channelId) => {
    set({ doraLoading: true });
    try {
      const summary = await chatAPI.doraSummarize(channelId);
      set({ doraSummary: summary, doraLoading: false });
    } catch {
      set({ doraLoading: false });
    }
  },

  fetchDoraActionItems: async (channelId) => {
    set({ doraLoading: true });
    try {
      const items = await chatAPI.doraActionItems(channelId);
      set({ doraActionItems: items, doraLoading: false });
    } catch {
      set({ doraLoading: false });
    }
  },

  fetchSmartReplies: async (channelId) => {
    set({ smartReplyLoading: true });
    try {
      const result = await chatAPI.doraSmartReply(channelId);
      set({ smartReplies: result, smartReplyLoading: false });
    } catch {
      set({ smartReplyLoading: false });
    }
  },

  clearSmartReplies: () => set({ smartReplies: null }),

  // ── v2 Search ──

  setSearchOpen: (open) => set({ searchOpen: open, searchResults: open ? get().searchResults : [] }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  performSearch: async (query, channelId) => {
    if (!query.trim()) { set({ searchResults: [] }); return; }
    try {
      const results = await chatAPI.searchMessages(query, channelId);
      set({ searchResults: results });
    } catch {
      set({ searchResults: [] });
    }
  },

  // ── v2 Channel management ──

  createChannel: async (data) => {
    try {
      const channel = await chatAPI.createChannel(data);
      get().addChannel(channel);
      get().setActiveChannel(channel.id);
      set({ channelCreateOpen: false });
    } catch (e) {
      console.error('Failed to create channel:', e);
    }
  },

  setChannelCreateOpen: (open) => set({ channelCreateOpen: open }),

  // ── v2 Mobile ──
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  // ── v2 Context menu ──
  openContextMenu: (message, position) => set({ contextMenuMessage: message, contextMenuPosition: position }),
  closeContextMenu: () => set({ contextMenuMessage: null, contextMenuPosition: null }),
}));
