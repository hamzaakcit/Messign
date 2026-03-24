import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type TaxRate } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const TAX_TYPES: { value: TaxRate['type']; label: string }[] = [
  { value: 'vat', label: 'VAT' },
  { value: 'sales', label: 'Sales Tax' },
  { value: 'purchase', label: 'Purchase Tax' },
  { value: 'withholding', label: 'Withholding' },
];

const emptyForm = (): Partial<TaxRate> => ({ name: '', code: '', rate: 0, type: 'vat', is_active: true });

export function TaxRatesPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TaxRate>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchRates = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await financeAPI.listTaxRates(userId);
      setRates(data);
    } catch { /* empty */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (rate: TaxRate) => {
    setEditId(rate.id);
    setForm({ name: rate.name, code: rate.code, rate: rate.rate, type: rate.type, is_active: rate.is_active });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { setError('Name is required'); return; }
    if (!form.code?.trim()) { setError('Code is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await financeAPI.updateTaxRate(userId, editId, form);
      } else {
        await financeAPI.createTaxRate(userId, form);
      }
      setModalOpen(false);
      await fetchRates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this tax rate?')) return;
    try {
      await financeAPI.deactivateTaxRate(userId, id);
      await fetchRates();
    } catch { /* empty */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Tax Rates</h3>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 text-app-text text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Tax Rate
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide text-right">Rate</th>
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide text-center">Status</th>
              <th className="px-4 py-3 text-xs text-app-muted font-medium uppercase tracking-wide text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-app-muted">
                  No tax rates configured yet. Click "Add Tax Rate" to create one.
                </td>
              </tr>
            ) : (
              rates.map((rate) => (
                <tr key={rate.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono text-app-muted">{rate.code}</td>
                  <td className="px-4 py-3 text-app-text font-medium">{rate.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-app-muted capitalize">
                      {rate.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-app-text font-medium">{rate.rate}%</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      rate.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-app-muted',
                    )}>
                      {rate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(rate)} className="p-1.5 rounded hover:bg-white/10 text-app-muted hover:text-app-text transition-colors" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {rate.is_active && (
                        <button onClick={() => handleDeactivate(rate.id)} className="p-1.5 rounded hover:bg-red-500/10 text-app-muted hover:text-red-400 transition-colors" title="Deactivate">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-app-card border border-white/10 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-app-text">{editId ? 'Edit Tax Rate' : 'New Tax Rate'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-white/10 text-app-muted"><X className="h-4 w-4" /></button>
            </div>

            {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-app-muted mb-1">Name *</label>
                <input type="text" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" placeholder="e.g. Standard VAT" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-app-muted mb-1">Code *</label>
                  <input type="text" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" placeholder="e.g. VAT20" />
                </div>
                <div>
                  <label className="block text-xs text-app-muted mb-1">Rate (%)</label>
                  <input type="number" min={0} max={100} step={0.01} value={form.rate || 0} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Type</label>
                <select value={form.type || 'vat'} onChange={(e) => setForm({ ...form, type: e.target.value as TaxRate['type'] })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                  {TAX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {editId && (
                <label className="flex items-center gap-2 text-sm text-app-text cursor-pointer">
                  <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded accent-primary-500" />
                  Active
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:text-app-text hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 text-app-text text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors">
                <Check className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
