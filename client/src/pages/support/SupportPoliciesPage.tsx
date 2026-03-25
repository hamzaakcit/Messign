import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { supportApi, type SupportPriority, type SupportSlaPolicy } from '@/lib/supportApi';
import { SupportNav } from './components/SupportNav';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

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
    escalateToRole: '',
    businessHoursOnly: false,
  });
  const [editPolicy, setEditPolicy] = useState<SupportSlaPolicy | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    priority: 'medium' as SupportPriority,
    firstResponseHours: '8',
    resolutionHours: '48',
    escalationAfterHours: '',
    escalateToRole: '',
    businessHoursOnly: false,
    isActive: true,
  });

  const fetchPolicies = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setPolicies(await supportApi.listPolicies(userId));
    } catch (err) {
      setPolicies([]);
      toast.error(err instanceof Error ? err.message : 'Failed to load SLA policies');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  useEffect(() => {
    if (!editPolicy) return;
    setEditDraft({
      name: editPolicy.name,
      priority: editPolicy.priority,
      firstResponseHours: String(editPolicy.firstResponseHours),
      resolutionHours: String(editPolicy.resolutionHours),
      escalationAfterHours:
        editPolicy.escalationAfterHours == null ? '' : String(editPolicy.escalationAfterHours),
      escalateToRole: editPolicy.escalateToRole ?? '',
      businessHoursOnly: editPolicy.businessHoursOnly,
      isActive: editPolicy.isActive,
    });
  }, [editPolicy]);

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
        escalateToRole: draft.escalateToRole.trim() || null,
        businessHoursOnly: draft.businessHoursOnly,
      });
      setDraft({
        name: '',
        priority: 'medium',
        firstResponseHours: '8',
        resolutionHours: '48',
        escalationAfterHours: '24',
        escalateToRole: '',
        businessHoursOnly: false,
      });
      toast.success('Policy created');
      fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create policy');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!userId || !editPolicy) return;
    setSaving(true);
    try {
      await supportApi.updatePolicy(userId, editPolicy.id, {
        name: editDraft.name.trim(),
        priority: editDraft.priority,
        firstResponseHours: Number(editDraft.firstResponseHours),
        resolutionHours: Number(editDraft.resolutionHours),
        escalationAfterHours: editDraft.escalationAfterHours
          ? Number(editDraft.escalationAfterHours)
          : null,
        escalateToRole: editDraft.escalateToRole.trim() || null,
        businessHoursOnly: editDraft.businessHoursOnly,
        isActive: editDraft.isActive,
      });
      toast.success('Policy updated');
      setEditPolicy(null);
      fetchPolicies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update policy');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = useCallback(
    async (policy: SupportSlaPolicy) => {
      if (!userId) return;
      try {
        await supportApi.updatePolicy(userId, policy.id, { isActive: !policy.isActive });
        toast.success(!policy.isActive ? 'Policy activated' : 'Policy deactivated');
        fetchPolicies();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update policy');
      }
    },
    [userId, fetchPolicies],
  );

  const columns = useMemo<ColumnDef<SupportSlaPolicy>[]>(
    () => [
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
        key: 'businessHoursOnly',
        header: 'Biz hours',
        render: (value) => (value ? 'Yes' : 'No'),
      },
      {
        key: 'isActive',
        header: 'Status',
        render: (value) => (value ? 'Active' : 'Inactive'),
      },
      {
        key: 'actions',
        header: '',
        render: (_v, row) => (
          <div className="flex items-center gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditPolicy(row)}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void toggleActive(row)}>
              {row.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ),
      },
    ],
    [toggleActive],
  );

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

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 mb-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Critical SLA"
                className={inputClass}
              />
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, priority: event.target.value as SupportPriority }))
                }
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                value={draft.firstResponseHours}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, firstResponseHours: event.target.value }))
                }
                type="number"
                min="0"
                step="0.5"
                placeholder="First response"
                className={inputClass}
              />
              <input
                value={draft.resolutionHours}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, resolutionHours: event.target.value }))
                }
                type="number"
                min="0"
                step="0.5"
                placeholder="Resolution"
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  value={draft.escalationAfterHours}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, escalationAfterHours: event.target.value }))
                  }
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
              <input
                value={draft.escalateToRole}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, escalateToRole: event.target.value }))
                }
                placeholder="Escalate to role (e.g. manager)"
                className={inputClass}
              />
              <label className="inline-flex items-center gap-2 text-sm text-app-text">
                <input
                  type="checkbox"
                  checked={draft.businessHoursOnly}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, businessHoursOnly: event.target.checked }))
                  }
                  className="w-4 h-4 rounded border-app-border"
                />
                Business hours only
              </label>
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

      <SlideOverPanel
        isOpen={!!editPolicy}
        onClose={() => setEditPolicy(null)}
        title="Edit SLA policy"
        width={480}
      >
        {editPolicy && (
          <div className="p-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Name</span>
              <input
                value={editDraft.name}
                onChange={(event) => setEditDraft((d) => ({ ...d, name: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Priority</span>
              <select
                value={editDraft.priority}
                onChange={(event) =>
                  setEditDraft((d) => ({ ...d, priority: event.target.value as SupportPriority }))
                }
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-app-text">First response (h)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editDraft.firstResponseHours}
                  onChange={(event) =>
                    setEditDraft((d) => ({ ...d, firstResponseHours: event.target.value }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-app-text">Resolution (h)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editDraft.resolutionHours}
                  onChange={(event) =>
                    setEditDraft((d) => ({ ...d, resolutionHours: event.target.value }))
                  }
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Escalate after (h)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editDraft.escalationAfterHours}
                onChange={(event) =>
                  setEditDraft((d) => ({ ...d, escalationAfterHours: event.target.value }))
                }
                placeholder="Optional"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Escalate to role</span>
              <input
                value={editDraft.escalateToRole}
                onChange={(event) =>
                  setEditDraft((d) => ({ ...d, escalateToRole: event.target.value }))
                }
                placeholder="e.g. manager"
                className={inputClass}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-app-text">
              <input
                type="checkbox"
                checked={editDraft.businessHoursOnly}
                onChange={(event) =>
                  setEditDraft((d) => ({ ...d, businessHoursOnly: event.target.checked }))
                }
                className="w-4 h-4 rounded border-app-border"
              />
              Business hours only
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-app-text">
              <input
                type="checkbox"
                checked={editDraft.isActive}
                onChange={(event) => setEditDraft((d) => ({ ...d, isActive: event.target.checked }))}
                className="w-4 h-4 rounded border-app-border"
              />
              Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditPolicy(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveEdit} isLoading={saving}>
                Save
              </Button>
            </div>
          </div>
        )}
      </SlideOverPanel>
    </div>
  );
}
