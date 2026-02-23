import { useState, useEffect } from 'react';
import { X, Building2, Save } from 'lucide-react';
import { bankDetailsAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface BankDetailsModalProps {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
}

interface BankDetailsForm {
  bankName: string;
  iban: string;
  swiftBic: string;
  accountHolder: string;
}

export function BankDetailsModal({ open, onClose, targetUserId, targetUserName }: BankDetailsModalProps) {
  const { user } = useAuthStore();
  const [form, setForm] = useState<BankDetailsForm>({
    bankName: '',
    iban: '',
    swiftBic: '',
    accountHolder: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open || !user?.id || !targetUserId) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    bankDetailsAPI.get(user.id, targetUserId)
      .then((data: any) => {
        if (data) {
          setForm({
            bankName: data.bank_name || '',
            iban: data.iban || '',
            swiftBic: data.swift_bic || '',
            accountHolder: data.account_holder || '',
          });
        } else {
          setForm({ bankName: '', iban: '', swiftBic: '', accountHolder: '' });
        }
      })
      .catch((e: any) => setError(e.message || 'Failed to load bank details'))
      .finally(() => setLoading(false));
  }, [open, user?.id, targetUserId]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      await bankDetailsAPI.update(user.id, targetUserId, form);
      setSuccess(true);
      setTimeout(() => onClose(), 800);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-xl border border-app-border bg-dark-800 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-app">Bank Details</h3>
          </div>
          <button onClick={onClose} className="p-1 text-app-muted hover:text-app">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-app-muted">
            Editing bank details for <span className="font-semibold text-app">{targetUserName}</span>
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
              Saved successfully!
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-app-muted">Loading...</div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-app-muted uppercase tracking-wider mb-1">Bank Name</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                  className="w-full input-theme py-2"
                  placeholder="e.g. Deutsche Bank"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-muted uppercase tracking-wider mb-1">Account Holder</label>
                <input
                  type="text"
                  value={form.accountHolder}
                  onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))}
                  className="w-full input-theme py-2"
                  placeholder="Full name on account"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-muted uppercase tracking-wider mb-1">IBAN</label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))}
                  className="w-full input-theme py-2 font-mono"
                  placeholder="e.g. DE89370400440532013000"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-muted uppercase tracking-wider mb-1">SWIFT / BIC</label>
                <input
                  type="text"
                  value={form.swiftBic}
                  onChange={(e) => setForm((p) => ({ ...p, swiftBic: e.target.value }))}
                  className="w-full input-theme py-2 font-mono"
                  placeholder="e.g. COBADEFFXXX"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-app-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-app-muted hover:bg-app-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
