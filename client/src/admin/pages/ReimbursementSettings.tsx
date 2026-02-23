import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { reimbursementSettingsAPI, categoriesAPI } from '@/lib/api';
import { Button } from '@/components/ui';

interface SettingsRow {
  meal_limit?: number;
  daily_limit?: number;
  monthly_limit?: number;
  mileage_rate_per_km?: number;
  mileage_currency?: string;
  auto_approve_below?: number;
  require_signed_invoice_above?: number;
  enable_ocr?: boolean;
  enable_mileage?: boolean;
  enable_currency_conversion?: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  icon?: string;
  spending_limit?: number;
  requires_justification_above?: number;
  is_active: boolean;
}

export function ReimbursementSettings() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setError(null);
    Promise.all([
      reimbursementSettingsAPI.get(userId) as Promise<SettingsRow>,
      categoriesAPI.listAll(userId) as Promise<CategoryRow[]>,
    ])
      .then(([s, c]) => {
        setSettings(s ?? null);
        setCategories(Array.isArray(c) ? c : []);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load settings');
        setSettings({
          mileage_rate_per_km: 0.67,
          mileage_currency: 'USD',
          enable_ocr: true,
          enable_mileage: true,
          enable_currency_conversion: true,
        });
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSaveSettings = async () => {
    if (!userId || !settings) return;
    setSaving(true);
    try {
      const updated = (await reimbursementSettingsAPI.patch(userId, settings)) as SettingsRow;
      setSettings(updated ?? settings);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleAddCategory = async () => {
    if (!userId || !newCategoryName.trim()) return;
    setCategoryError(null);
    setSaving(true);
    try {
      const created = (await categoriesAPI.create(userId, { name: newCategoryName.trim() })) as CategoryRow;
      setCategories((prev) => [...prev, created]);
      setNewCategoryName('');
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCategory = async (id: string, data: Partial<CategoryRow>) => {
    if (!userId) return;
    setCategoryError(null);
    setSaving(true);
    try {
      const updated = (await categoriesAPI.update(userId, id, data)) as CategoryRow;
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!userId) return;
    if (!window.confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    setCategoryError(null);
    setSaving(true);
    try {
      await categoriesAPI.delete(userId, id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setEditingId((prev) => (prev === id ? null : prev));
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-app">
        <div className="text-app-muted">Loading...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 bg-app">
        <div className="text-red-400 mb-2">{error ?? 'Failed to load settings'}</div>
        <p className="text-app-muted text-sm">
          Ensure your user has reimbursement admin access and the reimbursement module is set up.
        </p>
      </div>
    );
  }

  const inputClass = 'input-theme max-w-xs';

  const sectionClass = 'rounded-xl border border-app-border bg-dark-800 overflow-hidden';
  const sectionHeaderClass = 'px-4 py-3 border-b border-app-border text-app font-semibold';
  const sectionBodyClass = 'p-4 space-y-4';

  return (
    <div className="p-6 space-y-6 bg-app min-h-full transition-colors duration-200">
      <h1 className="text-2xl font-bold text-app">Reimbursement Settings</h1>

      {error && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          {error}
        </div>
      )}

      <div className={sectionClass}>
        <div className={sectionHeaderClass}>Spending Limits</div>
        <div className={sectionBodyClass}>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Meal limit (amount)</label>
            <input
              type="number"
              step="0.01"
              value={settings.meal_limit ?? ''}
              onChange={(e) => updateSetting('meal_limit', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Daily limit</label>
            <input
              type="number"
              step="0.01"
              value={settings.daily_limit ?? ''}
              onChange={(e) => updateSetting('daily_limit', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Monthly limit</label>
            <input
              type="number"
              step="0.01"
              value={settings.monthly_limit ?? ''}
              onChange={(e) => updateSetting('monthly_limit', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <div className={sectionHeaderClass}>Mileage</div>
        <div className={sectionBodyClass}>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!settings.enable_mileage}
              onChange={(e) => updateSetting('enable_mileage', e.target.checked)}
              className="rounded border-app-border bg-app text-primary-500"
            />
            <span className="text-sm text-app-muted">Enable mileage claims</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Rate per km</label>
            <input
              type="number"
              step="0.01"
              value={settings.mileage_rate_per_km ?? ''}
              onChange={(e) => updateSetting('mileage_rate_per_km', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Currency</label>
            <select
              value={settings.mileage_currency ?? 'USD'}
              onChange={(e) => updateSetting('mileage_currency', e.target.value)}
              className={inputClass}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="TRY">TRY</option>
            </select>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <div className={sectionHeaderClass}>Approval Workflow</div>
        <div className={sectionBodyClass}>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Auto-approve below (amount)</label>
            <input
              type="number"
              step="0.01"
              value={settings.auto_approve_below ?? ''}
              onChange={(e) => updateSetting('auto_approve_below', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted uppercase tracking-wide mb-1">Require signed invoice above (amount)</label>
            <input
              type="number"
              step="0.01"
              value={settings.require_signed_invoice_above ?? ''}
              onChange={(e) => updateSetting('require_signed_invoice_above', e.target.value ? parseFloat(e.target.value) : undefined)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <div className={sectionHeaderClass}>AI</div>
        <div className={sectionBodyClass}>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!settings.enable_ocr}
              onChange={(e) => updateSetting('enable_ocr', e.target.checked)}
              className="rounded border-app-border bg-app text-primary-500"
            />
            <span className="text-sm text-app-muted">Enable OCR for receipts</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!settings.enable_currency_conversion}
              onChange={(e) => updateSetting('enable_currency_conversion', e.target.checked)}
              className="rounded border-app-border bg-app text-primary-500"
            />
            <span className="text-sm text-app-muted">Enable currency conversion</span>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <div className={sectionHeaderClass}>Expense Categories</div>
        <div className={sectionBodyClass}>
          {categoryError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {categoryError}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                setCategoryError(null);
              }}
              placeholder="New category name"
              className={inputClass}
            />
            <Button size="sm" onClick={handleAddCategory} disabled={saving || !newCategoryName.trim()}>
              Add Category
            </Button>
          </div>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 p-3 rounded-lg bg-app-hover border border-app-border"
              >
                {editingId === c.id ? (
                  <input
                    type="text"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name) handleUpdateCategory(c.id, { name: v });
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className={inputClass}
                    autoFocus
                  />
                ) : (
                  <span className="text-app">{c.icon} {c.name}</span>
                )}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm text-app-muted">
                    <input
                      type="checkbox"
                      checked={!!c.is_active}
                      onChange={(e) => handleUpdateCategory(c.id, { is_active: e.target.checked })}
                      className="rounded border-app-border bg-app text-primary-500"
                    />
                    Active
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(c.id)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteCategory(c.id, c.name)}
                    disabled={saving}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
