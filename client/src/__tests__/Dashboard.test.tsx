import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { DashboardView } from '@/pages/DashboardView';

const MOCK_USER = {
  id: 'u1', authUserId: 'u1', email: 'admin@test.com', name: 'Admin',
  role: 'admin', level: 1, xp: 0, xpToNextLevel: 100,
  avatar: '', jobTitle: '', department: '', joinedAt: '',
  badges: [], stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online',
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true, isAdmin: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => ({
  performanceAPI: {
    getEnterpriseTeamMembers: vi.fn().mockResolvedValue([]),
    getWholesaleTeamMembers: vi.fn().mockResolvedValue([]),
    getTeam: vi.fn().mockResolvedValue({ members: [] }),
  },
  setOnUnauthorized: vi.fn(),
}));

vi.mock('@/data/dashboard', () => ({
  companyMetrics: {
    revenue: { value: 12450000, changePercent: 8.2, period: 'vs last quarter' },
    smsAttempts: { value: 662, changePercent: 12.4, unit: 'M' },
    mailAttempts: { value: 37, changePercent: -2.1, unit: 'M' },
  },
}));

describe('DashboardView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <DashboardView />
      </MemoryRouter>,
    );
  });
});
