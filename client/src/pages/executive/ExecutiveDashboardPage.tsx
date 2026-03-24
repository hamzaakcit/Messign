import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onActivityNew } from '@/lib/socket';
import { executiveAPI, type ExecutiveDashboard } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const DISMISS_KEY = 'executive-briefing-dismissed-date';

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
  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setBannerDismissed(localStorage.getItem(DISMISS_KEY) === todayKey());
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    executiveAPI.getDashboard(userId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        console.error('[executive] load failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!data) return;
    const off = onActivityNew((event) => {
      const title = typeof event?.message === 'string' ? event.message : 'New activity';
      setData((prev) => prev ? {
        ...prev,
        recentActivity: [
          {
            id: crypto.randomUUID(),
            module: 'system',
            type: event?.type ?? 'activity',
            title,
            actor: 'System',
            timestamp: new Date().toISOString(),
            color: '#8b5cf6',
          },
          ...prev.recentActivity,
        ].slice(0, 15),
      } : prev);
    });
    return off;
  }, [data]);

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Revenue YTD', value: `€${(data.revenue.totalYTD / 1_000_000).toFixed(1)}M` },
      { label: 'Pipeline', value: `€${(data.revenue.weightedPipeline / 1_000_000).toFixed(1)}M weighted` },
      { label: 'Open Tickets', value: `${data.support.openTickets} (${data.support.slaCompliance.toFixed(0)}% SLA)` },
      { label: 'OKR Progress', value: `${data.okrs.overallProgress.toFixed(0)}%` },
      { label: 'Team Utilization', value: `${data.people.avgUtilization.toFixed(0)}%` },
      { label: 'Budget Health', value: `${data.finance.budgetHealthAvg.toFixed(0)}%` },
      { label: 'Open Positions', value: `${data.people.openPositions}` },
      { label: 'Culture Score', value: '86 (placeholder)' },
    ];
  }, [data]);

  const modules = [
    { title: 'Sales', route: '/crm', a: 'Pipeline', b: data?.revenue.pipelineValue ?? 0, c: 'Deals won', d: data?.revenue.dealsWonThisMonth ?? 0 },
    { title: 'Support', route: '/support', a: 'Open tickets', b: data?.support.openTickets ?? 0, c: 'CSAT', d: data?.support.csatScore ?? 0 },
    { title: 'Marketing', route: '/marketing', a: 'MQLs', b: data?.marketing.mqls ?? 0, c: 'Avg ROI', d: data?.marketing.avgROI ?? 0 },
    { title: 'Engineering', route: '/projects', a: 'Velocity', b: data?.projects.avgSprintVelocity ?? 0, c: 'Blocked', d: data?.projects.blockedTasks ?? 0 },
    { title: 'Finance', route: '/finance', a: 'Pending approvals', b: data?.finance.pendingApprovals ?? 0, c: 'Overdue', d: data?.finance.overdueInvoices ?? 0 },
    { title: 'HR', route: '/recruitment', a: 'Open positions', b: data?.people.openPositions ?? 0, c: 'Utilization', d: data?.people.avgUtilization ?? 0 },
  ];

  const dismissBanner = () => {
    localStorage.setItem(DISMISS_KEY, todayKey());
    setBannerDismissed(true);
  };

  if (loading) {
    return <div className="p-6 text-app-muted">Loading executive dashboard...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-400">Failed to load executive dashboard.</div>;
  }

  return (
    <div className="h-[calc(100vh-48px)] overflow-y-auto bg-app p-4 md:p-6 space-y-4">
      {!bannerDismissed && (
        <div className="rounded-xl p-5 bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-800/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-app-text">
                Good morning, {user?.name?.split(' ')[0] || 'there'}. Here&apos;s your company at a glance.
              </h2>
              <div className="mt-2 text-sm text-blue-100">
                Critical: {data.doraInsights.criticalCount} | Biggest win: {data.revenue.dealsWonThisMonth} deals won this month | Risk: {data.finance.overdueInvoices} overdue invoices
              </div>
              <button
                className="mt-3 text-sm text-cyan-300 hover:text-cyan-200"
                onClick={() => navigate('/dora/briefing')}
              >
                View full briefing →
              </button>
            </div>
            <button className="text-xs text-slate-200 hover:text-app-text" onClick={dismissBanner}>Dismiss</button>
          </div>
        </div>
      )}

      <div data-testid="executive-kpis" className="flex gap-2.5 overflow-x-auto pb-2">
        {kpis.map((kpi) => (
          <div key={kpi.label} data-testid={`executive-kpi-${kpi.label.replace(/\s/g, '-')}`} className="min-w-[170px] rounded-lg border border-app bg-app-card p-2.5">
            <div className="text-xs text-app-muted">{kpi.label}</div>
            <div className="mt-1 text-lg font-semibold text-app">{kpi.value}</div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
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
              {data.revenue.monthlyTrend.slice(-12).map((m) => (
                <div key={m.month} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-app-muted">{m.month}</div>
                  <div className="flex-1 h-2 rounded bg-white/10">
                    <div className="h-2 rounded bg-emerald-400" style={{ width: `${Math.min(100, (m.value / (data.revenue.totalYTD || 1)) * 400)}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs text-app">€{(m.value / 1000).toFixed(0)}k</div>
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
                  onClick={() => navigate(m.route)}
                  className="text-left rounded-lg border border-app bg-app p-3 hover:bg-app-hover"
                >
                  <div className="text-sm font-medium text-app">{m.title}</div>
                  <div className="mt-2 text-xs text-app-muted">{m.a}: <span className="text-app">{Number(m.b).toFixed(0)}</span></div>
                  <div className="text-xs text-app-muted">{m.c}: <span className="text-app">{Number(m.d).toFixed(0)}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-3">OKR Progress</div>
            <div className="space-y-2">
              <div className="text-xs text-app-muted">On Track: {data.okrs.onTrack} | At Risk: {data.okrs.atRisk} | Behind: {data.okrs.behind}</div>
              <div className="h-2 rounded bg-white/10">
                <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.max(3, data.okrs.overallProgress)}%` }} />
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
              <li>SLA risk tickets: {Math.max(0, data.support.openTickets - data.support.ticketsResolvedThisWeek)}</li>
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
                    <div className="text-app-muted">{a.actor} · {relTime(a.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-app bg-app-card p-4">
            <div className="text-sm font-semibold text-app mb-2">Dora Insights</div>
            <div className="text-xs text-app-muted">
              Critical: {data.doraInsights.criticalCount} · Warning: {data.doraInsights.warningCount} · Unread: {data.doraInsights.totalUnread}
            </div>
          </div>

          {(data.operations.contractsExpiringThisMonth > 0 || data.operations.licensesExpiringThisMonth > 0 || data.operations.assetsUnassigned > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-200 mb-2">Operations Alerts</div>
              <div className="text-xs text-amber-100">
                Contracts expiring: {data.operations.contractsExpiringThisMonth} · Licenses expiring: {data.operations.licensesExpiringThisMonth} · Unassigned assets: {data.operations.assetsUnassigned}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
