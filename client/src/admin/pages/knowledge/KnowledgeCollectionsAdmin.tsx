import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { adminKnowledgeAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X, FolderOpen, Copy, Globe } from 'lucide-react';

interface Collection {
  id: string; name: string; slug: string; description?: string | null;
  share_token: string; is_public: boolean; document_count?: number;
  created_by_name?: string; created_at: string;
}

export function KnowledgeCollectionsAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [form, setForm] = useState({ name: '', description: '', isPublic: false });
  const [saving, setSaving] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const data = await adminKnowledgeAPI.collections.list(userId);
      setCollections(data as Collection[]);
    } catch { toast.error('Failed to load collections'); }
    setLoading(false);
  };

  useEffect(() => { fetchCollections(); }, [userId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', isPublic: false });
    setModalOpen(true);
  };

  const openEdit = (col: Collection) => {
    setEditing(col);
    setForm({ name: col.name, description: col.description ?? '', isPublic: col.is_public });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await adminKnowledgeAPI.collections.update(userId, editing.id, form);
        toast.success('Collection updated');
      } else {
        await adminKnowledgeAPI.collections.create(userId, form);
        toast.success('Collection created');
      }
      setModalOpen(false);
      fetchCollections();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    setSaving(false);
  };

  const handleDelete = async (col: Collection) => {
    if (!confirm(`Delete "${col.name}"?`)) return;
    try {
      await adminKnowledgeAPI.collections.delete(userId, col.id);
      toast.success('Collection deleted');
      fetchCollections();
    } catch { toast.error('Failed to delete'); }
  };

  const copyShareLink = (col: Collection) => {
    navigator.clipboard.writeText(`${window.location.origin}/knowledge/collections/${col.share_token}`);
    toast.success('Share link copied!');
  };

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-app">Knowledge Hub — Collections</h1>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Create Collection</Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-app-muted">Loading...</div>
      ) : (
        <div className="rounded-xl border border-app-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-700 text-app-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Collection</th>
                <th className="text-right py-3 px-3">Documents</th>
                <th className="text-left py-3 px-3">Share Link</th>
                <th className="text-left py-3 px-3 hidden md:table-cell">Created By</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map(col => (
                <tr key={col.id} className="border-t border-app-border hover:bg-dark-700/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-5 h-5 text-indigo-400 shrink-0" />
                      <div>
                        <span className="font-medium text-app">{col.name}</span>
                        {col.description && <p className="text-xs text-app-muted truncate max-w-xs">{col.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-app-muted">{col.document_count ?? 0}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyShareLink(col)} className="p-1 rounded text-app-muted hover:text-primary-400 hover:bg-app-hover" title="Copy share link">
                        <Copy className="w-4 h-4" />
                      </button>
                      {col.is_public && <span className="flex items-center gap-1 text-xs text-emerald-400"><Globe className="w-3 h-3" /> Public</span>}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-app-muted hidden md:table-cell">{col.created_by_name ?? '—'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(col)} className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(col)} className="p-1.5 rounded text-app-muted hover:text-danger-400 hover:bg-app-hover"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {collections.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-app-muted">No collections yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="rounded-xl border border-app-border bg-dark-800 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-app-border flex items-center justify-between">
              <h3 className="font-bold text-app">{editing ? 'Edit Collection' : 'Create Collection'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-app-muted hover:text-app"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-app mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-app mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full h-20 px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm resize-none focus:outline-none focus:border-primary-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPublic} onChange={e => setForm(p => ({ ...p, isPublic: e.target.checked }))} className="rounded border-app-border" />
                <span className="text-sm text-app">Public (accessible via share link)</span>
              </label>
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
