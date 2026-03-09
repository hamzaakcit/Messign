import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { FinancePage } from '@/pages/FinancePage';

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

vi.mock('@/stores/financeStore', () => ({
  useFinanceStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { currentView: 'dashboard', setView: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/financeApi', () => ({
  financeAPI: {
    getDashboard: vi.fn().mockResolvedValue({}),
    getDoraInsights: vi.fn().mockResolvedValue({ insights: [] }),
    getExpenses: vi.fn().mockResolvedValue([]),
    listBudgets: vi.fn().mockResolvedValue([]),
    getPendingApprovals: vi.fn().mockResolvedValue([]),
    getRecentActivity: vi.fn().mockResolvedValue([]),
    getNotifications: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    getMe: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin', email: 'admin@test.com', full_name: 'Admin' }),
    getCategoryDepartmentMap: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/api', () => ({
  reimbursementAPI: {
    getMyRequests: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
  },
  budgetsAPI: { list: vi.fn().mockResolvedValue([]) },
  setOnUnauthorized: vi.fn(),
}));

describe('FinancePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <FinancePage />
      </MemoryRouter>,
    );
  });
});
