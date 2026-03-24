import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { adminKnowledgeAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  sort_order: number;
  document_count?: number;
}

export function KnowledgeCategoriesAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', icon: '', color: '#6366f1', sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await adminKnowledgeAPI.categories.list(userId);
      setCategories(data as Category[]);
    } catch { toast.error('Failed to load categories'); }
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, [userId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', icon: '', color: '#6366f1', sortOrder: 0 });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({ name: cat.name, icon: cat.icon ?? '', color: cat.color ?? '#6366f1', sortOrder: cat.sort_order });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await adminKnowledgeAPI.categories.update(userId, editing.id, { name: form.name, icon: form.icon || undefined, color: form.color, sortOrder: form.sortOrder });
        toast.success('Category updated');
      } else {
        await adminKnowledgeAPI.categories.create(userId, { name: form.name, icon: form.icon || undefined, color: form.color, sortOrder: form.sortOrder });
        toast.success('Category created');
      }
      setModalOpen(false);
      fetchCategories();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? Documents in this category will be uncategorized.`)) return;
    try {
      await adminKnowledgeAPI.categories.delete(userId, cat.id);
      toast.success('Category deleted');
      fetchCategories();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-app">Knowledge Hub — Categories</h1>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Add Category</Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-app-muted">Loading...</div>
      ) : (
        <div className="rounded-xl border border-app-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-app-card text-app-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Category</th>
                <th className="text-left py-3 px-3">Icon</th>
                <th className="text-left py-3 px-3">Color</th>
                <th className="text-right py-3 px-3">Documents</th>
                <th className="text-right py-3 px-3">Order</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-t border-app-border hover:bg-app-hover/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color ?? '#6366f1' }} />
                      <span className="font-medium text-app">{cat.name}</span>
                      <span className="text-xs text-app-muted">({cat.slug})</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-app-muted text-xs">{cat.icon ?? '—'}</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: (cat.color ?? '#6366f1') + '20', color: cat.color ?? '#6366f1' }}>{cat.color}</span></td>
                  <td className="py-3 px-3 text-right text-app-muted">{cat.document_count ?? 0}</td>
                  <td className="py-3 px-3 text-right text-app-muted">{cat.sort_order}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(cat)} className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(cat)} className="p-1.5 rounded text-app-muted hover:text-danger-400 hover:bg-app-hover"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-app-muted">No categories yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="rounded-xl border border-app-border bg-app-sidebar w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-app-border flex items-center justify-between">
              <h3 className="font-bold text-app">{editing ? 'Edit Category' : 'Add Category'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-app-muted hover:text-app"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-app mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app mb-1">Icon (Lucide name)</label>
                  <input value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} placeholder="e.g. Palette"
                    className="w-full px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm focus:outline-none focus:border-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-app mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer" />
                    <input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm font-mono focus:outline-none focus:border-primary-500" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-app mb-1">Sort Order</label>
                <input type="number" value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                  className="w-24 px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm focus:outline-none focus:border-primary-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-app-border flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
