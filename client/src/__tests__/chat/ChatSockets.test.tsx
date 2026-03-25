import { describe, it, vi, beforeEach, expect } from 'vitest';

vi.mock('@/lib/api', () => ({
  chatAPI: {
    getChannels: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue({ id: 'm1', channelId: 'ch1', userId: 'u1', content: 'test' }),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    getPins: vi.fn().mockResolvedValue([]),
    getMedia: vi.fn().mockResolvedValue([]),
    doraSummarize: vi.fn().mockResolvedValue({ summary: '', keyTopics: [], participantCount: 0, messageCount: 0 }),
    doraActionItems: vi.fn().mockResolvedValue({ actionItems: [], confidence: 0 }),
    doraSmartReply: vi.fn().mockResolvedValue({ replies: [], contextSummary: '' }),
    doraSuggest: vi.fn().mockResolvedValue({ suggestions: [], query: '' }),
    searchMessages: vi.fn().mockResolvedValue([]),
    createChannel: vi.fn().mockResolvedValue({ id: 'new', name: 'new', type: 'public', members: [], createdAt: '' }),
    getThreadMessages: vi.fn().mockResolvedValue([]),
    universalSearch: vi.fn().mockResolvedValue({ messages: [], tasks: [], documents: [], users: [] }),
    getSmartFolders: vi.fn().mockResolvedValue([]),
    createSmartFolder: vi.fn(),
    deleteSmartFolder: vi.fn(),
  },
  fetchAPI: vi.fn(),
  API_BASE: '',
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/socket', () => ({
  joinChannel: vi.fn(),
  leaveChannel: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}));

describe('ChatStore socket-driven actions', () => {
  let useChatStore: typeof import('@/stores/chatStore').useChatStore;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/stores/chatStore');
    useChatStore = mod.useChatStore;
    useChatStore.setState({
      messages: {
        ch1: [
          { id: 'm1', channelId: 'ch1', userId: 'u1', content: 'Hello', attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(), reactions: [], isPinned: false, isEdited: false, metadata: {}, threadId: null, replyCount: 0 },
          { id: 'm2', channelId: 'ch1', userId: 'u2', content: 'World', attachments: [], mentions: [], xpGained: 5, timestamp: new Date().toISOString(), reactions: [{ emoji: '👍', users: ['u1'] }], isPinned: false, isEdited: false, metadata: {}, threadId: null, replyCount: 2 },
        ],
      },
      channels: [{ id: 'ch1', name: 'general', type: 'public' as const, members: ['u1', 'u2'], unreadCount: 0, createdAt: '' }],
      activeChannelId: 'ch1',
    });
  });

  it('updateMessageReactions updates reactions for correct message', () => {
    const newReactions = [{ emoji: '❤️', users: ['u1', 'u2'] }];
    useChatStore.getState().updateMessageReactions('m1', 'ch1', newReactions);
    const msg = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm1');
    expect(msg?.reactions).toEqual(newReactions);
  });

  it('editMessage updates content and sets isEdited', () => {
    useChatStore.getState().editMessage('m1', 'ch1', 'Updated content');
    const msg = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm1');
    expect(msg?.content).toBe('Updated content');
    expect(msg?.isEdited).toBe(true);
  });

  it('deleteMessage marks message as deleted', () => {
    useChatStore.getState().deleteMessage('m1', 'ch1');
    const msg = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm1');
    expect(msg?.content).toBe('[deleted]');
    expect(msg?.isDeleted).toBe(true);
  });

  it('pinMessage updates isPinned flag', () => {
    useChatStore.getState().pinMessage('m1', 'ch1', true);
    const msg = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm1');
    expect(msg?.isPinned).toBe(true);
  });

  it('updateThreadReplyCount updates the reply count on parent message', () => {
    useChatStore.getState().updateThreadReplyCount('m2', 5);
    const msg = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm2');
    expect(msg?.replyCount).toBe(5);
  });

  it('does not affect other messages when updating reactions', () => {
    const newReactions = [{ emoji: '🎉', users: ['u1'] }];
    useChatStore.getState().updateMessageReactions('m1', 'ch1', newReactions);
    const m2 = useChatStore.getState().messages['ch1']?.find((m) => m.id === 'm2');
    expect(m2?.reactions).toEqual([{ emoji: '👍', users: ['u1'] }]);
  });
});
