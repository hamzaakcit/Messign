import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { DoraPage } from '@/pages/DoraPage';

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

vi.mock('@/stores/doraStore', () => ({
  useDoraStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      sessions: [],
      activeSessionId: null,
      createSession: vi.fn().mockReturnValue({ id: 's1', title: 'New', messages: [], createdAt: new Date().toISOString() }),
      setActiveSession: vi.fn(),
      getActiveMessages: vi.fn().mockReturnValue([]),
      setActiveMessages: vi.fn(),
      addMessage: vi.fn(),
      updateLastMessage: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/doraSessionStore', () => {
  const mem = {
    recentIntents: [] as string[],
    frequentCategories: [] as string[],
    preferredMode: 'concise' as const,
    conversationContext: [] as string[],
    visitedModulePrefixes: [] as string[],
    addIntent: vi.fn(),
    clearSession: vi.fn(),
    setPreferredMode: vi.fn(),
    setConversationContext: vi.fn(),
    recordPath: vi.fn(),
  };
  const useStore = vi.fn((selector?: (s: unknown) => unknown) => (selector ? selector(mem) : mem));
  return { useDoraSessionStore: Object.assign(useStore, { getState: () => mem }) };
});

vi.mock('@/hooks/knowledge-hub/useAIChat', () => ({
  useAIChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    isStreaming: false,
    error: null,
    interactionMode: 'ask',
    setInteractionMode: vi.fn(),
    sendMessage: vi.fn(),
    submitFeedback: vi.fn(),
    clearPendingConfirmation: vi.fn(),
    cancelActConfirmation: vi.fn(),
    clearChat: vi.fn(),
    abortStream: vi.fn(),
  })),
}));

vi.mock('@/lib/knowledge-hub/api', () => ({
  khPresentationAPI: { create: vi.fn(), get: vi.fn() },
}));

vi.mock('@/lib/api', () => ({ API_ORIGIN: '', setOnUnauthorized: vi.fn() }));
vi.mock('@/lib/authToken', () => ({ getAccessToken: vi.fn(() => null) }));

describe('DoraPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <DoraPage />
      </MemoryRouter>,
    );
  });
});
