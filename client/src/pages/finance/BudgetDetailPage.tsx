import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { budgetsAPI, type Budget } from '@/lib/api';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import { ArrowLeft, Trash2, PiggyBank, TrendingUp, AlertTriangle, Plus } from 'lucide-react';

interface Props {
  budgetId: string;
  onBack: () => void;
}

export function BudgetDetailPage({ budgetId, onBack }: Props) {
  const { user, isAdmin } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId || !budgetId) return;
    try {
      const [budgetList, exps] = await Promise.all([
        budgetsAPI.list(userId),
        financeAPI.getBudgetExpenses(userId, budgetId).catch(() => []),
      ]);
      const found = budgetList.find((b: Budget) => b.id === budgetId);
      setBudget(found || null);
      setExpenses(exps);
    } catch (err) {
      console.error('Failed to load budget:', err);
    }
    setLoading(false);
  }, [userId, budgetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!budget || isNaN(amount) || amount <= 0) return;
    setTopUpLoading(true);
    try {
      await financeAPI.updateBudget(userId, budgetId, {
        allocated_amount: budget.allocatedAmount + amount,
      });
      setShowTopUp(false);
      setTopUpAmount('');
      await fetchData();
    } catch (err) {
      console.error('Top up failed:', err);
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this budget?')) return;
    try {
      await financeAPI.deleteBudget(userId, budgetId);
      onBack();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-20 bg-white/5 rounded-xl" /><div className="h-40 bg-white/5 rounded-xl" /></div>;
  if (!budget) return <div className="text-center text-app-muted py-10">Budget not found</div>;

  const pct = Math.min(budget.utilizationPct * 100, 100);
  const color = budget.utilizationPct >= 1 ? 'bg-red-500' : budget.utilizationPct >= budget.alertThreshold ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = budget.utilizationPct >= 1 ? 'text-red-400' : budget.utilizationPct >= budget.alertThreshold ? 'text-amber-400' : 'text-emerald-400';

  const categorySummary = new Map<string, number>();
  expenses.forEach((e) => {
    const cat = (e.category_name as string) || 'Uncategorized';
    categorySummary.set(cat, (categorySummary.get(cat) || 0) + parseFloat(String(e.original_amount || 0)));
  });
  const catEntries = Array.from(categorySummary.entries()).sort((a, b) => b[1] - a[1]);
  const maxCatAmount = catEntries.length > 0 ? catEntries[0][1] : 1;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-app-muted hover:text-app-text text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to Budgets
      </button>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-text">
                {budget.department}{budget.name ? ` — ${budget.name}` : ''}
              </h2>
              <p className="text-sm text-app-muted">
                {new Date(budget.periodStart).toLocaleDateString()} — {new Date(budget.periodEnd).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={budget.utilizationPct >= 1 ? 'overdue' : budget.utilizationPct >= budget.alertThreshold ? 'ai_flagged' : 'active'} />
            {isAdmin && (
              <>
                <button onClick={() => setShowTopUp(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/10 text-primary-400 text-sm font-medium hover:bg-primary-500/20 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Top Up
                </button>
                <button onClick={handleDelete} className="p-2 text-app-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-app-muted">{budget.currency} {budget.spent.toFixed(2)} of {budget.currency} {budget.allocatedAmount.toFixed(2)}</span>
            <span className={cn('font-bold text-lg', textColor)}>{pct.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-app-text">{budget.currency} {budget.remaining.toFixed(2)}</p>
            <p className="text-xs text-app-muted">Remaining</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-app-text">{expenses.length}</p>
            <p className="text-xs text-app-muted">Expenses</p>
          </div>
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-app-text">{(budget.alertThreshold * 100).toFixed(0)}%</p>
            <p className="text-xs text-app-muted">Alert Threshold</p>
          </div>
        </div>
      </div>

      {budget.utilizationPct >= budget.alertThreshold && (
        <div className={cn('rounded-xl border p-4 flex items-center gap-3',
          budget.utilizationPct >= 1 ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10')}>
          <AlertTriangle className={cn('h-5 w-5', budget.utilizationPct >= 1 ? 'text-red-400' : 'text-amber-400')} />
          <div>
            <p className={cn('text-sm font-medium', budget.utilizationPct >= 1 ? 'text-red-400' : 'text-amber-400')}>
              {budget.utilizationPct >= 1 ? 'Budget Exceeded' : 'Budget Alert'}
            </p>
            <p className="text-xs text-app-muted">
              {budget.utilizationPct >= 1
                ? `This budget has exceeded its allocation by ${budget.currency} ${Math.abs(budget.remaining).toFixed(2)}`
                : `This budget is ${pct.toFixed(1)}% used, approaching the ${(budget.alertThreshold * 100).toFixed(0)}% alert threshold`}
            </p>
          </div>
        </div>
      )}

      {catEntries.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Spend by Category
          </h3>
          <div className="space-y-3">
            {catEntries.map(([cat, amount]) => (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-app-text">{cat}</span>
                  <span className="text-app-muted">{budget.currency} {amount.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(amount / maxCatAmount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold text-app-text mb-3">Linked Expenses</h3>
          <div className="space-y-2">
            {expenses.slice(0, 20).map((e) => (
              <div key={e.id as string} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 text-sm">
                <div>
                  <span className="text-app-text font-medium">{e.title as string}</span>
                  <span className="text-app-muted text-xs ml-2">{e.submitter_name as string}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-app-text font-medium">
                    {(e.original_currency as string) || budget.currency} {parseFloat(String(e.original_amount || 0)).toFixed(2)}
                  </span>
                  <StatusBadge status={e.status as string} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTopUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1a2e] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-app-text mb-1">Top Up Budget</h3>
            <p className="text-sm text-app-muted mb-4">
              Current allocation: {budget.currency} {budget.allocatedAmount.toFixed(2)}
            </p>
            <label className="block text-sm text-app-muted mb-1">Additional amount ({budget.currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-app-text text-sm focus:outline-none focus:border-primary-500 mb-1"
              autoFocus
            />
            {topUpAmount && !isNaN(parseFloat(topUpAmount)) && parseFloat(topUpAmount) > 0 && (
              <p className="text-xs text-app-muted mb-4">
                New total: {budget.currency} {(budget.allocatedAmount + parseFloat(topUpAmount)).toFixed(2)}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 mt-4">
              <button onClick={() => { setShowTopUp(false); setTopUpAmount(''); }}
                className="px-4 py-2 text-sm text-app-muted hover:text-app-text">
                Cancel
              </button>
              <button onClick={handleTopUp} disabled={topUpLoading || !topUpAmount || isNaN(parseFloat(topUpAmount)) || parseFloat(topUpAmount) <= 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                <Plus className="h-4 w-4" /> {topUpLoading ? 'Updating...' : 'Top Up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
