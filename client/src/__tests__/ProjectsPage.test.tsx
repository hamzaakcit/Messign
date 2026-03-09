import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { ProjectsView } from '@/pages/ProjectsView';

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

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      projects: [],
      tasks: [],
      selectedProjectId: null,
      setSelectedProject: vi.fn(),
      fetchProjects: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => ({
  projectsAPI: {
    list: vi.fn().mockResolvedValue([]),
    getMarketplace: vi.fn().mockResolvedValue([]),
  },
  bountiesAPI: {
    list: vi.fn().mockResolvedValue([]),
  },
  setOnUnauthorized: vi.fn(),
}));

describe('ProjectsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ProjectsView />
      </MemoryRouter>,
    );
  });
});
