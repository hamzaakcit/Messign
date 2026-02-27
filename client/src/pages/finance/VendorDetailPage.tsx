import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceInvoice, type FinancePayment } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ArrowLeft, Edit2, Save, X, Ban, Building2 } from 'lucide-react';

interface Props {
  vendorId: string;
  onBack: () => void;
}

const EDIT_FIELDS = [
  { key: 'name', label: 'Company Name' },
  { key: 'legal_name', label: 'Legal Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'vendor_code', label: 'Vendor Code' },
  { key: 'tax_id', label: 'Tax ID' },
  { key: 'website', label: 'Website' },
  { key: 'country', label: 'Country' },
  { key: 'payment_terms', label: 'Payment Terms' },
];

export function VendorDetailPage({ vendorId, onBack }: Props) {
  const { user, isAdmin } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [vendor, setVendor] = useState<Record<string, unknown> | null>(null);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchVendor = useCallback(async () => {
    if (!userId || !vendorId) return;
    try {
      const [v, txns] = await Promise.all([
        financeAPI.getVendor(userId, vendorId),
        financeAPI.getVendorTransactions(userId, vendorId),
      ]);
      setVendor(v as Record<string, unknown>);
      setInvoices(txns.invoices);
      setPayments(txns.payments);
    } catch (err) {
      console.error('Failed to load vendor:', err);
    }
    setLoading(false);
  }, [userId, vendorId]);

  useEffect(() => { fetchVendor(); }, [fetchVendor]);

  const startEdit = () => {
    if (!vendor) return;
    const form: Record<string, string> = {};
    EDIT_FIELDS.forEach(({ key }) => { form[key] = String(vendor[key] || ''); });
    form.address = String(vendor.address || '');
    setEditForm(form);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await financeAPI.updateVendor(userId, vendorId, editForm);
      setEditing(false);
      fetchVendor();
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    try {
      await financeAPI.deactivateVendor(userId, vendorId);
      onBack();
    } catch (err) {
      console.error('Deactivate failed:', err);
    }
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-20 bg-white/5 rounded-xl" /><div className="h-40 bg-white/5 rounded-xl" /></div>;
  if (!vendor) return <div className="text-center text-app-muted py-10">Vendor not found</div>;

  const totalSpend = invoices.reduce((s, i) => s + parseFloat(String(i.grand_total || 0)), 0);
  const totalPaid = payments.reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-app-muted hover:text-app-text text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to Vendors
      </button>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-text">{String(vendor.name)}</h2>
              {vendor.vendor_code != null && <p className="text-sm text-app-muted">{String(vendor.vendor_code)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={vendor.is_active ? 'active' : 'closed'} />
            {isAdmin && !editing && (
              <>
                <button onClick={startEdit} className="p-2 text-app-muted hover:text-app-text hover:bg-white/5 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                {vendor.is_active && (
                  <button onClick={handleDeactivate} className="p-2 text-app-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Ban className="h-4 w-4" /></button>
                )}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EDIT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-app-muted mb-1">{label}</label>
                  <input value={editForm[key] || ''} onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Address</label>
              <textarea value={editForm.address || ''} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2 text-app-muted hover:text-app-text text-sm">
                <X className="h-4 w-4" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Email', value: vendor.email },
              { label: 'Phone', value: vendor.phone },
              { label: 'Payment Terms', value: vendor.payment_terms || 'Net 30' },
              { label: 'Currency', value: vendor.default_currency || 'USD' },
              { label: 'Tax ID', value: vendor.tax_id },
              { label: 'Country', value: vendor.country },
              { label: 'Website', value: vendor.website },
              { label: 'Legal Name', value: vendor.legal_name },
            ].map(({ label, value }) => value != null ? (
              <div key={label}>
                <span className="text-xs text-app-muted">{label}</span>
                <p className="text-app-text font-medium">{String(value)}</p>
              </div>
            ) : null)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-bold text-app-text">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-app-muted mt-1">Total Invoiced</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-bold text-app-text">${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-app-muted mt-1">Total Paid</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-bold text-app-text">{invoices.length}</p>
          <p className="text-xs text-app-muted mt-1">Invoices</p>
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold text-app-text mb-3">Recent Invoices</h3>
          <div className="space-y-2">
            {invoices.slice(0, 10).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 text-sm">
                <div>
                  <span className="text-app-text font-medium">{inv.invoice_number}</span>
                  <span className="text-app-muted text-xs ml-2">{inv.to_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-app-text font-medium">${parseFloat(String(inv.grand_total || 0)).toFixed(2)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold text-app-text mb-3">Payment History</h3>
          <div className="space-y-2">
            {payments.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 text-sm">
                <div>
                  <span className="text-app-text font-medium">{p.payment_number}</span>
                  <span className="text-app-muted text-xs ml-2">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-app-text font-medium">${parseFloat(String(p.amount)).toFixed(2)}</span>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
