import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import { CommandCenterKPIStrip } from '@/pages/executive/components/CommandCenterKPIStrip';
import type { ExecutiveDashboard } from '@/lib/executiveApi';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const MOCK_DATA: ExecutiveDashboard = {
  revenue: { totalYTD: 2000000, monthlyTrend: [], pipelineValue: 800000, weightedPipeline: 600000, dealsWonThisMonth: 10, winRate: 50 },
  finance: { totalExpensesQTD: 100000, pendingApprovals: 5, overdueInvoices: 2, overdueAmount: 8000, budgetHealthAvg: 80, criticalBudgets: 0 },
  support: { openTickets: 20, avgResponseHours: 3, csatScore: 4.5, slaCompliance: 96, ticketsResolvedThisWeek: 15, atRiskCustomers: 1 },
  marketing: { mqls: 50, activeCampaigns: 4, avgROI: 2.5, topCampaign: null, leadsThisMonth: 100 },
  people: { totalEmployees: 90, openPositions: 5, avgUtilization: 82, newHiresThisMonth: 2, pendingTimesheets: 3 },
  projects: { activeProjects: 8, tasksCompletedThisWeek: 40, blockedTasks: 1, avgSprintVelocity: 70 },
  okrs: { overallProgress: 65, onTrack: 10, atRisk: 2, behind: 1 },
  culture: { healthScore: 85, engagementTrend: 'stable', sentimentAvg: 4.3 },
  operations: { contractsExpiringThisMonth: 0, licensesExpiringThisMonth: 0, assetsUnassigned: 0 },
  recentActivity: [],
  doraInsights: { criticalCount: 0, warningCount: 0, totalUnread: 0 },
};

describe('CommandCenterKPIStrip', () => {
  it('renders 8 KPI items', () => {
    const onClick = vi.fn();
    render(<CommandCenterKPIStrip data={MOCK_DATA} chartData={null} onKPIClick={onClick} />);

    expect(screen.getByText('Revenue YTD')).toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.getByText('OKR Progress')).toBeInTheDocument();
    expect(screen.getByText('Utilization')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
    expect(screen.getByText('Open Positions')).toBeInTheDocument();
    expect(screen.getByText('Culture Score')).toBeInTheDocument();
  });

  it('formats currency correctly', () => {
    const onClick = vi.fn();
    render(<CommandCenterKPIStrip data={MOCK_DATA} chartData={null} onKPIClick={onClick} />);
    expect(screen.getByText('€2.0M')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('600'))).toBeInTheDocument();
  });

  it('calls onKPIClick when a KPI is clicked', () => {
    const onClick = vi.fn();
    render(<CommandCenterKPIStrip data={MOCK_DATA} chartData={null} onKPIClick={onClick} />);

    fireEvent.click(screen.getByTestId('kpi-revenue-ytd'));
    expect(onClick).toHaveBeenCalledWith('sales');
  });

  it('shows culture score from real data', () => {
    const onClick = vi.fn();
    render(<CommandCenterKPIStrip data={MOCK_DATA} chartData={null} onKPIClick={onClick} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('shows N/A when culture data is null', () => {
    const onClick = vi.fn();
    const dataWithNullCulture = { ...MOCK_DATA, culture: null };
    render(<CommandCenterKPIStrip data={dataWithNullCulture} chartData={null} onKPIClick={onClick} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
