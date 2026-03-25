import { fetchWithUserId } from './apiCore';

export const performanceAPI = {
  getCompany: (userId: string) => fetchWithUserId<{ success: boolean; data: unknown }>('/performance/company', userId),
  getCompanyTrends: (userId: string, period: string) =>
    fetchWithUserId<{ success: boolean; data: unknown[] }>(`/performance/company/trends?period=${period}`, userId),
  getTeam: (userId: string, teamId: string) =>
    fetchWithUserId<{ success: boolean; data: unknown }>(`/performance/teams/${teamId}`, userId),
  getTeamMembers: (userId: string, teamId: string) =>
    fetchWithUserId<{ success: boolean; data: { members: unknown[] } }>(`/performance/teams/${teamId}/members`, userId),
  getTeamTrends: (userId: string, teamId: string, period: string) =>
    fetchWithUserId<{ success: boolean; data: unknown[] }>(`/performance/teams/${teamId}/trends?period=${period}`, userId),
};

export const dashboardAPI = {
  getTrends: (
    userId: string,
    params: { metric: string; entityId: string; range: string }
  ) => {
    const q = new URLSearchParams(params).toString();
    return fetchWithUserId<{ success: boolean; data: { period: string; value: number }[] }>(
      `/dashboard/trends?${q}`,
      userId
    );
  },
};

export interface ExecutiveDashboard {
  revenue: { totalYTD: number; monthlyTrend: { month: string; value: number }[]; pipelineValue: number; weightedPipeline: number; dealsWonThisMonth: number; winRate: number };
  finance: { totalExpensesQTD: number; pendingApprovals: number; overdueInvoices: number; overdueAmount: number; budgetHealthAvg: number; criticalBudgets: number };
  support: { openTickets: number; avgResponseHours: number; csatScore: number; slaCompliance: number; ticketsResolvedThisWeek: number; atRiskCustomers: number };
  marketing: { mqls: number; activeCampaigns: number; avgROI: number; topCampaign: { name: string; roi: number } | null; leadsThisMonth: number };
  people: { totalEmployees: number; openPositions: number; avgUtilization: number; newHiresThisMonth: number; pendingTimesheets: number };
  projects: { activeProjects: number; tasksCompletedThisWeek: number; blockedTasks: number; avgSprintVelocity: number };
  okrs: { overallProgress: number; onTrack: number; atRisk: number; behind: number };
  culture: { healthScore: number; engagementTrend: string; sentimentAvg: number } | null;
  operations: { contractsExpiringThisMonth: number; licensesExpiringThisMonth: number; assetsUnassigned: number };
  recentActivity: { id: string; module: string; type: string; title: string; actor: string; timestamp: string; color: string }[];
  doraInsights: { criticalCount: number; warningCount: number; totalUnread: number };
}

export interface PendingItems {
  expenses: { id: string; title: string; amount: number; currency: string; submitter: string; submittedAt: string }[];
  timesheets: { id: string; userName: string; period: string; totalHours: number; submittedAt: string }[];
  tickets: { id: string; subject: string; priority: string; status: string; assignee: string | null; createdAt: string }[];
  applications: { id: string; candidateName: string; jobTitle: string; stage: string; appliedAt: string }[];
  marketingApprovals: { id: string; contentTitle: string; type: string; requestedBy: string; requestedAt: string }[];
  overdueInvoices: { id: string; clientName: string; amount: number; dueDate: string; daysPastDue: number }[];
}

export interface ExecutiveChartData {
  revenueTrend: { date: string; value: number }[];
  expenseTrend: { date: string; value: number }[];
  ticketTrend: { date: string; opened: number; resolved: number }[];
  leadsTrend: { date: string; value: number }[];
  utilizationTrend: { date: string; value: number }[];
}

export const executiveAPI = {
  getDashboard: (userId: string) =>
    fetchWithUserId<ExecutiveDashboard>('/executive/dashboard', userId),
  getRevenue: (userId: string) =>
    fetchWithUserId<ExecutiveDashboard['revenue']>('/executive/dashboard/revenue', userId),
  getFinance: (userId: string) =>
    fetchWithUserId<ExecutiveDashboard['finance']>('/executive/dashboard/finance', userId),
  getActivity: (userId: string) =>
    fetchWithUserId<ExecutiveDashboard['recentActivity']>('/executive/dashboard/activity', userId),
  getPendingItems: (userId: string) =>
    fetchWithUserId<PendingItems>('/executive/pending-items', userId),
  getChartData: (userId: string) =>
    fetchWithUserId<ExecutiveChartData>('/executive/chart-data', userId),
};

export interface BriefingItem {
  text: string;
  actionUrl?: string;
  actionLabel?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
}

export interface BriefingSection {
  module: string;
  icon: string;
  title: string;
  items: BriefingItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface DailyBriefing {
  id: string;
  userId: string;
  date: string;
  greeting: string;
  summary: string;
  sections: BriefingSection[];
  generatedAt: string;
}

export const doraBriefingAPI = {
  getToday: (userId: string, refresh = false) =>
    fetchWithUserId<DailyBriefing>(`/dora/daily${refresh ? '?refresh=true' : ''}`, userId),
  getByDate: (userId: string, date: string) =>
    fetchWithUserId<DailyBriefing>(`/dora/daily/${date}`, userId),
};

export interface DoraUserStats {
  queryCount: number;
  specialistsUsed: { specialist: string; count: number }[];
}

export const doraAiStatsAPI = {
  getUserStats: (userId: string, range = '7d') =>
    fetchWithUserId<DoraUserStats>(`/knowledge-hub/ai/user-stats?range=${range}`, userId),
};
