import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { useAuthStore } from '@/stores/authStore';
import {
  supportApi,
  type SupportAgentWorkload,
  type SupportCustomerHealth,
  type SupportDashboardMetrics,
  type SupportTicket,
  type SupportTrendPoint,
} from '@/lib/supportApi';
import { formatNumber } from '@/lib/utils';
import { SupportNav } from './components/SupportNav';
import { formatHoursShort, HealthScoreBadge, TrendBadge } from './components/supportUi';

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
};
const AXIS_TICK = { fill: '#9ca3af', fontSize: 12 };
const GRID_STROKE = 'rgba(255,255,255,0.05)';
const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6'];

function ChartSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function ListSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold text-app-text mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export function SupportDashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [metrics, setMetrics] = useState<SupportDashboardMetrics | null>(null);
  const [workload, setWorkload] = useState<SupportAgentWorkload[]>([]);
  const [trends, setTrends] = useState<SupportTrendPoint[]>([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState<SupportCustomerHealth[]>([]);
  const [breaches, setBreaches] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [metricsResult, workloadResult, trendsResult, atRiskResult, breachesResult] = await Promise.all([
        supportApi.getDashboardMetrics(userId),
        supportApi.getAgentWorkload(userId),
        supportApi.getTicketTrends(userId, 30),
        supportApi.listAtRiskCustomers(userId),
        supportApi.listTickets(userId, {
          slaStatus: 'breached',
          sortBy: 'slaDue',
          sortDir: 'asc',
          page: 1,
          pageSize: 6,
        }),
      ]);

      setMetrics(metricsResult);
      setWorkload(workloadResult);
      setTrends(trendsResult);
      setAtRiskCustomers(atRiskResult.slice(0, 6));
      setBreaches(breachesResult.data);
    } catch {
      setMetrics(null);
      setWorkload([]);
      setTrends([]);
      setAtRiskCustomers([]);
      setBreaches([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const volumeTrend = useMemo(() => trends.slice(-14), [trends]);

  const categoryData = useMemo(
    () => (metrics?.ticketsByCategory ?? []).slice(0, 6),
    [metrics],
  );

  const slaPerformance = useMemo(
    () => trends.map((point) => ({
      date: point.date,
      compliance:
        point.openCount + point.resolvedCount === 0
          ? 0
          : Math.round((point.resolvedCount / (point.openCount + point.resolvedCount)) * 100),
    })),
    [trends],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <SupportNav />
          <DoraInsightBar module="support" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard title="Open Tickets" value={metrics?.openTickets ?? 0} icon={BarChart3} />
            <KPICard title="Avg Response" value={formatHoursShort(metrics?.avgFirstResponseHours)} icon={Clock3} />
            <KPICard title="CSAT" value={`${(metrics?.csatScore ?? 0).toFixed(1)}/5`} icon={Star} />
            <KPICard
              title="SLA Compliance"
              value={`${(metrics?.slaCompliancePercent ?? 0).toFixed(0)}%`}
              icon={ShieldCheck}
            />
            <KPICard
              title="Resolved This Week"
              value={workload.reduce((sum, agent) => sum + agent.resolvedThisWeek, 0)}
              icon={TrendingUp}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-72 rounded-xl bg-white/10" />
                <div className="h-72 rounded-xl bg-white/10" />
                <div className="h-72 rounded-xl bg-white/10" />
              </div>
              <div className="space-y-6">
                <div className="h-72 rounded-xl bg-white/10" />
                <div className="h-72 rounded-xl bg-white/10" />
                <div className="h-72 rounded-xl bg-white/10" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <ChartSection title="Ticket Volume" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={volumeTrend}>
                      <defs>
                        <linearGradient id="supportOpen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="supportResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="date" tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="openCount" stroke="#3b82f6" fill="url(#supportOpen)" strokeWidth={2} />
                      <Area type="monotone" dataKey="resolvedCount" stroke="#10b981" fill="url(#supportResolved)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartSection>

                <ChartSection title="Tickets by Category" icon={Users}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} />
                      <YAxis dataKey="label" type="category" width={120} tick={AXIS_TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {categoryData.map((entry, index) => (
                          <Cell key={`${entry.label}-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartSection>

                <ChartSection title="SLA Performance" icon={ShieldCheck}>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={slaPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="date" tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`, 'Compliance']} />
                      <Line type="monotone" dataKey="compliance" stroke="#a855f7" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartSection>
              </div>

              <div className="space-y-6">
                <ListSection title="Agent Workload" icon={Users}>
                  {workload.length === 0 ? (
                    <p className="text-sm text-app-muted">No agent workload data yet.</p>
                  ) : (
                    workload.slice(0, 6).map((agent) => (
                      <div key={agent.assigneeId} className="py-3 border-b border-white/5 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-app-text font-medium truncate">{agent.name}</p>
                            <p className="text-xs text-app-muted">
                              {agent.openTickets} open • {formatHoursShort(agent.avgResponseTime)} avg response
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-amber-300">{agent.csatScore.toFixed(1)}★</p>
                            <p className="text-xs text-app-muted">{agent.resolvedThisWeek} resolved</p>
                          </div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-500"
                            style={{ width: `${Math.min(agent.openTickets * 10, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </ListSection>

                <ListSection title="At-Risk Customers" icon={AlertTriangle}>
                  {atRiskCustomers.length === 0 ? (
                    <p className="text-sm text-app-muted">No at-risk customers right now.</p>
                  ) : (
                    atRiskCustomers.map((customer) => (
                      <div key={customer.id} className="py-3 border-b border-white/5 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-app-text font-medium truncate">
                              {customer.companyName || 'Unlinked company'}
                            </p>
                            <p className="text-xs text-app-muted">
                              {customer.openTicketCount} open • {customer.repeatIssueCount} repeat issues
                            </p>
                          </div>
                          <HealthScoreBadge score={customer.healthScore} />
                        </div>
                        <div className="mt-2">
                          <TrendBadge trend={customer.trend} />
                        </div>
                      </div>
                    ))
                  )}
                </ListSection>

                <ListSection title="SLA Breaches" icon={AlertTriangle}>
                  {breaches.length === 0 ? (
                    <p className="text-sm text-app-muted">No breached tickets. Nice work.</p>
                  ) : (
                    breaches.map((ticket) => (
                      <div key={ticket.id} className="py-3 border-b border-white/5 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-app-text font-medium truncate">
                              #{ticket.ticketNumber} {ticket.subject}
                            </p>
                            <p className="text-xs text-app-muted">
                              {(ticket.assigneeName || 'Unassigned')}{ticket.companyName ? ` • ${ticket.companyName}` : ''}
                            </p>
                          </div>
                          <span className="text-xs text-red-400 shrink-0">
                            {ticket.slaResolutionDue
                              ? `${formatNumber(Math.max(1, Math.round((Date.now() - new Date(ticket.slaResolutionDue).getTime()) / 3_600_000)))}h overdue`
                              : 'Breached'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </ListSection>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
