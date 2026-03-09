import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { ChatView } from '@/pages/ChatView';

const MOCK_USER = {
  id: 'u1', authUserId: 'u1', email: 'admin@test.com', name: 'Admin',
  role: 'admin', level: 1, xp: 0, xpToNextLevel: 100,
  avatar: '', jobTitle: '', department: '', joinedAt: '',
  badges: [], stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online',
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  ADMIN_MESSAGES_CHANNEL_ID: '__admin__',
  useChatStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      channels: [],
      activeChannelId: null,
      messages: {},
      setActiveChannel: vi.fn(),
      fetchChannels: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

describe('ChatView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ChatView />
      </MemoryRouter>,
    );
  });
});
