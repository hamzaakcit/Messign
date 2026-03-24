import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type GLAccount, type TrialBalance } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import {
  Plus, ChevronRight, ChevronDown, Search, Edit2, X, Check, Ban,
} from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  asset: 'text-blue-400 bg-blue-500/20',
  liability: 'text-orange-400 bg-orange-500/20',
  equity: 'text-purple-400 bg-purple-500/20',
  revenue: 'text-green-400 bg-green-500/20',
  expense: 'text-red-400 bg-red-500/20',
};

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function ChartOfAccountsPage() {
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(TYPE_ORDER));
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', type: 'expense', description: '', parent_id: '' });

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [accts, tb] = await Promise.all([
        financeAPI.listGLAccounts(user.id),
        financeAPI.getTrialBalance(user.id),
      ]);
      setAccounts(accts);
      setTrialBalance(tb);
    } catch (err) {
      console.error('Failed to load GL accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredAccounts = accounts.filter(a =>
    !search || a.code.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()),
  );

  const groupedByType = TYPE_ORDER.reduce((acc, type) => {
    acc[type] = filteredAccounts.filter(a => a.type === type);
    return acc;
  }, {} as Record<string, GLAccount[]>);

  const toggleType = (type: string) => {
    const next = new Set(expandedTypes);
    next.has(type) ? next.delete(type) : next.add(type);
    setExpandedTypes(next);
  };

  const handleCreate = async () => {
    if (!user?.id || !formData.code || !formData.name) return;
    try {
      await financeAPI.createGLAccount(user.id, {
        code: formData.code,
        name: formData.name,
        type: formData.type as GLAccount['type'],
        description: formData.description || undefined,
        parent_id: formData.parent_id || undefined,
      });
      setShowAddForm(false);
      setFormData({ code: '', name: '', type: 'expense', description: '', parent_id: '' });
      fetchData();
    } catch (err) {
      console.error('Failed to create account:', err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!user?.id) return;
    try {
      await financeAPI.updateGLAccount(user.id, id, {
        name: formData.name,
        description: formData.description || undefined,
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error('Failed to update account:', err);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!user?.id) return;
    try {
      await financeAPI.deactivateGLAccount(user.id, id);
      fetchData();
    } catch (err) {
      console.error('Failed to deactivate account:', err);
    }
  };

  const startEdit = (account: GLAccount) => {
    setEditingId(account.id);
    setFormData({ code: account.code, name: account.name, type: account.type, description: account.description || '', parent_id: account.parent_id || '' });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 rounded-lg bg-app-surface-tertiary animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trialBalance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4">
            <p className="text-xs text-app-muted">Total Debits</p>
            <p className="text-xl font-bold text-app-text">${(trialBalance.totalDebit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4">
            <p className="text-xs text-app-muted">Total Credits</p>
            <p className="text-xl font-bold text-app-text">${(trialBalance.totalCredit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4">
            <p className="text-xs text-app-muted">Balance Status</p>
            <p className={cn('text-xl font-bold', trialBalance.isBalanced ? 'text-green-400' : 'text-red-400')}>
              {trialBalance.isBalanced ? 'Balanced' : 'Out of Balance'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search accounts..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600"
        >
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 space-y-4">
          <h4 className="font-semibold text-app-text">New GL Account</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-app-muted mb-1">Code</label>
              <input value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                placeholder="e.g. 6800" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Name</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Utilities" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Type</label>
              <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none">
                {TYPE_ORDER.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Parent (optional)</label>
              <select value={formData.parent_id} onChange={e => setFormData(p => ({ ...p, parent_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none">
                <option value="">None</option>
                {accounts.filter(a => a.type === formData.type).map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Description (optional)</label>
            <input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600">Create Account</button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-app-muted hover:text-app-text text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {TYPE_ORDER.map(type => {
          const typeAccounts = groupedByType[type] || [];
          if (typeAccounts.length === 0 && search) return null;
          const isExpanded = expandedTypes.has(type);
          const typeTotal = typeAccounts.reduce((s, a) => s + (parseFloat(String(a.computed_balance ?? a.balance)) || 0), 0);

          return (
            <div key={type} className="rounded-xl border border-app-border bg-app-surface-tertiary overflow-hidden">
              <button
                onClick={() => toggleType(type)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-app-nav-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-app-muted" /> : <ChevronRight className="h-4 w-4 text-app-muted" />}
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[type])}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </span>
                  <span className="text-sm text-app-muted">({typeAccounts.length} accounts)</span>
                </div>
                <span className="text-sm font-medium text-app-text">
                  ${Math.abs(typeTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-app-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-app-muted text-xs">
                        <th className="text-left px-4 py-2 font-medium">Code</th>
                        <th className="text-left px-4 py-2 font-medium">Name</th>
                        <th className="text-left px-4 py-2 font-medium">Normal</th>
                        <th className="text-right px-4 py-2 font-medium">Balance</th>
                        <th className="text-center px-4 py-2 font-medium">Status</th>
                        <th className="text-right px-4 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeAccounts.map(account => (
                        <tr key={account.id} className="border-t border-app-border hover:bg-app-nav-hover">
                          <td className="px-4 py-2 font-mono text-app-text">{account.code}</td>
                          <td className="px-4 py-2">
                            {editingId === account.id ? (
                              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                className="px-2 py-1 rounded bg-app-surface-tertiary border border-app-border-strong text-sm text-app-text focus:outline-none w-full" />
                            ) : (
                              <span className={cn('text-app-text', account.parent_id && 'pl-4')}>
                                {account.parent_id && '└ '}{account.name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-app-muted capitalize">{account.normal_balance || '-'}</td>
                          <td className="px-4 py-2 text-right font-mono text-app-text">
                            ${(parseFloat(String(account.computed_balance ?? account.balance)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={cn('px-2 py-0.5 rounded text-xs', account.is_active ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20')}>
                              {account.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {editingId === account.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleUpdate(account.id)} className="p-1 text-green-400 hover:bg-green-500/20 rounded"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditingId(null)} className="p-1 text-app-muted hover:text-app-text rounded"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => startEdit(account)} className="p-1 text-app-muted hover:text-app-text rounded"><Edit2 className="h-3.5 w-3.5" /></button>
                                {account.is_active && (
                                  <button onClick={() => handleDeactivate(account.id)} className="p-1 text-app-muted hover:text-red-400 rounded"><Ban className="h-3.5 w-3.5" /></button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {typeAccounts.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-app-muted text-sm">No accounts in this category</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
