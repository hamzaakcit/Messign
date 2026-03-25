import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, vi, beforeEach } from 'vitest';
import { ProjectsView } from '@/pages/ProjectsView';

const MOCK_USER = {
  id: 'u1',
  authUserId: 'u1',
  email: 'admin@test.com',
  name: 'Admin',
  role: 'admin',
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  avatar: '',
  jobTitle: '',
  department: '',
  joinedAt: '',
  badges: [],
  stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online',
};

const mockFetchTasks = vi.fn();
const mockSetActiveProject = vi.fn();

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
      activeProjectId: null,
      tasksLoading: false,
      setActiveProject: mockSetActiveProject,
      fetchTasks: mockFetchTasks,
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/hooks/useMarketplaceProjectsQuery', () => ({
  marketplaceProjectsQueryKey: (userId: string) => ['marketplace-projects', userId] as const,
  useMarketplaceProjectsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useOpenBountiesQuery', () => ({
  openBountiesQueryKey: (userId: string) => ['bounties-open', userId] as const,
  useOpenBountiesQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  projectsAPI: {
    getMarketplace: vi.fn().mockResolvedValue([]),
    apply: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
  bountiesAPI: {
    list: vi.fn().mockResolvedValue({ bounties: [] }),
  },
  setOnUnauthorized: vi.fn(),
}));

function renderProjects(path = '/projects') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ProjectsView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProjectsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Opportunity Hub and search', async () => {
    renderProjects();
    expect(screen.getByPlaceholderText(/Search opportunities/i)).toBeInTheDocument();
    await waitFor(() => {
      const el = document.getElementById('projects-opportunity-count');
      expect(el).toBeTruthy();
      expect(el).toHaveTextContent(/opportunities match your filters/i);
    });
  });

  it('shows empty opportunities message when list is empty', () => {
    renderProjects();
    expect(screen.getByText(/No opportunities found/i)).toBeInTheDocument();
  });

  it('reads tab=tasks from URL and calls fetchTasks', async () => {
    renderProjects('/projects?tab=tasks');
    expect(mockFetchTasks).toHaveBeenCalled();
  });
});
