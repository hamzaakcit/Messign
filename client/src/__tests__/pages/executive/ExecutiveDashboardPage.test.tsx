import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, vi, beforeEach, expect } from 'vitest';

const MOCK_USER = {
  id: 'u1', authUserId: 'u1', email: 'admin@test.com', name: 'Admin',
  role: 'admin', level: 1, xp: 0, xpToNextLevel: 100,
  avatar: '', jobTitle: '', department: '', joinedAt: '',
  badges: [], stats: { tasksCompleted: 0, messagesSent: 0, projectsContributed: 0, collaborationScore: 0 },
  status: 'online',
};

const MOCK_DASHBOARD = {
  revenue: { totalYTD: 1200000, monthlyTrend: [{ month: 'Jan 26', value: 100000 }], pipelineValue: 500000, weightedPipeline: 350000, dealsWonThisMonth: 5, winRate: 42 },
  finance: { totalExpensesQTD: 80000, pendingApprovals: 3, overdueInvoices: 2, overdueAmount: 5000, budgetHealthAvg: 72, criticalBudgets: 1 },
  support: { openTickets: 15, avgResponseHours: 2.5, csatScore: 4.2, slaCompliance: 94, ticketsResolvedThisWeek: 12, atRiskCustomers: 2 },
  marketing: { mqls: 45, activeCampaigns: 3, avgROI: 2.1, topCampaign: { name: 'Spring Sale', roi: 3.2 }, leadsThisMonth: 120 },
  people: { totalEmployees: 85, openPositions: 7, avgUtilization: 78, newHiresThisMonth: 3, pendingTimesheets: 4 },
  projects: { activeProjects: 12, tasksCompletedThisWeek: 34, blockedTasks: 3, avgSprintVelocity: 65 },
  okrs: { overallProgress: 58, onTrack: 8, atRisk: 3, behind: 2 },
  culture: { healthScore: 76, engagementTrend: 'improving', sentimentAvg: 4.1 },
  operations: { contractsExpiringThisMonth: 1, licensesExpiringThisMonth: 2, assetsUnassigned: 5 },
  recentActivity: [{ id: 'a1', module: 'sales', type: 'deal.won', title: 'Deal closed', actor: 'Alice', timestamp: new Date().toISOString(), color: '#3b82f6' }],
  doraInsights: { criticalCount: 1, warningCount: 3, totalUnread: 5 },
};

const MOCK_CHART_DATA = {
  revenueTrend: [{ date: '2026-01-01', value: 10000 }],
  expenseTrend: [{ date: '2026-01-01', value: 5000 }],
  ticketTrend: [{ date: '2026-01-01', opened: 5, resolved: 3 }],
  leadsTrend: [{ date: '2026-01-01', value: 10 }],
  utilizationTrend: [{ date: '2026-01-01', value: 40 }],
};

const mockGetDashboard = vi.fn().mockResolvedValue(MOCK_DASHBOARD);
const mockGetChartData = vi.fn().mockResolvedValue(MOCK_CHART_DATA);

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: MOCK_USER, isAuthenticated: true, isAdmin: true };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/lib/api', () => ({
  executiveAPI: {
    getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
    getChartData: (...args: unknown[]) => mockGetChartData(...args),
  },
  financeAPI: { listExpenses: vi.fn().mockResolvedValue({ data: [] }) },
  crmAPI: { listDeals: vi.fn().mockResolvedValue({ data: [] }) },
  supportApi: { listTickets: vi.fn().mockResolvedValue({ data: [] }) },
  timeApi: { listTimesheets: vi.fn().mockResolvedValue({ data: [] }) },
  marketingAPI: { listCampaigns: vi.fn().mockResolvedValue({ data: [] }) },
  recruitmentAPI: { listApplications: vi.fn().mockResolvedValue({ data: [] }) },
  setOnUnauthorized: vi.fn(),
}));

vi.mock('@/lib/okrApi', () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  checkIn: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/socket', () => ({
  onActivityNew: vi.fn(() => () => {}),
}));

vi.mock('@/hooks/useDora', () => ({
  useDora: () => ({
    messages: [],
    isLoading: false,
    isStreaming: false,
    sendMessage: vi.fn(),
    clearChat: vi.fn(),
  }),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
  };
});

import { ExecutiveDashboardPage } from '@/pages/executive/ExecutiveDashboardPage';

describe('ExecutiveDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDashboard.mockResolvedValue(MOCK_DASHBOARD);
    mockGetChartData.mockResolvedValue(MOCK_CHART_DATA);
  });

  it('renders all department cards after data loads', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('Command Center')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dept-card-sales')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-finance')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-support')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-marketing')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-hr')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-engineering')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-okr')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-time')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-culture')).toBeInTheDocument();
    expect(screen.getByTestId('dept-card-operations')).toBeInTheDocument();
  });

  it('renders KPI strip with correct values', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('executive-kpis')).toBeInTheDocument();
    });

    expect(screen.getByText('€1.2M')).toBeInTheDocument();
  });

  it('opens quick action modal when department action button is clicked', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('action-btn-finance')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-btn-finance'));

    await waitFor(() => {
      expect(screen.getByText('Finance Actions')).toBeInTheDocument();
    });
  });

  it('renders Dora AI panel', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('dora-command-panel')).toBeInTheDocument();
    });
  });

  it('renders activity feed with items', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByTestId('executive-activity')).toBeInTheDocument();
    });

    expect(screen.getByText('Deal closed')).toBeInTheDocument();
  });

  it('shows Dora insights banner when there are critical items', async () => {
    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/1 critical/)).toBeInTheDocument();
    });
  });

  it('shows error state when data fails to load', async () => {
    mockGetDashboard.mockRejectedValue(new Error('Network error'));
    mockGetChartData.mockRejectedValue(new Error('Network error'));

    render(<MemoryRouter><ExecutiveDashboardPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
