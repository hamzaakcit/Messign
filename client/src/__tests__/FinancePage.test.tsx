import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinancePage } from '@/pages/FinancePage';

const MOCK_USER = {
  id: 'u1', authUserId: 'u1', email: 'admin@test.com', name: 'Admin',
  role: 'admin' as const, level: 1, xp: 0, xpToNextLevel: 100,
  avatar: '', jobTitle: '', department: '', joinedAt: '',
  badges: [], stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online' as const,
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true, isAdmin: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/financeStore', () => ({
  useFinanceStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      activeView: 'overview' as const,
      setActiveView: vi.fn(),
      expenses: [],
      expensesTotal: 0,
      expensesPage: 0,
      expenseFilters: {},
      selectedExpenseIds: [],
      setExpenses: vi.fn(),
      setExpenseFilters: vi.fn(),
      setExpensesPage: vi.fn(),
      toggleExpenseSelection: vi.fn(),
      clearExpenseSelection: vi.fn(),
      selectAllExpenses: vi.fn(),
      currentExpense: null,
      setCurrentExpense: vi.fn(),
      notifications: [],
      unreadCount: 0,
      setNotifications: vi.fn(),
      addNotification: vi.fn(),
      markRead: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/financeApi', () => ({
  financeAPI: {
    getDashboard: vi.fn().mockResolvedValue({}),
    getDoraInsights: vi.fn().mockResolvedValue({ insights: [] }),
    listExpenses: vi.fn().mockResolvedValue({ expenses: [], total: 0, limit: 20, offset: 0 }),
    listBudgets: vi.fn().mockResolvedValue([]),
    getPendingApprovals: vi.fn().mockResolvedValue([]),
    getRecentActivity: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({ base_currency: 'USD' }),
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

vi.mock('@/components/finance/FinanceNav', () => ({
  FinanceNav: () => <nav data-testid="finance-nav" />,
}));

vi.mock('@/components/finance/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/components/finance/DoraInsightBar', () => ({
  DoraInsightBar: () => null,
}));

vi.mock('@/components/dora/DoraInsightBar', () => ({
  DoraInsightBar: () => null,
}));

vi.mock('@/components/finance/SpendingTrendChart', () => ({
  SpendingTrendChart: () => null,
}));

describe('FinancePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/finance']}>
          <Routes>
            <Route path="/finance/*" element={<FinancePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
});
