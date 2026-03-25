import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceSettings, type ExpensePolicy, type ApprovalWorkflowStep } from '@/lib/financeApi';
import { Settings, Shield, Bot, Plus, Edit2, Save, Trash2, GitBranch, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsTab = 'general' | 'policies' | 'ai' | 'workflows' | 'notifications';

export function SettingsPage() {
  const { user, isAdmin } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const userId = user?.authUserId || user?.id || '';

  const tabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'policies', label: 'Expense Policies', icon: Shield },
    { id: 'workflows', label: 'Approval Workflows', icon: GitBranch },
    { id: 'ai', label: 'Dora AI Settings', icon: Bot },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex gap-6">
        <nav className="w-48 space-y-1 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-primary-500/10 text-primary-400'
                  : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-6">
          {activeTab === 'general' && <GeneralTab userId={userId} isAdmin={isAdmin} />}
          {activeTab === 'policies' && <PoliciesTab userId={userId} isAdmin={isAdmin} />}
          {activeTab === 'workflows' && <WorkflowsTab userId={userId} isAdmin={isAdmin} />}
          {activeTab === 'ai' && <AITab userId={userId} isAdmin={isAdmin} />}
          {activeTab === 'notifications' && <NotificationsTab userId={userId} />}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [, setSettings] = useState<FinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '', company_address: '', company_email: '', company_phone: '',
    company_website: '', company_tax_id: '', base_currency: 'USD',
    fiscal_year_start: 1, receipt_required_above: 25,
  });

  useEffect(() => {
    if (!userId) return;
    financeAPI.getSettings(userId).then((s) => {
      setSettings(s);
      setForm({
        company_name: s.company_name || '',
        company_address: s.company_address || '',
        company_email: s.company_email || '',
        company_phone: s.company_phone || '',
        company_website: s.company_website || '',
        company_tax_id: s.company_tax_id || '',
        base_currency: s.base_currency || 'USD',
        fiscal_year_start: s.fiscal_year_start ?? 1,
        receipt_required_above: s.receipt_required_above ?? 25,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await financeAPI.updateSettings(userId, form);
      setSettings(updated);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-app-surface-tertiary rounded-xl" />;

  const field = (label: string, key: keyof typeof form, type = 'text', opts?: { placeholder?: string }) => (
    <div>
      <label className="block text-xs text-app-muted mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
        placeholder={opts?.placeholder}
        disabled={!isAdmin}
        className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-4">
      <h3 className="text-lg font-semibold text-app-text">General Settings</h3>
      <p className="text-sm text-app-muted">
        Tax rates are managed under{' '}
        <Link to="/finance/accounting?tab=tax" className="text-primary-400 hover:underline">
          Accounting → Tax Rates
        </Link>
        .
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field('Company Name', 'company_name', 'text', { placeholder: 'Messign Inc.' })}
        {field('Email', 'company_email', 'email', { placeholder: 'finance@company.com' })}
        {field('Phone', 'company_phone', 'tel', { placeholder: '+1 555 0100' })}
        {field('Website', 'company_website', 'url', { placeholder: 'https://company.com' })}
        {field('Tax ID', 'company_tax_id', 'text', { placeholder: 'DE123456789' })}
        <div>
          <label className="block text-xs text-app-muted mb-1">Base Currency</label>
          <select value={form.base_currency} onChange={(e) => setForm((p) => ({ ...p, base_currency: e.target.value }))}
            disabled={!isAdmin} className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none disabled:opacity-60">
            {['USD', 'EUR', 'GBP', 'TRY', 'JPY', 'CAD'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {field('Fiscal Year Start Month', 'fiscal_year_start', 'number')}
        {field('Receipt Required Above ($)', 'receipt_required_above', 'number')}
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-app-muted mb-1">Address</label>
        <textarea
          value={form.company_address}
          onChange={(e) => setForm((p) => ({ ...p, company_address: e.target.value }))}
          disabled={!isAdmin}
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none disabled:opacity-60"
        />
      </div>
      {isAdmin && (
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

function PoliciesTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [policies, setPolicies] = useState<ExpensePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', violation_action: 'flag' as string, category: '', limit_amount: '' });

  const fetchPolicies = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await financeAPI.listExpensePolicies(userId);
      setPolicies(data);
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleCreate = async () => {
    if (!form.name) return;
    try {
      const rules = { category: form.category || null, max_amount: form.limit_amount ? parseFloat(form.limit_amount) : null };
      await financeAPI.createExpensePolicy(userId, {
        name: form.name,
        description: form.description,
        rules,
        violation_action: form.violation_action as ExpensePolicy['violation_action'],
      });
      setShowForm(false);
      setForm({ name: '', description: '', violation_action: 'flag', category: '', limit_amount: '' });
      fetchPolicies();
    } catch (err) {
      console.error('Create policy failed:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !form.name) return;
    try {
      const rules = { category: form.category || null, max_amount: form.limit_amount ? parseFloat(form.limit_amount) : null };
      await financeAPI.updateExpensePolicy(userId, editingId, {
        name: form.name,
        description: form.description,
        rules,
        violation_action: form.violation_action as ExpensePolicy['violation_action'],
      });
      setEditingId(null);
      fetchPolicies();
    } catch (err) {
      console.error('Update policy failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await financeAPI.deleteExpensePolicy(userId, id);
      fetchPolicies();
    } catch (err) {
      console.error('Delete policy failed:', err);
    }
  };

  const startEdit = (p: ExpensePolicy) => {
    setEditingId(p.id);
    const rules = (p.rules || {}) as Record<string, unknown>;
    setForm({
      name: p.name,
      description: p.description || '',
      violation_action: p.violation_action,
      category: (rules.category as string) || '',
      limit_amount: rules.max_amount ? String(rules.max_amount) : '',
    });
    setShowForm(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-app-surface-tertiary rounded-xl" />;

  return (
    <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Expense Policies</h3>
        {isAdmin && (
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', description: '', violation_action: 'flag', category: '', limit_amount: '' }); }}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600">
            <Plus className="h-3.5 w-3.5" /> Add Policy
          </button>
        )}
      </div>
      <p className="text-sm text-app-muted">Policies automatically evaluate expenses during submission. Violations can flag, warn, or block expenses.</p>

      {(showForm || editingId) && (
        <div className="rounded-lg border border-app-border bg-app-surface-tertiary p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Policy Name</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Travel - Flights" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g., travel, meals" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Max Amount ($)</label>
              <input type="number" value={form.limit_amount} onChange={(e) => setForm((p) => ({ ...p, limit_amount: e.target.value }))}
                placeholder="No limit" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Violation Action</label>
              <select value={form.violation_action} onChange={(e) => setForm((p) => ({ ...p, violation_action: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none">
                <option value="flag">Flag for review</option>
                <option value="warn">Warn submitter</option>
                <option value="block">Block submission</option>
                <option value="auto_reject">Auto-reject</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Optional description" className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={editingId ? handleUpdate : handleCreate}
              className="px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 text-app-muted hover:text-app-text text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {policies.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-app-nav-hover text-sm transition-colors">
            <div className="flex-1">
              <span className="text-app-text font-medium">{p.name}</span>
              {p.description && <span className="text-xs text-app-muted ml-2">{p.description}</span>}
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('px-2 py-0.5 rounded text-xs',
                  p.violation_action === 'flag' ? 'text-amber-400 bg-amber-500/20' :
                  p.violation_action === 'block' ? 'text-red-400 bg-red-500/20' :
                  p.violation_action === 'warn' ? 'text-yellow-400 bg-yellow-500/20' :
                  'text-red-400 bg-red-500/20'
                )}>{p.violation_action}</span>
                {(p.rules as Record<string, unknown>)?.max_amount != null && (
                  <span className="text-xs text-app-muted">Max: ${String((p.rules as Record<string, unknown>).max_amount)}</span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(p)} className="p-1 text-app-muted hover:text-app-text"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(p.id)} className="p-1 text-app-muted hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        ))}
        {policies.length === 0 && <p className="text-app-muted text-sm text-center py-4">No expense policies configured.</p>}
      </div>
    </div>
  );
}

function AITab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [, setSettings] = useState<FinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    dora_auto_approve_enabled: true, dora_auto_approve_max: 100,
    dora_min_confidence: 0.95, dora_max_risk: 0.20,
    dora_features: {} as Record<string, boolean>,
  });

  useEffect(() => {
    if (!userId) return;
    financeAPI.getSettings(userId).then((s) => {
      setSettings(s);
      setForm({
        dora_auto_approve_enabled: s.dora_auto_approve_enabled,
        dora_auto_approve_max: s.dora_auto_approve_max,
        dora_min_confidence: s.dora_min_confidence,
        dora_max_risk: s.dora_max_risk,
        dora_features: s.dora_features || {},
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await financeAPI.updateSettings(userId, form);
      setSettings(updated);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  const toggleFeature = (key: string) => {
    setForm((p) => ({ ...p, dora_features: { ...p.dora_features, [key]: !p.dora_features[key] } }));
  };

  if (loading) return <div className="animate-pulse h-40 bg-app-surface-tertiary rounded-xl" />;

  const featureKeys = [
    { key: 'ocr', label: 'Receipt OCR' },
    { key: 'categorization', label: 'Auto-Categorization' },
    { key: 'duplicate_detection', label: 'Duplicate Detection' },
    { key: 'anomaly_detection', label: 'Anomaly Detection' },
    { key: 'budget_forecast', label: 'Budget Forecasting' },
    { key: 'payment_prediction', label: 'Payment Prediction' },
    { key: 'smart_reminders', label: 'Smart Reminders' },
    { key: 'close_checklist', label: 'Close Checklist' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-4">
        <h3 className="text-lg font-semibold text-app-text flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary-500" /> Dora AI Autonomy
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-app-border">
            <div>
              <span className="text-sm text-app-text">Auto-Approve Enabled</span>
              <p className="text-xs text-app-muted">Dora can auto-approve low-risk expenses</p>
            </div>
            <button
              onClick={() => isAdmin && setForm((p) => ({ ...p, dora_auto_approve_enabled: !p.dora_auto_approve_enabled }))}
              className={cn('w-10 h-5 rounded-full relative transition-colors', form.dora_auto_approve_enabled ? 'bg-emerald-500' : 'bg-app-hover')}
            >
              <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', form.dora_auto_approve_enabled ? 'right-0.5' : 'left-0.5')} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-app-muted mb-1">Auto-Approve Max ($)</label>
              <input type="number" value={form.dora_auto_approve_max}
                onChange={(e) => setForm((p) => ({ ...p, dora_auto_approve_max: parseFloat(e.target.value) || 0 }))}
                disabled={!isAdmin}
                className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Min Confidence ({(form.dora_min_confidence * 100).toFixed(0)}%)</label>
              <input type="range" min="0.5" max="1" step="0.01" value={form.dora_min_confidence}
                onChange={(e) => setForm((p) => ({ ...p, dora_min_confidence: parseFloat(e.target.value) }))}
                disabled={!isAdmin} className="w-full accent-primary-500" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Max Risk ({(form.dora_max_risk * 100).toFixed(0)}%)</label>
              <input type="range" min="0" max="0.5" step="0.01" value={form.dora_max_risk}
                onChange={(e) => setForm((p) => ({ ...p, dora_max_risk: parseFloat(e.target.value) }))}
                disabled={!isAdmin} className="w-full accent-primary-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-3">
        <h3 className="text-lg font-semibold text-app-text">AI Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {featureKeys.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-app-nav-hover">
              <span className="text-sm text-app-text">{label}</span>
              <button
                onClick={() => isAdmin && toggleFeature(key)}
                className={cn('w-9 h-5 rounded-full relative transition-colors', form.dora_features[key] ? 'bg-emerald-500' : 'bg-app-hover')}
              >
                <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', form.dora_features[key] ? 'right-0.5' : 'left-0.5')} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save AI Settings'}
        </button>
      )}
    </div>
  );
}

const DEFAULT_WORKFLOWS: ApprovalWorkflowStep[] = [
  { name: 'Low Value', min_amount: 0, max_amount: 100, steps: [{ role: 'ai', sla_hours: 1 }] },
  { name: 'Standard', min_amount: 100, max_amount: 1000, steps: [{ role: 'ai', sla_hours: 1 }, { role: 'manager', sla_hours: 48 }] },
  { name: 'High Value', min_amount: 1000, max_amount: 5000, steps: [{ role: 'ai', sla_hours: 1 }, { role: 'manager', sla_hours: 48 }, { role: 'finance', sla_hours: 24 }] },
  { name: 'Executive', min_amount: 5000, max_amount: 999999, steps: [{ role: 'ai', sla_hours: 1 }, { role: 'manager', sla_hours: 48 }, { role: 'finance', sla_hours: 24 }, { role: 'cfo', sla_hours: 24 }] },
];

function WorkflowsTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [workflows, setWorkflows] = useState<ApprovalWorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    financeAPI.getApprovalWorkflows(userId).then((data) => {
      setWorkflows(data.length > 0 ? data : DEFAULT_WORKFLOWS);
      setLoading(false);
    }).catch(() => { setWorkflows(DEFAULT_WORKFLOWS); setLoading(false); });
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await financeAPI.updateApprovalWorkflows(userId, workflows);
    } catch (err) {
      console.error('Save workflows failed:', err);
    }
    setSaving(false);
  };

  const updateStep = (wIdx: number, sIdx: number, field: 'role' | 'sla_hours', value: string | number) => {
    setWorkflows((prev) => prev.map((w, i) =>
      i === wIdx ? { ...w, steps: w.steps.map((s, j) => j === sIdx ? { ...s, [field]: value } : s) } : w,
    ));
  };

  const updateWorkflow = (wIdx: number, field: 'name' | 'min_amount' | 'max_amount', value: string | number) => {
    setWorkflows((prev) => prev.map((w, i) => i === wIdx ? { ...w, [field]: value } : w));
  };

  if (loading) return <div className="animate-pulse h-40 bg-app-surface-tertiary rounded-xl" />;

  const roleLabels: Record<string, string> = { ai: 'AI Auto-Review', manager: 'Manager', finance: 'Finance', cfo: 'CFO', admin: 'Admin' };
  const roleColors: Record<string, string> = {
    ai: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    manager: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    finance: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cfo: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-4">
        <h3 className="text-lg font-semibold text-app-text flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary-500" /> Approval Workflows
        </h3>
        <p className="text-sm text-app-muted">Configure approval chains by expense amount range. Each step defines who reviews and the SLA deadline.</p>

        {workflows.map((w, wIdx) => (
          <div key={wIdx} className="rounded-lg border border-app-border bg-app-surface-tertiary p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-app-muted mb-1">Rule Name</label>
                <input value={w.name} onChange={(e) => updateWorkflow(wIdx, 'name', e.target.value)}
                  disabled={!isAdmin} className="w-full px-3 py-1.5 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Min Amount ($)</label>
                <input type="number" value={w.min_amount} onChange={(e) => updateWorkflow(wIdx, 'min_amount', parseFloat(e.target.value) || 0)}
                  disabled={!isAdmin} className="w-full px-3 py-1.5 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Max Amount ($)</label>
                <input type="number" value={w.max_amount} onChange={(e) => updateWorkflow(wIdx, 'max_amount', parseFloat(e.target.value) || 0)}
                  disabled={!isAdmin} className="w-full px-3 py-1.5 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none disabled:opacity-60" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {w.steps.map((step, sIdx) => (
                <div key={sIdx} className="flex items-center gap-2">
                  {sIdx > 0 && <span className="text-app-muted text-xs">→</span>}
                  <div className={cn('rounded-lg border px-3 py-2 space-y-1', roleColors[step.role] || 'bg-app-surface-tertiary border-app-border')}>
                    <select value={step.role} onChange={(e) => updateStep(wIdx, sIdx, 'role', e.target.value)}
                      disabled={!isAdmin} className="bg-transparent text-xs font-medium focus:outline-none disabled:opacity-60 w-full">
                      {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="flex items-center gap-1 text-[10px] text-app-muted">
                      <span>SLA:</span>
                      <input type="number" value={step.sla_hours} onChange={(e) => updateStep(wIdx, sIdx, 'sla_hours', parseInt(e.target.value) || 1)}
                        disabled={!isAdmin} className="bg-transparent w-12 text-center focus:outline-none disabled:opacity-60" />
                      <span>hrs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Workflows'}
        </button>
      )}
    </div>
  );
}

const NOTIFICATION_TYPES = [
  { key: 'expense_approval_request', label: 'Expense submitted for my approval' },
  { key: 'expense_approved', label: 'My expense approved' },
  { key: 'expense_rejected', label: 'My expense rejected' },
  { key: 'ai_auto_approved', label: 'AI auto-approved expense' },
  { key: 'ai_flagged', label: 'AI flagged expense' },
  { key: 'budget_warning', label: 'Budget threshold warning' },
  { key: 'budget_exceeded', label: 'Budget exceeded' },
  { key: 'invoice_overdue', label: 'Invoice overdue' },
  { key: 'payment_processed', label: 'Payment processed' },
  { key: 'sla_escalation', label: 'SLA escalation' },
  { key: 'monthly_close', label: 'Monthly close reminder' },
];

function NotificationsTab({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<Record<string, { in_app: boolean; email: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    financeAPI.getNotificationPreferences(userId).then((data) => {
      const merged: Record<string, { in_app: boolean; email: boolean }> = {};
      for (const t of NOTIFICATION_TYPES) {
        merged[t.key] = data[t.key] ?? { in_app: true, email: false };
      }
      setPrefs(merged);
      setLoading(false);
    }).catch(() => {
      const defaults: Record<string, { in_app: boolean; email: boolean }> = {};
      for (const t of NOTIFICATION_TYPES) defaults[t.key] = { in_app: true, email: false };
      setPrefs(defaults);
      setLoading(false);
    });
  }, [userId]);

  const toggle = (key: string, channel: 'in_app' | 'email') => {
    setPrefs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: !prev[key]?.[channel] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await financeAPI.updateNotificationPreferences(userId, prefs);
    } catch (err) {
      console.error('Save prefs failed:', err);
    }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-app-surface-tertiary rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-4">
        <h3 className="text-lg font-semibold text-app-text flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary-500" /> Notification Preferences
        </h3>
        <p className="text-sm text-app-muted">Control which notifications you receive and how.</p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app-border text-xs text-app-muted uppercase">
              <th className="text-left py-2 px-2">Notification Type</th>
              <th className="text-center py-2 px-2 w-24">In-App</th>
              <th className="text-center py-2 px-2 w-24">Email</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map(({ key, label }) => (
              <tr key={key} className="border-b border-app-border hover:bg-app-hover">
                <td className="py-2.5 px-2 text-app-text">{label}</td>
                <td className="py-2.5 px-2 text-center">
                  <button onClick={() => toggle(key, 'in_app')}
                    className={cn('w-9 h-5 rounded-full relative transition-colors', prefs[key]?.in_app ? 'bg-emerald-500' : 'bg-app-hover')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', prefs[key]?.in_app ? 'right-0.5' : 'left-0.5')} />
                  </button>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <button onClick={() => toggle(key, 'email')} disabled
                    className="w-9 h-5 rounded-full relative bg-app-surface-tertiary opacity-40 cursor-not-allowed">
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/60" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-app-muted">Email notifications are coming soon.</p>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
        <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
