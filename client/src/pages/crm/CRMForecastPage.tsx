import { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { DollarSign, TrendingUp, Target, AlertTriangle, BarChart3, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CRMNav } from '@/components/crm/CRMNav';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { cn } from '@/lib/utils';
import { formatCrmCurrencyCompact } from '@/lib/crmCurrency';
import {
  crmAPI,
  type ForecastSummary,
  type OwnerForecast,
  type SalesMetrics,
  type Deal,
  type Pipeline,
} from '@/lib/crmApi';
import { toast } from 'sonner';

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
  return formatCrmCurrencyCompact(v, 'EUR');
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
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState(500_000);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaInput, setQuotaInput] = useState('');

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [m, pls, gaps, quota] = await Promise.all([
        crmAPI.getMetrics(userId, period),
        crmAPI.listPipelines(userId),
        crmAPI.getActivityGaps(userId),
        crmAPI.getForecastQuota(userId),
      ]);
      setMetrics(m);
      setStaleDeals(gaps);
      setPipelines(pls);
      setTargetValue(quota.sales_quota_eur);

      const pipeId = activePipelineId ?? pls.find(p => p.is_default)?.id ?? pls[0]?.id ?? null;
      if (pipeId) {
        const [fc, ow] = await Promise.all([
          crmAPI.getPipelineForecast(userId, pipeId),
          crmAPI.getForecastByOwner(userId, pipeId),
        ]);
        setForecast(fc);
        setOwners(ow);
      } else {
        setForecast(null);
        setOwners([]);
      }
      if (pipeId && activePipelineId == null) {
        setActivePipelineId(pipeId);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [userId, period, activePipelineId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const openQuotaModal = (): void => {
    setQuotaInput(String(Math.round(targetValue)));
    setQuotaModalOpen(true);
  };

  const saveQuota = async (): Promise<void> => {
    const v = parseFloat(quotaInput.replace(/,/g, ''));
    if (!Number.isFinite(v) || v < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    try {
      const q = await crmAPI.updateForecastQuota(userId, v);
      setTargetValue(q.sales_quota_eur);
      setQuotaModalOpen(false);
      toast.success('Sales target updated');
    } catch {
      toast.error('Failed to save target');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <CRMNav />
          <DoraInsightBar module="sales" />

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-1">
              {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    period === key
                      ? 'bg-primary-500/20 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {pipelines.length > 0 && (
              <div className="relative">
                <select
                  value={activePipelineId ?? ''}
                  onChange={e => setActivePipelineId(e.target.value)}
                  className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-8 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <button
              type="button"
              onClick={openQuotaModal}
              className="text-left rounded-xl border border-transparent hover:border-app-border transition-colors"
            >
              <KPICard title="Target" value={formatCurrency(targetValue)} subtitle="Click to set target" icon={Target} />
            </button>
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
              <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
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

              <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
                <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Forecast by Owner
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-app-border">
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold">Name</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Deals</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Pipeline</th>
                        <th className="pb-2 text-[11px] uppercase tracking-wider text-app-muted font-semibold text-right">Weighted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owners.map(owner => (
                        <tr key={owner.owner_id} className="border-b border-app-border hover:bg-app-nav-hover transition-colors">
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

              <div
                className="rounded-xl border p-5"
                style={{
                  background: 'linear-gradient(135deg, #1E3A5F 0%, var(--app-bg) 100%)',
                  borderColor: 'rgba(30, 64, 175, 0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-app-text text-sm"
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
                        <> You are {formatCurrency(gap)} below your {PERIOD_LABELS[period].toLowerCase()} target.
                        Focus on advancing deals in the Proposal stage to close the gap.</>
                      ) : (
                        <> You are on track to exceed your {PERIOD_LABELS[period].toLowerCase()} target by {formatCurrency(Math.abs(gap))}.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {quotaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl border border-app-border bg-app-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-app-text mb-2">Sales target (EUR)</h3>
            <p className="text-sm text-app-muted mb-4">Used for gap-to-target and the chart reference line.</p>
            <input
              type="text"
              inputMode="decimal"
              value={quotaInput}
              onChange={e => setQuotaInput(e.target.value)}
              className="w-full rounded-lg border border-app-border bg-app px-3 py-2 text-app-text mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuotaModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-app-muted hover:bg-app-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveQuota()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div key={i} className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 animate-pulse">
          <div className="h-4 bg-app-surface-tertiary rounded w-48 mb-4" />
          <div className="h-60 bg-app-surface-tertiary rounded" />
        </div>
      ))}
    </div>
  );
}
