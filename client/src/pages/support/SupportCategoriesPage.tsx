import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import {
  supportApi,
  type SupportCategory,
  type SupportPriority,
} from '@/lib/supportApi';
import { SupportNav } from './components/SupportNav';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

const columns: ColumnDef<SupportCategory>[] = [
  { key: 'name', header: 'Category', sortable: true },
  { key: 'description', header: 'Description' },
  { key: 'defaultPriority', header: 'Default Priority', sortable: true },
  {
    key: 'autoAssignToName',
    header: 'Auto Assign',
    render: (value) => value || '—',
  },
  {
    key: 'isActive',
    header: 'Status',
    render: (value) => (value ? 'Active' : 'Inactive'),
  },
];

export function SupportCategoriesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const { users } = useUsersStore();

  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    defaultPriority: 'medium' as SupportPriority,
    autoAssignTo: '',
  });

  const fetchCategories = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setCategories(await supportApi.listCategories(userId));
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const summary = useMemo(() => {
    const active = categories.filter((category) => category.isActive).length;
    return `${active} active categories`;
  }, [categories]);

  const handleCreate = async () => {
    if (!userId || !draft.name.trim()) return;
    setSaving(true);
    try {
      await supportApi.createCategory(userId, {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        defaultPriority: draft.defaultPriority,
        autoAssignTo: draft.autoAssignTo || undefined,
      });
      setDraft({
        name: '',
        description: '',
        defaultPriority: 'medium',
        autoAssignTo: '',
      });
      fetchCategories();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!userId) return;
    await supportApi.deleteCategory(userId, categoryId);
    fetchCategories();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <SupportNav />
          <DoraInsightBar module="support" fallback="Dora tracks support taxonomy drift and flags categories that need cleaner routing." />

          <div className="flex items-center justify-between gap-4 mb-4 mt-4">
            <div>
              <h2 className="text-lg font-semibold text-app-text">Support Categories</h2>
              <p className="text-sm text-app-muted">{summary}</p>
            </div>
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Technical Support"
                className={inputClass}
              />
              <input
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Describe the category"
                className={inputClass}
              />
              <select
                value={draft.defaultPriority}
                onChange={(event) => setDraft((current) => ({ ...current, defaultPriority: event.target.value as SupportPriority }))}
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <div className="flex gap-2">
                <select
                  value={draft.autoAssignTo}
                  onChange={(event) => setDraft((current) => ({ ...current, autoAssignTo: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">No auto-assign</option>
                  {users.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
                <Button onClick={handleCreate} isLoading={saving} className="shrink-0">
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-2">
            <DataTable
              data={categories}
              columns={[
                ...columns,
                {
                  key: 'actions',
                  header: '',
                  render: (_value, row) => (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(row.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  ),
                },
              ]}
              isLoading={loading}
              sortable
              emptyMessage="No support categories available yet."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
