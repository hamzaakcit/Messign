import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { supportApi, type SupportPriority, type SupportSlaPolicy } from '@/lib/supportApi';
import { SupportNav } from './components/SupportNav';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

const columns: ColumnDef<SupportSlaPolicy>[] = [
  { key: 'name', header: 'Policy', sortable: true },
  { key: 'priority', header: 'Priority', sortable: true },
  {
    key: 'firstResponseHours',
    header: 'First Response',
    sortable: true,
    render: (value) => `${value}h`,
  },
  {
    key: 'resolutionHours',
    header: 'Resolution',
    sortable: true,
    render: (value) => `${value}h`,
  },
  {
    key: 'escalationAfterHours',
    header: 'Escalation',
    render: (value) => (value == null ? '—' : `${value}h`),
  },
  {
    key: 'isActive',
    header: 'Status',
    render: (value) => (value ? 'Active' : 'Inactive'),
  },
];

export function SupportPoliciesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [policies, setPolicies] = useState<SupportSlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    priority: 'medium' as SupportPriority,
    firstResponseHours: '8',
    resolutionHours: '48',
    escalationAfterHours: '24',
  });

  const fetchPolicies = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setPolicies(await supportApi.listPolicies(userId));
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const summary = useMemo(() => {
    const active = policies.filter((policy) => policy.isActive).length;
    return `${active} active policies across ${policies.length} priorities`;
  }, [policies]);

  const handleCreate = async () => {
    if (!userId || !draft.name.trim()) return;
    setSaving(true);
    try {
      await supportApi.createPolicy(userId, {
        name: draft.name.trim(),
        priority: draft.priority,
        firstResponseHours: Number(draft.firstResponseHours),
        resolutionHours: Number(draft.resolutionHours),
        escalationAfterHours: draft.escalationAfterHours ? Number(draft.escalationAfterHours) : null,
      });
      setDraft({
        name: '',
        priority: 'medium',
        firstResponseHours: '8',
        resolutionHours: '48',
        escalationAfterHours: '24',
      });
      fetchPolicies();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <SupportNav />
          <DoraInsightBar module="support" fallback="Dora keeps support response targets aligned across your team." />

          <div className="flex items-center justify-between gap-4 mb-4 mt-4">
            <div>
              <h2 className="text-lg font-semibold text-app-text">SLA Policies</h2>
              <p className="text-sm text-app-muted">{summary}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Critical SLA"
                className={inputClass}
              />
              <select
                value={draft.priority}
                onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as SupportPriority }))}
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                value={draft.firstResponseHours}
                onChange={(event) => setDraft((current) => ({ ...current, firstResponseHours: event.target.value }))}
                type="number"
                min="0"
                step="0.5"
                placeholder="First response"
                className={inputClass}
              />
              <input
                value={draft.resolutionHours}
                onChange={(event) => setDraft((current) => ({ ...current, resolutionHours: event.target.value }))}
                type="number"
                min="0"
                step="0.5"
                placeholder="Resolution"
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  value={draft.escalationAfterHours}
                  onChange={(event) => setDraft((current) => ({ ...current, escalationAfterHours: event.target.value }))}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Escalate after"
                  className={inputClass}
                />
                <Button onClick={handleCreate} isLoading={saving} className="shrink-0">
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <DataTable
            data={policies}
            columns={columns}
            isLoading={loading}
            sortable
            emptyMessage="No SLA policies available yet."
          />
        </div>
      </div>
    </div>
  );
}
