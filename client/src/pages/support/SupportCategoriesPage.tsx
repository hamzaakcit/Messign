import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
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
    parentId: '',
  });
  const [editCategory, setEditCategory] = useState<SupportCategory | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    description: '',
    defaultPriority: 'medium' as SupportPriority,
    autoAssignTo: '',
    parentId: '',
    isActive: true,
  });

  const fetchCategories = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setCategories(await supportApi.listCategories(userId, true));
    } catch (err) {
      setCategories([]);
      toast.error(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!editCategory) return;
    setEditDraft({
      name: editCategory.name,
      description: editCategory.description ?? '',
      defaultPriority: editCategory.defaultPriority,
      autoAssignTo: editCategory.autoAssignTo ?? '',
      parentId: editCategory.parentId ?? '',
      isActive: editCategory.isActive,
    });
  }, [editCategory]);

  const summary = useMemo(() => {
    const active = categories.filter((category) => category.isActive).length;
    return `${active} active categories`;
  }, [categories]);

  const parentOptions = useCallback(
    (excludeId?: string) =>
      categories.filter((c) => c.id !== excludeId && c.isActive),
    [categories],
  );

  const handleCreate = async () => {
    if (!userId || !draft.name.trim()) return;
    setSaving(true);
    try {
      await supportApi.createCategory(userId, {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        defaultPriority: draft.defaultPriority,
        autoAssignTo: draft.autoAssignTo || undefined,
        parentId: draft.parentId || undefined,
      });
      setDraft({
        name: '',
        description: '',
        defaultPriority: 'medium',
        autoAssignTo: '',
        parentId: '',
      });
      toast.success('Category created');
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!userId || !editCategory) return;
    setSaving(true);
    try {
      await supportApi.updateCategory(userId, editCategory.id, {
        name: editDraft.name.trim(),
        description: editDraft.description.trim() || null,
        defaultPriority: editDraft.defaultPriority,
        autoAssignTo: editDraft.autoAssignTo || null,
        parentId: editDraft.parentId || null,
        isActive: editDraft.isActive,
      });
      toast.success('Category updated');
      setEditCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    async (row: SupportCategory) => {
      if (!userId) return;
      const ok = window.confirm(
        `Remove category "${row.name}"? Tickets referencing it may need to be recategorized.`,
      );
      if (!ok) return;
      try {
        await supportApi.deleteCategory(userId, row.id);
        toast.success('Category removed');
        fetchCategories();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete category');
      }
    },
    [userId, fetchCategories],
  );

  const columns = useMemo<ColumnDef<SupportCategory>[]>(
    () => [
      { key: 'name', header: 'Category', sortable: true },
      { key: 'description', header: 'Description' },
      {
        key: 'parentId',
        header: 'Parent',
        render: (_v, row) => {
          const parent = categories.find((c) => c.id === row.parentId);
          return parent?.name ?? '—';
        },
      },
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
      {
        key: 'actions',
        header: '',
        render: (_value, row) => (
          <div className="flex items-center gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditCategory(row)}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleDelete(row);
              }}
              className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        ),
      },
    ],
    [categories, handleDelete],
  );

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

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 mb-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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
                value={draft.parentId}
                onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))}
                className={inputClass}
                aria-label="Parent category"
              >
                <option value="">No parent</option>
                {parentOptions().map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={draft.defaultPriority}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, defaultPriority: event.target.value as SupportPriority }))
                }
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
                  aria-label="Auto assign"
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
              columns={columns}
              isLoading={loading}
              sortable
              emptyMessage="No support categories available yet."
            />
          </div>
        </div>
      </div>

      <SlideOverPanel
        isOpen={!!editCategory}
        onClose={() => setEditCategory(null)}
        title="Edit category"
        width={480}
      >
        {editCategory && (
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
              <span className="text-sm font-medium text-app-text">Description</span>
              <input
                value={editDraft.description}
                onChange={(event) => setEditDraft((d) => ({ ...d, description: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Parent</span>
              <select
                value={editDraft.parentId}
                onChange={(event) => setEditDraft((d) => ({ ...d, parentId: event.target.value }))}
                className={inputClass}
              >
                <option value="">No parent</option>
                {parentOptions(editCategory.id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Default priority</span>
              <select
                value={editDraft.defaultPriority}
                onChange={(event) =>
                  setEditDraft((d) => ({ ...d, defaultPriority: event.target.value as SupportPriority }))
                }
                className={inputClass}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-app-text">Auto assign</span>
              <select
                value={editDraft.autoAssignTo}
                onChange={(event) => setEditDraft((d) => ({ ...d, autoAssignTo: event.target.value }))}
                className={inputClass}
              >
                <option value="">None</option>
                {users.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
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
              <Button type="button" variant="ghost" onClick={() => setEditCategory(null)}>
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
