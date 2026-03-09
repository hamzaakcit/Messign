import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { DollarSign, TrendingUp, Target, AlertTriangle, BarChart3 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CRMNav } from '@/components/crm/CRMNav';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { cn } from '@/lib/utils';
import {
  crmAPI,
  type ForecastSummary,
  type OwnerForecast,
  type SalesMetrics,
  type Deal,
} from '@/lib/crmApi';

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
};
const AXIS_TICK = { fill: '#9ca3af', fontSize: 12 };
const GRID_STROKE = 'rgba(255,255,255,0.05)';

type Period = 'month' | 'quarter' | 'year';
const PERIOD_LABELS: Record<Period, string> = { month: 'This Month', quarter: 'This Quarter', year: 'This Year' };

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  return `€${v.toLocaleString()}`;
}

export function CRMForecastPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [period, setPeriod] = useState<Period>('quarter');
  const [forecast, setForecast] = useState<ForecastSummary | null>(null);
  const [owners, setOwners] = useState<OwnerForecast[]>([]);
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [staleDeals, setStaleDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [m, pipelines, gaps] = await Promise.all([
        crmAPI.getMetrics(userId, period),
        crmAPI.listPipelines(userId),
        crmAPI.getActivityGaps(userId),
      ]);
      setMetrics(m);
      setStaleDeals(gaps);

      const defaultPipeline = pipelines.find(p => p.is_default) ?? pipelines[0];
      if (defaultPipeline) {
        const [fc, ow] = await Promise.all([
          crmAPI.getPipelineForecast(userId, defaultPipeline.id),
          crmAPI.getForecastByOwner(userId, defaultPipeline.id),
        ]);
        setForecast(fc);
        setOwners(ow);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const targetValue = 500_000;
  const weightedForecast = forecast ? Number(forecast.weighted_value) : 0;
  const bestCase = forecast ? Number(forecast.total_value) : 0;
  const worstCase = (metrics?.dealsWon ?? 0) * (metrics?.avgDealSize ?? 0);
  const gap = targetValue - weightedForecast;

  const negotiationStages = (forecast?.stages ?? []).filter(
    s => s.stage_name.toLowerCase().includes('negotiation') || s.stage_name.toLowerCase().includes('proposal'),
  );
  const negotiationValue = negotiationStages.reduce((s, st) => s + Number(st.total_value), 0);
  const negotiationCount = negotiationStages.reduce((s, st) => s + st.deal_count, 0);

  const chartData = buildChartData(forecast, metrics);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <CRMNav />
          <DoraInsightBar module="sales" />

          {/* Period Selector */}
          <div className="flex items-center gap-1 mb-6">
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  period === key
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-app-muted hover:text-app-text hover:bg-white/5',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Forecast KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard title="Target" value={formatCurrency(targetValue)} subtitle="Set target" icon={Target} />
            <KPICard title="Weighted Forecast" value={formatCurrency(weightedForecast)} icon={TrendingUp} />
            <KPICard title="Best Case" value={formatCurrency(bestCase)} subtitle={`${forecast?.total_deals ?? 0} deals`} icon={DollarSign} />
            <KPICard title="Worst Case" value={formatCurrency(worstCase)} subtitle="Won only" icon={BarChart3} />
            <KPICard
              title="Gap to Target"
              value={formatCurrency(Math.abs(gap))}
              subtitle={gap > 0 ? 'Below target' : 'Above target'}
              icon={AlertTriangle}
              className={gap > 0 ? 'border-red-500/20' : 'border-emerald-500/20'}
            />
          </div>

          {loading ? (
            <ForecastSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Forecast Chart */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Forecast Breakdown
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} tickFormatter={v => formatCurrency(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatCurrency(v)]} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    <Bar dataKey="won" name="Won" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="committed" name="Committed" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="pipeline" name="Pipeline" stackId="a" fill="rgba(59,130,246,0.35)" radius={[4, 4, 0, 0]} />
                    <ReferenceLine y={targetValue} stroke="#ef4444" strokeDasharray="6 4" label={{ value: 'Target', fill: '#ef4444', fontSize: 11 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Forecast by Owner */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Forecast by Owner
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold">Name</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Deals</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Pipeline</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Weighted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owners.map(owner => (
                        <tr key={owner.owner_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 text-app-text font-medium flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-[10px] font-semibold text-primary-400 shrink-0">
                              {(owner.owner_name ?? '?').charAt(0).toUpperCase()}
                            </div>
                            {owner.owner_name}
                          </td>
                          <td className="py-2.5 text-app-muted text-right">{owner.deal_count}</td>
                          <td className="py-2.5 text-app-text text-right">{formatCurrency(Number(owner.total_value))}</td>
                          <td className="py-2.5 text-emerald-400 font-medium text-right">{formatCurrency(Number(owner.weighted_value))}</td>
                        </tr>
                      ))}
                      {owners.length === 0 && (
                        <tr><td colSpan={4} className="py-4 text-center text-app-muted">No forecast data available.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dora Narrative */}
              <div
                className="rounded-xl border p-5"
                style={{
                  background: 'linear-gradient(135deg, #1E3A5F 0%, var(--app-bg) 100%)',
                  borderColor: 'rgba(30, 64, 175, 0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-sm"
                    style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                  >
                    ✦
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: '#93C5FD' }}>
                      Dora Forecast Analysis
                    </h4>
                    <p className="text-[13px] leading-relaxed" style={{ color: '#93C5FD' }}>
                      Your {PERIOD_LABELS[period].toLowerCase()} weighted pipeline is{' '}
                      <strong>{formatCurrency(weightedForecast)}</strong> across{' '}
                      <strong>{forecast?.total_deals ?? 0}</strong> active deals.
                      {negotiationCount > 0 && (
                        <> {negotiationCount} deal{negotiationCount !== 1 ? 's' : ''} in Negotiation/Proposal (
                        {formatCurrency(negotiationValue)} combined) are expected to close soon.</>
                      )}
                      {staleDeals.length > 0 && (
                        <> Risk: <strong>{staleDeals.length}</strong> deal{staleDeals.length !== 1 ? 's have' : ' has'} been
                        stale for 10+ days and may need follow-up.</>
                      )}
                      {gap > 0 ? (
                        <> You're {formatCurrency(gap)} below your {PERIOD_LABELS[period].toLowerCase()} target.
                        Focus on advancing deals in the Proposal stage to close the gap.</>
                      ) : (
                        <> You're on track to exceed your {PERIOD_LABELS[period].toLowerCase()} target by {formatCurrency(Math.abs(gap))}.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildChartData(
  forecast: ForecastSummary | null,
  metrics: SalesMetrics | null,
) {
  if (!forecast) return [];

  const wonValue = (metrics?.dealsWon ?? 0) * (metrics?.avgDealSize ?? 0);

  const committedStages = forecast.stages.filter(
    s => {
      const name = s.stage_name.toLowerCase();
      return name.includes('negotiation') || name.includes('proposal') || name.includes('contract');
    },
  );
  const pipelineStages = forecast.stages.filter(
    s => {
      const name = s.stage_name.toLowerCase();
      return !name.includes('negotiation') && !name.includes('proposal') && !name.includes('contract');
    },
  );

  const committed = committedStages.reduce((s, st) => s + Number(st.total_value), 0);
  const pipeline = pipelineStages.reduce((s, st) => s + Number(st.total_value), 0);

  return [
    { label: 'Current', won: wonValue, committed, pipeline },
  ];
}

function ForecastSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-48 mb-4" />
          <div className="h-60 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
