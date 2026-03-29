import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { DashboardView } from '@/pages/DashboardView';

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

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true, isAdmin: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/components/dashboard/MainDashboard', () => ({
  MainDashboard: () => (
    <div data-testid="main-dashboard" role="main" aria-label="Dashboard">
      Dashboard
    </div>
  ),
}));

describe('DashboardView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders MainDashboard shell', () => {
    const { getByTestId, getByRole } = render(
      <MemoryRouter>
        <DashboardView />
      </MemoryRouter>,
    );
    expect(getByTestId('main-dashboard')).toBeTruthy();
    expect(getByRole('main', { name: /dashboard/i })).toBeTruthy();
  });
});
