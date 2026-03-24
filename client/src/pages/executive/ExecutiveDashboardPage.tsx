import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onActivityNew } from '@/lib/socket';
import { executiveAPI, type ExecutiveDashboard } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const DISMISS_KEY = 'executive-briefing-dismissed-date';

/** Safe defaults so the UI never reads undefined nested fields (avoids runtime crashes). */
const EMPTY_DASHBOARD: ExecutiveDashboard = {
  revenue: {
    totalYTD: 0,
    monthlyTrend: [],
    pipelineValue: 0,
    weightedPipeline: 0,
    dealsWonThisMonth: 0,
    winRate: 0,
  },
  finance: {
    totalExpensesQTD: 0,
    pendingApprovals: 0,
    overdueInvoices: 0,
    overdueAmount: 0,
    budgetHealthAvg: 0,
    criticalBudgets: 0,
  },
  support: {
    openTickets: 0,
    avgResponseHours: 0,
    csatScore: 0,
    slaCompliance: 100,
    ticketsResolvedThisWeek: 0,
    atRiskCustomers: 0,
  },
  marketing: {
    mqls: 0,
    activeCampaigns: 0,
    avgROI: 0,
    topCampaign: null,
    leadsThisMonth: 0,
  },
  people: {
    totalEmployees: 0,
    openPositions: 0,
    avgUtilization: 0,
    newHiresThisMonth: 0,
    pendingTimesheets: 0,
  },
  projects: {
    activeProjects: 0,
    tasksCompletedThisWeek: 0,
    blockedTasks: 0,
    avgSprintVelocity: 0,
  },
  okrs: { overallProgress: 0, onTrack: 0, atRisk: 0, behind: 0 },
  culture: null,
  operations: { contractsExpiringThisMonth: 0, licensesExpiringThisMonth: 0, assetsUnassigned: 0 },
  recentActivity: [],
  doraInsights: { criticalCount: 0, warningCount: 0, totalUnread: 0 },
};

function mergeExecutivePayload(raw: unknown): ExecutiveDashboard {
  if (!raw || typeof raw !== 'object') return EMPTY_DASHBOARD;
  const r = raw as Partial<ExecutiveDashboard>;
  const rev = r.revenue;
  const fin = r.finance;
  const sup = r.support;
  const mkt = r.marketing;
  const ppl = r.people;
  const prj = r.projects;
  const okr = r.okrs;
  const ops = r.operations;
  const dora = r.doraInsights;
  return {
    revenue: {
      totalYTD: Number(rev?.totalYTD) || 0,
      monthlyTrend: Array.isArray(rev?.monthlyTrend) ? rev!.monthlyTrend : [],
      pipelineValue: Number(rev?.pipelineValue) || 0,
      weightedPipeline: Number(rev?.weightedPipeline) || 0,
      dealsWonThisMonth: Number(rev?.dealsWonThisMonth) || 0,
      winRate: Number(rev?.winRate) || 0,
    },
    finance: {
      totalExpensesQTD: Number(fin?.totalExpensesQTD) || 0,
      pendingApprovals: Number(fin?.pendingApprovals) || 0,
      overdueInvoices: Number(fin?.overdueInvoices) || 0,
      overdueAmount: Number(fin?.overdueAmount) || 0,
      budgetHealthAvg: Number(fin?.budgetHealthAvg) || 0,
      criticalBudgets: Number(fin?.criticalBudgets) || 0,
    },
    support: {
      openTickets: Number(sup?.openTickets) || 0,
      avgResponseHours: Number(sup?.avgResponseHours) || 0,
      csatScore: Number(sup?.csatScore) || 0,
      slaCompliance: (() => {
        const v = Number(sup?.slaCompliance);
        return Number.isFinite(v) ? v : 100;
      })(),
      ticketsResolvedThisWeek: Number(sup?.ticketsResolvedThisWeek) || 0,
      atRiskCustomers: Number(sup?.atRiskCustomers) || 0,
    },
    marketing: {
      mqls: Number(mkt?.mqls) || 0,
      activeCampaigns: Number(mkt?.activeCampaigns) || 0,
      avgROI: Number(mkt?.avgROI) || 0,
      topCampaign: mkt?.topCampaign ?? null,
      leadsThisMonth: Number(mkt?.leadsThisMonth) || 0,
    },
    people: {
      totalEmployees: Number(ppl?.totalEmployees) || 0,
      openPositions: Number(ppl?.openPositions) || 0,
      avgUtilization: Number(ppl?.avgUtilization) || 0,
      newHiresThisMonth: Number(ppl?.newHiresThisMonth) || 0,
      pendingTimesheets: Number(ppl?.pendingTimesheets) || 0,
    },
    projects: {
      activeProjects: Number(prj?.activeProjects) || 0,
      tasksCompletedThisWeek: Number(prj?.tasksCompletedThisWeek) || 0,
      blockedTasks: Number(prj?.blockedTasks) || 0,
      avgSprintVelocity: Number(prj?.avgSprintVelocity) || 0,
    },
    okrs: {
      overallProgress: Number(okr?.overallProgress) || 0,
      onTrack: Number(okr?.onTrack) || 0,
      atRisk: Number(okr?.atRisk) || 0,
      behind: Number(okr?.behind) || 0,
    },
    culture: r.culture ?? null,
    operations: {
      contractsExpiringThisMonth: Number(ops?.contractsExpiringThisMonth) || 0,
      licensesExpiringThisMonth: Number(ops?.licensesExpiringThisMonth) || 0,
      assetsUnassigned: Number(ops?.assetsUnassigned) || 0,
    },
    recentActivity: Array.isArray(r.recentActivity) ? r.recentActivity : [],
    doraInsights: {
      criticalCount: Number(dora?.criticalCount) || 0,
      warningCount: Number(dora?.warningCount) || 0,
      totalUnread: Number(dora?.totalUnread) || 0,
    },
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function relTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ExecutiveDashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const userId = user?.authUserId || user?.id || '';
  const [data, setData] = useState<ExecutiveDashboard>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setBannerDismissed(localStorage.getItem(DISMISS_KEY) === todayKey());
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    executiveAPI
      .getDashboard(userId)
      .then((d) => {
        if (!cancelled) {
          setData(mergeExecutivePayload(d));
          setLoadError(false);
        }
      })
      .catch((err) => {
        console.error('[executive] load failed', err);
        if (!cancelled) {
          setData(EMPTY_DASHBOARD);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const off = onActivityNew((event) => {
      const title = typeof event?.message === 'string' ? event.message : 'New activity';
      setData((prev) => ({
        ...prev,
        recentActivity: [
          {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `act-${Date.now()}`,
            module: 'system',
            type: event?.type ?? 'activity',
            title,
            actor: 'System',
            timestamp: new Date().toISOString(),
            color: '#8b5cf6',
          },
          ...prev.recentActivity,
        ].slice(0, 15),
      }));
    });
    return off;
  }, []);

  const kpis = useMemo(() => {
    const rev = data.revenue;
    const sup = data.support;
    const okr = data.okrs;
    const ppl = data.people;
    const fin = data.finance;
    const denom = 1_000_000;
    return [
      { label: 'Revenue YTD', value: `€${(Number(rev.totalYTD) / denom).toFixed(1)}M` },
      { label: 'Pipeline', value: `€${(Number(rev.weightedPipeline) / denom).toFixed(1)}M weighted` },
      { label: 'Open Tickets', value: `${sup.openTickets} (${Number(sup.slaCompliance).toFixed(0)}% SLA)` },
      { label: 'OKR Progress', value: `${Number(okr.overallProgress).toFixed(0)}%` },
      { label: 'Team Utilization', value: `${Number(ppl.avgUtilization).toFixed(0)}%` },
      { label: 'Budget Health', value: `${Number(fin.budgetHealthAvg).toFixed(0)}%` },
      { label: 'Open Positions', value: `${ppl.openPositions}` },
      { label: 'Culture Score', value: '86 (placeholder)' },
    ];
  }, [data]);

  const modules = [
    { title: 'Sales', route: '/crm', a: 'Pipeline', b: data.revenue.pipelineValue, c: 'Deals won', d: data.revenue.dealsWonThisMonth },
    { title: 'Support', route: '/support', a: 'Open tickets', b: data.support.openTickets, c: 'CSAT', d: data.support.csatScore },
    { title: 'Marketing', route: '/marketing', a: 'MQLs', b: data.marketing.mqls, c: 'Avg ROI', d: data.marketing.avgROI },
    { title: 'Engineering', route: '/projects', a: 'Velocity', b: data.projects.avgSprintVelocity, c: 'Blocked', d: data.projects.blockedTasks },
    { title: 'Finance', route: '/finance', a: 'Pending approvals', b: data.finance.pendingApprovals, c: 'Overdue', d: data.finance.overdueInvoices },
    { title: 'HR', route: '/recruitment', a: 'Open positions', b: data.people.openPositions, c: 'Utilization', d: data.people.avgUtilization },
  ];

  const dismissBanner = () => {
    localStorage.setItem(DISMISS_KEY, todayKey());
    setBannerDismissed(true);
  };

  if (loading) {
    return <div className="p-6 text-app-muted">Loading executive dashboard...</div>;
  }

  const trend = data.revenue.monthlyTrend;
  const totalYtd = Math.max(Number(data.revenue.totalYTD) || 0, 1);

  return (
    <div className="h-[calc(100vh-48px)] overflow-y-auto bg-app p-4 md:p-6 space-y-4">
      {loadError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Could not load live executive metrics. Showing placeholders — check your connection or try again later.
          <button
            type="button"
            className="ml-3 text-cyan-300 hover:text-cyan-200 underline"
            onClick={() => navigate('/dashboard')}
          >
            Go to main dashboard
          </button>
        </div>
      )}

      {!bannerDismissed && (
        <div className="rounded-xl p-5 bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-800/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-app-text">
                Good morning, {user?.name?.split(' ')[0] || 'there'}. Here&apos;s your company at a glance.
              </h2>
              <div className="mt-2 text-sm text-blue-100">
                Critical: {data.doraInsights.criticalCount} | Biggest win: {data.revenue.dealsWonThisMonth} deals won this month | Risk:{' '}
                {data.finance.overdueInvoices} overdue invoices
              </div>
              <button
                className="mt-3 text-sm text-cyan-300 hover:text-cyan-200"
                onClick={() => navigate('/dora/briefing')}
              >
                View full briefing →
              </button>
            </div>
            <button type="button" className="text-xs text-slate-200 hover:text-app-text" onClick={dismissBanner}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div data-testid="executive-kpis" className="flex gap-2.5 overflow-x-auto pb-2">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            data-testid={`executive-kpi-${kpi.label.replace(/\s/g, '-')}`}
            className="min-w-[170px] rounded-lg border border-app bg-app-card p-2.5"
          >
            <div className="text-xs text-app-muted">{kpi.label}</div>
            <div className="mt-1 text-lg font-semibold text-app">{kpi.value}</div>
            <div className="mt-2 h-1.5 rounded-full bg-app-surface-tertiary overflow-hidden">
              <div className="h-full w-2/3 bg-blue-400/70 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3 space-y-3">
          <div data-testid="executive-chart" className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-3">Revenue Trend</div>
            <div className="space-y-2">
              {trend.slice(-12).map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-app-muted">{m.month}</div>
                  <div className="flex-1 h-2 rounded bg-app-surface-tertiary">
                    <div
                      className="h-2 rounded bg-emerald-400"
                      style={{ width: `${Math.min(100, (Number(m.value) / totalYtd) * 400)}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs text-app">€{(Number(m.value) / 1000).toFixed(0)}k</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-3">Department Overview</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {modules.map((m) => (
                <button
                  key={m.title}
                  type="button"
                  onClick={() => navigate(m.route)}
                  className="text-left rounded-lg border border-app bg-app p-3 hover:bg-app-hover"
                >
                  <div className="text-sm font-medium text-app">{m.title}</div>
                  <div className="mt-2 text-xs text-app-muted">
                    {m.a}: <span className="text-app">{Number(m.b).toFixed(0)}</span>
                  </div>
                  <div className="text-xs text-app-muted">
                    {m.c}: <span className="text-app">{Number(m.d).toFixed(0)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-3">OKR Progress</div>
            <div className="space-y-2">
              <div className="text-xs text-app-muted">
                On Track: {data.okrs.onTrack} | At Risk: {data.okrs.atRisk} | Behind: {data.okrs.behind}
              </div>
              <div className="h-2 rounded bg-app-surface-tertiary">
                <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.max(3, Number(data.okrs.overallProgress))}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-3">
          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-2">Pending Actions</div>
            <ul className="space-y-2 text-sm text-app-muted">
              <li>Expense approvals: {data.finance.pendingApprovals}</li>
              <li>Pending timesheets: {data.people.pendingTimesheets}</li>
              <li>Overdue invoices: {data.finance.overdueInvoices}</li>
              <li>
                SLA risk tickets:{' '}
                {Math.max(0, data.support.openTickets - data.support.ticketsResolvedThisWeek)}
              </li>
            </ul>
          </div>

          <div data-testid="executive-activity" className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-2">Recent Activity</div>
            <div className="space-y-2">
              {data.recentActivity.slice(0, 15).map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                  <div className="min-w-0">
                    <div className="text-app truncate">{a.title}</div>
                    <div className="text-app-muted">
                      {a.actor} · {relTime(a.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-2">Dora Insights</div>
            <div className="text-xs text-app-muted">
              Critical: {data.doraInsights.criticalCount} · Warning: {data.doraInsights.warningCount} · Unread:{' '}
              {data.doraInsights.totalUnread}
            </div>
          </div>

          {(data.operations.contractsExpiringThisMonth > 0 ||
            data.operations.licensesExpiringThisMonth > 0 ||
            data.operations.assetsUnassigned > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-200 mb-2">Operations Alerts</div>
              <div className="text-xs text-amber-100">
                Contracts expiring: {data.operations.contractsExpiringThisMonth} · Licenses expiring:{' '}
                {data.operations.licensesExpiringThisMonth} · Unassigned assets: {data.operations.assetsUnassigned}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
