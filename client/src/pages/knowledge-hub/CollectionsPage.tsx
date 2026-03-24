import { useEffect, useState } from 'react';
import { Library, Plus, FileText, Trash2 } from 'lucide-react';
import { khCollectionsAPI } from '@/lib/knowledge-hub/api';
import type { KhCollection } from '@/types/knowledge-hub';
import { toast } from 'sonner';

export function CollectionsPage() {
  const [collections, setCollections] = useState<KhCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const fetchCollections = () => {
    khCollectionsAPI.list().then(setCollections).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchCollections(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await khCollectionsAPI.create({ name: newName, description: newDesc || undefined });
      toast.success('Collection created');
      setShowNew(false);
      setNewName('');
      setNewDesc('');
      fetchCollections();
    } catch { toast.error('Failed to create collection'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this collection?')) return;
    try {
      await khCollectionsAPI.delete(id);
      toast.success('Collection deleted');
      fetchCollections();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-app-text flex items-center gap-2"><Library className="w-5 h-5 text-purple-400" /> Collections</h1>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text hover:bg-primary-600">
          <Plus className="w-4 h-4" /> New Collection
        </button>
      </div>

      {showNew && (
        <div className="mb-6 p-4 rounded-xl bg-app-sidebar border border-app-border space-y-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Collection name..." className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text placeholder-gray-500" autoFocus />
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)..." className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text placeholder-gray-500 resize-none h-16" />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text hover:bg-primary-600">Create</button>
            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg text-sm bg-app-card text-gray-300 hover:bg-app-hover">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-app-muted">Loading...</div>
      ) : collections.length === 0 ? (
        <div className="text-center py-20 text-app-muted">
          <Library className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No collections yet</p>
          <p className="text-sm mt-1">Create collections to organize documents</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {collections.map(col => (
            <div key={col.id} className="p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/30 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-app-text">{col.name}</h3>
                  {col.description && <p className="text-xs text-app-muted mt-0.5">{col.description}</p>}
                </div>
                <button onClick={() => handleDelete(col.id)} className="p-1.5 rounded text-app-muted hover:text-red-400 hover:bg-app-hover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-app-muted">
                <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {col.document_count ?? 0} documents</span>
                <span>{new Date(col.updated_at).toLocaleDateString()}</span>
                {col.is_shared && <span className="text-primary-400">Shared</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
