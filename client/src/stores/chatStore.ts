import { create } from 'zustand';
import type { Channel, Message } from '@/types';
import { chatAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { joinChannel, leaveChannel } from '@/lib/socket';

export const ADMIN_MESSAGES_CHANNEL_ID = '__admin_messages__';

interface ChatState {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  isLoading: boolean;
  chatError: string | null;
  fetchChannels: (userId: string) => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  addChannel: (channel: Channel) => void;
  fetchMessages: (channelId: string, userId?: string) => Promise<void>;
  sendMessage: (content: string, userId: string, options?: { attachments?: unknown[]; mentions?: string[] }) => Promise<void>;
  addMessage: (message: Message) => void;
  incrementChannelUnread: (channelId: string) => void;
  addTypingUser: (channelId: string, userId: string) => void;
  removeTypingUser: (channelId: string, userId: string) => void;
  markChannelAsRead: (channelId: string, userId?: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  typingUsers: {},
  isLoading: false,
  chatError: null,

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

    // Leave old channel (skip for virtual admin-messages view)
    if (activeChannelId && activeChannelId !== ADMIN_MESSAGES_CHANNEL_ID) {
      leaveChannel(activeChannelId);
    }

    if (isAdminMessages) {
      set({ activeChannelId: channelId });
      return;
    }

    joinChannel(channelId);
    set({ activeChannelId: channelId });

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
      const body = { content, attachments: options?.attachments ?? [], mentions: options?.mentions ?? [] };
      const message = await chatAPI.sendMessage(activeChannelId, body, userId) as Message;
      get().addMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  },

  addMessage: (message) => {
    set((state) => {
      const channelMessages = state.messages[message.channelId] || [];
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
        return {
          typingUsers: {
            ...state.typingUsers,
            [channelId]: [...channelTyping, userId],
          },
        };
      }
      return state;
    });
  },

  removeTypingUser: (channelId, userId) => {
    set((state) => {
      const channelTyping = state.typingUsers[channelId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: channelTyping.filter((id) => id !== userId),
        },
      };
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
}));
