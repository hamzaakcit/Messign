import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { reportsAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BarChart3, TrendingUp, AlertTriangle, DollarSign,
  ArrowUpRight, ArrowDownRight, Bot, Clock, GitBranch, LayoutGrid,
} from 'lucide-react';
import { FinanceSankeyFlow, type SankeyData } from '@/components/visualizations/FinanceSankeyFlow';
import { PageSkeleton } from '@/components/ui';

interface BudgetForecast {
  budget_id: string;
  department: string;
  allocated_amount: number;
  spent_so_far: number;
  days_elapsed: number;
  days_remaining: number;
  daily_burn_rate: number;
  projected_total: number;
  projected_utilization: number;
  will_exceed: boolean;
  estimated_exhaust_date: string | null;
  confidence: number;
}

interface PaymentForecast {
  month: string;
  expected_payables: number;
  expected_receivables: number;
  net_cashflow: number;
  invoice_count: number;
}

interface AIMetrics {
  total_reviews?: number;
  auto_approved?: number;
  flagged?: number;
  avg_confidence?: number;
  avg_processing_ms?: number;
}

export function ReportsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [budgetForecasts, setBudgetForecasts] = useState<BudgetForecast[]>([]);
  const [paymentForecasts, setPaymentForecasts] = useState<PaymentForecast[]>([]);
  const [aiMetrics, setAiMetrics] = useState<AIMetrics | null>(null);
  const [spendByCategory, setSpendByCategory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [reportView, setReportView] = useState<'charts' | 'flow'>('charts');
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [sankeyLoading, setSankeyLoading] = useState(false);

  const loadSankey = useCallback(async () => {
    if (!userId) return;
    setSankeyLoading(true);
    try {
      const report = await reportsAPI.generateSimple(userId, 'financial_flow');
      const raw = report?.sections?.find((s: { type: string }) => s.type === 'chart_data')?.data ?? report?.data;
      const chartData = raw && typeof raw === 'object' && 'nodes' in raw && 'links' in raw ? (raw as SankeyData) : null;
      if (chartData) {
        setSankeyData(chartData);
      } else {
        setSankeyData(null);
      }
    } catch {
      setSankeyData(null);
    } finally {
      setSankeyLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (reportView === 'flow') void loadSankey();
  }, [reportView, loadSankey]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      financeAPI.forecastBudgets(userId).catch(() => []),
      financeAPI.forecastPayments(userId).catch(() => []),
      financeAPI.getAIMetrics(userId).catch(() => null),
      financeAPI.getSpendingByCategory(userId).catch(() => []),
    ]).then(([bf, pf, ai, cats]) => {
      setBudgetForecasts(bf as BudgetForecast[]);
      setPaymentForecasts(pf as PaymentForecast[]);
      setAiMetrics(ai as AIMetrics | null);
      setSpendByCategory(cats as Array<Record<string, unknown>>);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Flow View Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-[var(--app-border)] overflow-hidden">
          <button
            onClick={() => setReportView('charts')}
            className={cn(
              'px-3 py-1.5 text-sm flex items-center gap-1.5 transition',
              reportView === 'charts' ? 'bg-primary-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white',
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            Charts
          </button>
          <button
            onClick={() => setReportView('flow')}
            className={cn(
              'px-3 py-1.5 text-sm flex items-center gap-1.5 transition',
              reportView === 'flow' ? 'bg-primary-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white',
            )}
          >
            <GitBranch className="w-4 h-4" />
            Flow View
          </button>
        </div>
      </div>

      {reportView === 'flow' && (
        <FinanceSankeyFlow data={sankeyData} loading={sankeyLoading} />
      )}

      {reportView === 'charts' && (
        <>
      {/* AI Performance Metrics */}
      {aiMetrics && (
        <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-6">
          <h3 className="text-lg font-semibold text-app-text flex items-center gap-2 mb-4">
            <Bot className="h-5 w-5 text-primary-500" />
            Dora AI Performance
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <MetricCard label="Total Reviews" value={aiMetrics.total_reviews ?? 0} />
            <MetricCard label="Auto-Approved" value={aiMetrics.auto_approved ?? 0} color="text-emerald-400" />
            <MetricCard label="Flagged" value={aiMetrics.flagged ?? 0} color="text-amber-400" />
            <MetricCard label="Avg Confidence" value={`${Math.round((aiMetrics.avg_confidence ?? 0) * 100)}%`} color="text-primary-400" />
            <MetricCard label="Avg Processing" value={`${Math.round(aiMetrics.avg_processing_ms ?? 0)}ms`} icon={Clock} />
          </div>
        </div>
      )}

      {/* Budget Forecast */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-lg font-semibold text-app-text flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5" />
          Budget Forecasts
        </h3>
        {budgetForecasts.length === 0 ? (
          <p className="text-sm text-app-muted">No active budgets to forecast.</p>
        ) : (
          <div className="space-y-4">
            {budgetForecasts.map((f) => {
              const pct = Math.min(f.projected_utilization * 100, 150);
              const barPct = Math.min(pct, 100);
              return (
                <div key={f.budget_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-app-text">{f.department}</span>
                      <span className="text-xs text-app-muted ml-2">{f.days_remaining}d remaining</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-app-muted">
                        ${f.daily_burn_rate.toFixed(0)}/day
                      </span>
                      <span className={cn('font-medium', f.will_exceed ? 'text-red-400' : 'text-emerald-400')}>
                        {f.will_exceed ? (
                          <span className="flex items-center gap-0.5">
                            <ArrowUpRight className="h-3 w-3" />
                            Projected ${f.projected_total.toLocaleString()}
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <ArrowDownRight className="h-3 w-3" />
                            On track
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden relative">
                      <div
                        className={cn('h-full rounded-full', f.will_exceed ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                        style={{ width: `${barPct}%` }}
                      />
                      {f.will_exceed && (
                        <div className="absolute right-0 top-0 h-full w-1 bg-red-500" />
                      )}
                    </div>
                    <span className="text-xs text-app-muted w-12 text-right">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-app-muted">
                    <span>Spent: ${f.spent_so_far.toLocaleString()} / ${f.allocated_amount.toLocaleString()}</span>
                    {f.estimated_exhaust_date && (
                      <span className="text-red-400">Exhausts: {f.estimated_exhaust_date}</span>
                    )}
                    <span>Confidence: {Math.round(f.confidence * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow Forecast */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-app-text flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4" />
            Cash Flow Forecast (3 months)
          </h3>
          {paymentForecasts.length === 0 ? (
            <p className="text-sm text-app-muted">No upcoming invoices to forecast.</p>
          ) : (
            <div className="space-y-3">
              {paymentForecasts.map((pf) => (
                <div key={pf.month} className="flex items-center justify-between text-sm p-3 rounded-lg bg-white/5">
                  <span className="text-app-text font-medium">{pf.month}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-red-400">-${pf.expected_payables.toLocaleString()}</span>
                    <span className="text-emerald-400">+${pf.expected_receivables.toLocaleString()}</span>
                    <span className={cn('font-medium', pf.net_cashflow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      Net: ${pf.net_cashflow.toLocaleString()}
                    </span>
                    <span className="text-app-muted">{pf.invoice_count} inv</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spend by Category */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-semibold text-app-text flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4" />
            Spend by Category
          </h3>
          {spendByCategory.length === 0 ? (
            <p className="text-sm text-app-muted">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {(spendByCategory as Array<{ name: string; total: number; count: number }>).map((cat) => {
                const maxTotal = Math.max(...(spendByCategory as Array<{ total: number }>).map((c) => c.total));
                const pct = maxTotal > 0 ? (cat.total / maxTotal) * 100 : 0;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-app-text">{cat.name}</span>
                      <span className="text-app-muted">${cat.total.toLocaleString()} ({cat.count})</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Risk Overview */}
      {budgetForecasts.some((f) => f.will_exceed) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4" />
            Risk Alerts
          </h3>
          <div className="space-y-2">
            {budgetForecasts.filter((f) => f.will_exceed).map((f) => (
              <div key={f.budget_id} className="flex items-center justify-between text-sm">
                <span className="text-app-text">{f.department}</span>
                <span className="text-red-400">
                  Projected ${f.projected_total.toLocaleString()} (
                  {Math.round(f.projected_utilization * 100)}% of ${f.allocated_amount.toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color = 'text-app-text',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  color?: string;
  icon?: typeof Clock;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-app-muted mb-1">{label}</p>
      <p className={cn('text-xl font-bold flex items-center justify-center gap-1', color)}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </p>
    </div>
  );
}
