import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from 'recharts';
import { DollarSign, TrendingUp, Target, BarChart3, Clock, AlertTriangle, Trophy } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CRMNav } from '@/components/crm/CRMNav';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import {
  crmAPI,
  type SalesMetrics,
  type Deal,
  type ForecastSummary,
  type OwnerForecast,
} from '@/lib/crmApi';
import { formatCrmCurrencyCompact } from '@/lib/crmCurrency';

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
};
const AXIS_TICK = { fill: '#9ca3af', fontSize: 12 };
const GRID_STROKE = 'rgba(255,255,255,0.05)';

function formatCurrency(v: number): string {
  return formatCrmCurrencyCompact(v, 'EUR');
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export function CRMDashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [forecast, setForecast] = useState<ForecastSummary | null>(null);
  const [owners, setOwners] = useState<OwnerForecast[]>([]);
  const [topDeals, setTopDeals] = useState<Deal[]>([]);
  const [staleDeals, setStaleDeals] = useState<Deal[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ month: string; won: number }[]>([]);
  const [activitySeries, setActivitySeries] = useState<
    { week: string; calls: number; emails: number; meetings: number; notes: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [m, pipelines, rev, act] = await Promise.all([
        crmAPI.getMetrics(userId),
        crmAPI.listPipelines(userId),
        crmAPI.getDashboardRevenueTrend(userId, 6),
        crmAPI.getActivityWeekSeries(userId, 8),
      ]);
      setMetrics(m);
      setRevenueTrend(rev.map((r) => ({ month: r.month, won: r.won })));
      setActivitySeries(
        act.map((w) => ({
          week: w.weekLabel,
          calls: w.calls,
          emails: w.emails,
          meetings: w.meetings,
          notes: w.notes,
        })),
      );

      const defaultPipeline = pipelines.find(p => p.is_default) ?? pipelines[0];
      if (defaultPipeline) {
        const [fc, ow] = await Promise.all([
          crmAPI.getPipelineForecast(userId, defaultPipeline.id),
          crmAPI.getForecastByOwner(userId, defaultPipeline.id),
        ]);
        setForecast(fc);
        setOwners(ow);
      }

      const [dealsRes, gaps] = await Promise.all([
        crmAPI.listDeals(userId, { sort_by: 'amount', sort_dir: 'desc', pageSize: '5' }),
        crmAPI.getActivityGaps(userId),
      ]);
      setTopDeals(dealsRes.data);
      setStaleDeals(gaps.slice(0, 5));
    } catch {
      // Errors handled gracefully — data stays null/empty
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stageData = (forecast?.stages ?? []).map(s => ({
    name: s.stage_name,
    deals: s.deal_count,
    value: Number(s.total_value),
    weighted: Number(s.weighted_value),
  }));

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <CRMNav />
          <DoraInsightBar module="sales" />

          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard
              title="Total Pipeline"
              value={formatCurrency(metrics?.totalPipeline ?? 0)}
              icon={DollarSign}
            />
            <KPICard
              title="Weighted Pipeline"
              value={formatCurrency(metrics?.weightedPipeline ?? 0)}
              icon={Target}
            />
            <KPICard
              title="Deals Won"
              value={metrics?.dealsWon ?? 0}
              subtitle="This period"
              icon={TrendingUp}
            />
            <KPICard
              title="Win Rate"
              value={`${(metrics?.winRate ?? 0).toFixed(1)}%`}
              subtitle={`${metrics?.dealsLost ?? 0} lost`}
              icon={BarChart3}
            />
            <KPICard
              title="Avg Cycle"
              value={`${(metrics?.avgCycleTime ?? 0).toFixed(0)}d`}
              subtitle="Days to close"
              icon={Clock}
            />
          </div>

          {loading ? (
            <DashboardSkeleton />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column — Charts */}
              <div className="lg:col-span-2 space-y-6">
                {/* Pipeline by Stage */}
                <ChartSection title="Pipeline by Stage" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stageData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => formatCurrency(v)} />
                      <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={110} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => [formatCurrency(v), 'Value']}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {stageData.map((_, i) => (
                          <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartSection>

                {/* Revenue Trend */}
                <ChartSection title="Revenue Trend" icon={TrendingUp}>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={revenueTrend}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="month" tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} tickFormatter={v => formatCurrency(v)} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => [formatCurrency(v), 'Won']}
                      />
                      <Area
                        type="monotone"
                        dataKey="won"
                        stroke="#10b981"
                        fillOpacity={1}
                        fill="url(#revGrad)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartSection>

                {/* Deal Activity */}
                <ChartSection title="Deal Activity" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={activitySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="week" tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="calls" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={32} name="Calls" />
                      <Bar dataKey="emails" stackId="a" fill="#8b5cf6" name="Emails" />
                      <Bar dataKey="meetings" stackId="a" fill="#10b981" name="Meetings" />
                      <Bar dataKey="notes" stackId="a" fill="#6b7280" radius={[4, 4, 0, 0]} name="Notes" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartSection>
              </div>

              {/* Right column — Lists */}
              <div className="space-y-6">
                {/* Top Deals */}
                <ListSection title="Top Deals" icon={DollarSign}>
                  {topDeals.length === 0 ? (
                    <p className="text-sm text-app-muted">No open deals.</p>
                  ) : (
                    topDeals.map(deal => (
                      <div key={deal.id} className="flex items-center justify-between py-2 border-b border-app-border last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm text-app-text font-medium truncate">{deal.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.stage_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-400">
                                {deal.stage_name}
                              </span>
                            )}
                            <span className="text-[11px] text-app-muted">
                              {daysSince(deal.created_at)}d open
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-emerald-400 shrink-0 ml-2">
                          {formatCurrency(Number(deal.amount))}
                        </span>
                      </div>
                    ))
                  )}
                </ListSection>

                {/* Stale Deals */}
                <ListSection title="Stale Deals" icon={AlertTriangle}>
                  {staleDeals.length === 0 ? (
                    <p className="text-sm text-app-muted">No stale deals. Great follow-up!</p>
                  ) : (
                    staleDeals.map(deal => (
                      <div key={deal.id} className="flex items-center justify-between py-2 border-b border-app-border last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm text-app-text font-medium truncate">{deal.title}</p>
                          <p className="text-[11px] text-app-muted">
                            {deal.owner_name ?? 'Unassigned'}
                          </p>
                        </div>
                        <span className="text-xs text-red-400 shrink-0 ml-2">
                          {daysSince(deal.updated_at)}d ago
                        </span>
                      </div>
                    ))
                  )}
                </ListSection>

                {/* Leaderboard */}
                <ListSection title="Leaderboard" icon={Trophy}>
                  {owners.length === 0 ? (
                    <p className="text-sm text-app-muted">No sales data yet.</p>
                  ) : (
                    owners.slice(0, 5).map((owner, i) => (
                      <div key={owner.owner_id} className="flex items-center gap-3 py-2 border-b border-app-border last:border-0">
                        <span className="text-xs font-bold text-app-muted w-5 text-center">
                          {i + 1}
                        </span>
                        <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center text-xs font-semibold text-primary-400 shrink-0">
                          {(owner.owner_name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-app-text font-medium truncate">{owner.owner_name}</p>
                          <p className="text-[11px] text-app-muted">{owner.deal_count} deals</p>
                        </div>
                        <span className="text-sm font-medium text-emerald-400 shrink-0">
                          {formatCurrency(Number(owner.weighted_value))}
                        </span>
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

const STAGE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];

function ChartSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
      <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ListSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
      <h3 className="font-semibold text-app-text mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" /> {title}
      </h3>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 animate-pulse">
            <div className="h-4 bg-app-surface-tertiary rounded w-40 mb-4" />
            <div className="h-56 bg-app-surface-tertiary rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 animate-pulse">
            <div className="h-4 bg-app-surface-tertiary rounded w-32 mb-3" />
            <div className="space-y-3">
              {[1, 2, 3].map(j => (
                <div key={j} className="h-10 bg-app-surface-tertiary rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
