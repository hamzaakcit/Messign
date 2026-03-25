import { describe, it, expect, vi, beforeEach } from 'vitest';

const offSpy = vi.fn();
const onSpy = vi.fn();

vi.mock('@/lib/socket', () => ({
  getSocket: () => ({
    on: onSpy,
    off: offSpy,
  }),
  onMessageReact: vi.fn(() => vi.fn()),
  onMessageEdit: vi.fn(() => vi.fn()),
  onMessageDelete: vi.fn(() => vi.fn()),
  onMessagePin: vi.fn(() => vi.fn()),
  onThreadReply: vi.fn(() => vi.fn()),
  onSocketError: vi.fn(),
  offSocketError: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'u1' } }),
  },
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      addMessage: vi.fn(),
      incrementChannelUnread: vi.fn(),
      fetchChannels: vi.fn(),
      updateMessageReactions: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
      pinMessage: vi.fn(),
      updateThreadReplyCount: vi.fn(),
    }),
  },
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: {
    getState: () => ({ currentView: 'dashboard' }),
  },
}));

describe('installChatSocketHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to message:new and cleanup calls socket.off', async () => {
    const { installChatSocketHandlers } = await import('@/lib/chatSocketBridge');
    const cleanup = installChatSocketHandlers();
    expect(onSpy).toHaveBeenCalledWith('message:new', expect.any(Function));
    cleanup();
    expect(offSpy).toHaveBeenCalledWith('message:new', expect.any(Function));
  });
});
