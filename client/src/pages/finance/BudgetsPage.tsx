import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { budgetsAPI, type Budget } from '@/lib/api';
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
  const [formData, setFormData] = useState({
    department: '', allocatedAmount: '', periodStart: '', periodEnd: '',
    currency: 'EUR', alertThreshold: '0.8', name: '', description: '',
  });

  const fetchBudgets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await budgetsAPI.list(userId);
      setBudgets(data);
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const handleCreate = async () => {
    if (!userId || !formData.department || !formData.allocatedAmount) return;
    try {
      await budgetsAPI.create(userId, {
        department: formData.department,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        allocatedAmount: parseFloat(formData.allocatedAmount),
        currency: formData.currency,
        alertThreshold: parseFloat(formData.alertThreshold),
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
    if (statusFilter === 'active') return b.utilizationPct < 1;
    if (statusFilter === 'exceeded') return b.utilizationPct >= 1;
    if (departmentFilter && !b.department.toLowerCase().includes(departmentFilter.toLowerCase())) return false;
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
              <input type="text" placeholder="Filter by department" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
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
            {[
              { label: 'Department', key: 'department', type: 'text', placeholder: 'e.g., Engineering' },
              { label: 'Allocated Amount', key: 'allocatedAmount', type: 'number', placeholder: '50000' },
              { label: 'Currency', key: 'currency', type: 'select', options: ['EUR', 'USD', 'TRY', 'GBP'] },
              { label: 'Period Start', key: 'periodStart', type: 'date' },
              { label: 'Period End', key: 'periodEnd', type: 'date' },
              { label: 'Alert Threshold', key: 'alertThreshold', type: 'number', placeholder: '0.8' },
            ].map(({ label, key, type, placeholder, options }) => (
              <div key={key}>
                <label className="block text-xs text-app-muted mb-1">{label}</label>
                {type === 'select' ? (
                  <select value={formData[key as keyof typeof formData]}
                    onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                    {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={type} value={formData[key as keyof typeof formData]}
                    onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
                )}
              </div>
            ))}
          </div>
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
                    <h4 className="font-semibold text-app-text">{b.department}</h4>
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
