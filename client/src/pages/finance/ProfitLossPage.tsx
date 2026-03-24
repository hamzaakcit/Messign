import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type ProfitLossReport } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function ProfitLossPage() {
  const { user } = useAuthStore();
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const computeRange = useCallback(() => {
    const [y, m] = selectedPeriod.split('-').map(Number);
    if (periodType === 'month') {
      return { from: selectedPeriod, to: selectedPeriod };
    }
    if (periodType === 'quarter') {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const from = `${y}-${String(qStart).padStart(2, '0')}`;
      const to = `${y}-${String(qStart + 2).padStart(2, '0')}`;
      return { from, to };
    }
    return { from: `${y}-01`, to: `${y}-12` };
  }, [selectedPeriod, periodType]);

  const fetchReport = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { from, to } = computeRange();
      const data = await financeAPI.getProfitLoss(user.id, from, to);
      setReport(data);
    } catch (err) {
      console.error('Failed to load P&L report:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, computeRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const pctChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const periodOptions = (() => {
    const now = new Date();
    const options: string[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return options;
  })();

  const TrendIcon = ({ current, previous }: { current: number; previous: number }) => {
    const change = pctChange(current, previous);
    if (Math.abs(change) < 0.5) return <Minus className="h-3.5 w-3.5 text-app-muted" />;
    return change > 0
      ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
      : <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-app-surface-tertiary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-lg border border-app-border overflow-hidden">
          {(['month', 'quarter', 'year'] as const).map(t => (
            <button
              key={t}
              onClick={() => setPeriodType(t)}
              className={cn('px-4 py-2 text-sm font-medium transition-colors capitalize',
                periodType === t ? 'bg-primary-500 text-app-text' : 'text-app-muted hover:text-app-text bg-app-surface-tertiary')}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className="px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none"
        >
          {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
              <p className="text-xs text-app-muted mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-green-400">${(report.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <div className="flex items-center gap-1 mt-1 text-xs text-app-muted">
                <TrendIcon current={report.totalRevenue ?? 0} previous={report.previousPeriod?.totalRevenue ?? 0} />
                {pctChange(report.totalRevenue ?? 0, report.previousPeriod?.totalRevenue ?? 0).toFixed(1)}% vs prior
              </div>
            </div>
            <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
              <p className="text-xs text-app-muted mb-1">Total Expenses</p>
              <p className="text-2xl font-bold text-red-400">${(report.totalExpenses ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              <div className="flex items-center gap-1 mt-1 text-xs text-app-muted">
                <TrendIcon current={report.totalExpenses ?? 0} previous={report.previousPeriod?.totalExpenses ?? 0} />
                {pctChange(report.totalExpenses ?? 0, report.previousPeriod?.totalExpenses ?? 0).toFixed(1)}% vs prior
              </div>
            </div>
            <div className={cn('rounded-xl border p-5', (report.netIncome ?? 0) >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10')}>
              <p className="text-xs text-app-muted mb-1">Net Income</p>
              <p className={cn('text-2xl font-bold', (report.netIncome ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                ${Math.abs(report.netIncome ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {(report.netIncome ?? 0) < 0 && ' (Loss)'}
              </p>
              <div className="flex items-center gap-1 mt-1 text-xs text-app-muted">
                <TrendIcon current={report.netIncome ?? 0} previous={report.previousPeriod?.netIncome ?? 0} />
                {pctChange(report.netIncome ?? 0, report.previousPeriod?.netIncome ?? 0).toFixed(1)}% vs prior
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary overflow-hidden">
            <div className="px-5 py-3 border-b border-app-border">
              <h3 className="text-sm font-semibold text-green-400">Revenue</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-app-muted text-xs">
                  <th className="text-left px-5 py-2 font-medium">GL Code</th>
                  <th className="text-left px-5 py-2 font-medium">Account</th>
                  <th className="text-right px-5 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.revenue.length > 0 ? report.revenue.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-app-border">
                    <td className="px-5 py-2.5 font-mono text-app-muted">{r.code}</td>
                    <td className="px-5 py-2.5 text-app-text">{r.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-green-400">${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} className="px-5 py-4 text-center text-app-muted">No revenue recorded</td></tr>
                )}
                <tr className="border-t border-app-border font-semibold">
                  <td colSpan={2} className="px-5 py-2.5 text-app-text">Total Revenue</td>
                  <td className="px-5 py-2.5 text-right font-mono text-green-400">${(report.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary overflow-hidden">
            <div className="px-5 py-3 border-b border-app-border">
              <h3 className="text-sm font-semibold text-red-400">Expenses</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-app-muted text-xs">
                  <th className="text-left px-5 py-2 font-medium">GL Code</th>
                  <th className="text-left px-5 py-2 font-medium">Account</th>
                  <th className="text-right px-5 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses.length > 0 ? report.expenses.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-app-border">
                    <td className="px-5 py-2.5 font-mono text-app-muted">{r.code}</td>
                    <td className="px-5 py-2.5 text-app-text">{r.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-red-400">${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} className="px-5 py-4 text-center text-app-muted">No expenses recorded</td></tr>
                )}
                <tr className="border-t border-app-border font-semibold">
                  <td colSpan={2} className="px-5 py-2.5 text-app-text">Total Expenses</td>
                  <td className="px-5 py-2.5 text-right font-mono text-red-400">${(report.totalExpenses ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={cn('rounded-xl border p-5', (report.netIncome ?? 0) >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10')}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-app-text">Net Income</span>
              <span className={cn('text-2xl font-bold', (report.netIncome ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                ${Math.abs(report.netIncome ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {(report.netIncome ?? 0) < 0 ? ' (Net Loss)' : ''}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
