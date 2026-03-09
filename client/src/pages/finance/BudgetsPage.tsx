import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { type Budget } from '@/lib/api';
import { financeAPI } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import { Plus, PiggyBank, DollarSign, TrendingUp, BarChart3, Download, Filter } from 'lucide-react';

interface Props {
  onViewBudget: (id: string) => void;
}

export function BudgetsPage({ onViewBudget }: Props) {
  const { user, isAdmin } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'exceeded'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [utilizationFilter, setUtilizationFilter] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    department: '', allocatedAmount: '', periodStart: '', periodEnd: '',
    currency: 'EUR', alertThreshold: '0.8', name: '', description: '',
  });

  const fetchBudgets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [data, depts] = await Promise.all([
        financeAPI.listBudgets(userId).then((rows) =>
          (rows as unknown as Budget[]),
        ),
        financeAPI.getDepartments(userId).catch(() => [] as string[]),
      ]);
      setBudgets(data);
      setDepartments(depts);
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const handleCreate = async () => {
    if (!userId || !formData.department || !formData.allocatedAmount) return;
    try {
      await financeAPI.createBudget(userId, {
        department: formData.department,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        allocatedAmount: parseFloat(formData.allocatedAmount),
        currency: formData.currency,
        alertThreshold: parseFloat(formData.alertThreshold),
        name: formData.name || undefined,
        description: formData.description || undefined,
      });
      setShowCreate(false);
      setFormData({ department: '', allocatedAmount: '', periodStart: '', periodEnd: '', currency: 'EUR', alertThreshold: '0.8', name: '', description: '' });
      fetchBudgets();
    } catch (err) {
      console.error('Budget create failed:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Department', 'Allocated', 'Spent', 'Remaining', 'Utilization %', 'Currency', 'Status'];
    const rows = filtered.map((b) => [
      b.department, String(b.allocatedAmount), String(b.spent), String(b.remaining),
      (b.utilizationPct * 100).toFixed(1), b.currency,
      b.utilizationPct >= 1 ? 'Exceeded' : 'Active',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `budgets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = budgets.filter((b) => {
    if (statusFilter === 'active' && b.utilizationPct >= 1) return false;
    if (statusFilter === 'exceeded' && b.utilizationPct < 1) return false;
    if (departmentFilter && b.department !== departmentFilter) return false;
    if (utilizationFilter === 'above80' && b.utilizationPct < 0.8) return false;
    if (utilizationFilter === 'above50' && b.utilizationPct < 0.5) return false;
    return true;
  });

  const totalAllocated = budgets.reduce((s, b) => s + b.allocatedAmount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const avgUtil = budgets.length > 0 ? budgets.reduce((s, b) => s + b.utilizationPct, 0) / budgets.length : 0;
  const overBudget = budgets.filter((b) => b.utilizationPct >= 1).length;

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Budget Management</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
              showFilters ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' : 'bg-white/5 border-white/10 text-app-muted')}>
            <Filter className="h-4 w-4" /> Filters
          </button>
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:bg-white/10 hover:text-app-text">
            <Download className="h-4 w-4" /> Export
          </button>
          {isAdmin && (
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600">
              <Plus className="h-4 w-4" /> New Budget
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Department</label>
              <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Utilization</label>
              <select value={utilizationFilter} onChange={(e) => setUtilizationFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All</option>
                <option value="above80">Above 80%</option>
                <option value="above50">Above 50%</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-app-muted text-xs mb-1"><PiggyBank className="h-3.5 w-3.5" /> Total Budgets</div>
          <p className="text-2xl font-bold text-app-text">{budgets.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-app-muted text-xs mb-1"><DollarSign className="h-3.5 w-3.5" /> Total Allocated</div>
          <p className="text-2xl font-bold text-app-text">${totalAllocated.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-app-muted text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" /> Total Spent</div>
          <p className="text-2xl font-bold text-app-text">${totalSpent.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-app-muted text-xs mb-1"><BarChart3 className="h-3.5 w-3.5" /> Avg Utilization</div>
          <p className={cn('text-2xl font-bold', avgUtil >= 1 ? 'text-red-400' : avgUtil >= 0.8 ? 'text-amber-400' : 'text-emerald-400')}>
            {(avgUtil * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
          <h4 className="font-semibold text-app-text">Create New Budget</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-app-muted mb-1">Department *</label>
              <select value={formData.department} onChange={(e) => setFormData((p) => ({ ...p, department: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                <option value="">Select department</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Budget Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Q1 Cloud Costs"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Allocated Amount *</label>
              <input type="number" value={formData.allocatedAmount} onChange={(e) => setFormData((p) => ({ ...p, allocatedAmount: e.target.value }))}
                placeholder="50000"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Currency</label>
              <select value={formData.currency} onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                {['EUR', 'USD', 'TRY', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Period Start</label>
              <input type="date" value={formData.periodStart} onChange={(e) => setFormData((p) => ({ ...p, periodStart: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Period End</label>
              <input type="date" value={formData.periodEnd} onChange={(e) => setFormData((p) => ({ ...p, periodEnd: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Alert Threshold</label>
              <input type="number" step="0.05" min="0" max="1" value={formData.alertThreshold}
                onChange={(e) => setFormData((p) => ({ ...p, alertThreshold: e.target.value }))}
                placeholder="0.8"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-app-muted mb-1">Description</label>
              <input type="text" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional budget description"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
            </div>
          </div>
          {formData.department && (() => {
            const existing = budgets.filter((b) => b.department === formData.department);
            return existing.length > 0 ? (
              <div className="text-xs text-app-muted p-2 rounded-lg bg-white/5">
                Existing budgets for {formData.department}: {existing.map((b) => `${(b as Budget & { name?: string }).name || 'Unnamed'} (${b.currency} ${b.allocatedAmount.toLocaleString()})`).join(', ')}
              </div>
            ) : null;
          })()}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!formData.department || !formData.allocatedAmount}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">Create Budget</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-app-muted hover:text-app-text text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 w-fit">
        {(['all', 'active', 'exceeded'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
              statusFilter === s ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text')}>
            {s}{s === 'exceeded' && overBudget > 0 ? ` (${overBudget})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-app-muted">No budgets match this filter.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((b) => {
            const pct = Math.min(b.utilizationPct * 100, 100);
            const color = b.utilizationPct >= 1 ? 'bg-red-500' : b.utilizationPct >= b.alertThreshold ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={b.id} onClick={() => onViewBudget(b.id)}
                className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3 hover:border-white/20 transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-app-text">
                      {b.department}{b.name ? ` — ${b.name}` : ''}
                    </h4>
                    <p className="text-xs text-app-muted mt-0.5">
                      {new Date(b.periodStart).toLocaleDateString()} — {new Date(b.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={b.utilizationPct >= 1 ? 'overdue' : b.utilizationPct >= b.alertThreshold ? 'ai_flagged' : 'active'} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-app-muted">{b.currency} {b.spent.toFixed(2)} / {b.currency} {b.allocatedAmount.toFixed(2)}</span>
                    <span className="text-app-text font-medium">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-app-muted">
                    <span>Remaining: {b.currency} {b.remaining.toFixed(2)}</span>
                    <span>Alert at: {(b.alertThreshold * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
