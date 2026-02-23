import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { adminKnowledgeAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { toast } from 'sonner';
import {
  Plus, Search, FileText, Edit, Trash2, RotateCcw,
  Upload, X, Image, Film, Presentation, File as FileIcon,
  Pin, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KbDocument } from '@/components/knowledge/DocumentCard';

interface Category { id: string; name: string; slug: string; color?: string | null; }
interface Tag { id: string; name: string; slug: string; }

interface ListResult {
  docs: KbDocument[];
  total: number;
  page: number;
  limit: number;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, pptx: Presentation, docx: FileText, image: Image, video: Film, wiki: FileText, file: FileIcon,
};

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeDocumentsAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KbDocument | null>(null);
  const [form, setForm] = useState({ title: '', description: '', content: '', categoryId: '', status: 'published', isRequiredReading: false, requiredForRoles: '' as string, isPinned: false, pinOrder: '', tagIds: [] as string[] });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '50' };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const result = await adminKnowledgeAPI.documents.list(userId, params) as ListResult;
      setDocuments(result.docs);
      setTotal(result.total);
      setPage(p);
    } catch (e) {
      console.error('Failed to load documents:', e);
      toast.error('Failed to load documents');
    }
    setLoading(false);
  }, [userId, search, statusFilter]);

  useEffect(() => { fetchDocs(1); }, [fetchDocs]);
  useEffect(() => {
    adminKnowledgeAPI.categories.list(userId).then(d => setCategories(d as Category[])).catch(() => {});
    adminKnowledgeAPI.tags.list(userId).then(d => setTags(d as Tag[])).catch(() => {});
  }, [userId]);

  const openCreate = () => {
    setEditingDoc(null);
    setForm({ title: '', description: '', content: '', categoryId: '', status: 'published', isRequiredReading: false, requiredForRoles: '', isPinned: false, pinOrder: '', tagIds: [] });
    setFile(null);
    setModalOpen(true);
  };

  const openEdit = (doc: KbDocument) => {
    setEditingDoc(doc);
    const docTags = doc.tags.map(t => typeof t === 'string' ? t : t.id);
    const docWithMeta = doc as KbDocument & { category_id?: string; pin_order?: number };
    setForm({
      title: doc.title, description: doc.description, content: doc.content ?? '',
      categoryId: docWithMeta.category_id ?? '', status: doc.status,
      isRequiredReading: doc.is_required_reading, requiredForRoles: '',
      isPinned: doc.is_pinned, pinOrder: docWithMeta.pin_order?.toString() ?? '',
      tagIds: docTags,
    });
    setFile(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('content', form.content);
      if (form.categoryId) fd.append('categoryId', form.categoryId);
      fd.append('status', form.status);
      fd.append('isRequiredReading', String(form.isRequiredReading));
      if (form.requiredForRoles) fd.append('requiredForRoles', JSON.stringify(form.requiredForRoles.split(',').map(s => s.trim()).filter(Boolean)));
      fd.append('isPinned', String(form.isPinned));
      if (form.pinOrder) fd.append('pinOrder', form.pinOrder);
      if (form.tagIds.length) fd.append('tagIds', JSON.stringify(form.tagIds));
      if (file) fd.append('file', file);

      if (editingDoc) {
        await adminKnowledgeAPI.documents.update(userId, editingDoc.id, fd);
        toast.success('Document updated');
      } else {
        await adminKnowledgeAPI.documents.create(userId, fd);
        toast.success('Document created');
      }
      setModalOpen(false);
      fetchDocs(page);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (doc: KbDocument) => {
    if (!confirm(`Archive "${doc.title}"?`)) return;
    try {
      await adminKnowledgeAPI.documents.delete(userId, doc.id);
      toast.success('Document archived');
      fetchDocs(page);
    } catch { toast.error('Failed to archive'); }
  };

  const handleRestore = async (doc: KbDocument) => {
    try {
      await adminKnowledgeAPI.documents.restore(userId, doc.id);
      toast.success('Document restored');
      fetchDocs(page);
    } catch { toast.error('Failed to restore'); }
  };

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-app">Knowledge Hub — Documents</h1>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Upload Document</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-app-border bg-dark-800 text-app text-sm placeholder:text-app-muted focus:outline-none focus:border-primary-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="input-theme py-2 w-36">
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-12 text-center text-app-muted">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-dark-800 p-12 text-center text-app-muted">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No documents found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-app-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-700 text-app-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Document</th>
                <th className="text-left py-3 px-3 hidden md:table-cell">Category</th>
                <th className="text-left py-3 px-3 hidden lg:table-cell">Status</th>
                <th className="text-center py-3 px-3 hidden lg:table-cell">Required</th>
                <th className="text-right py-3 px-3 hidden md:table-cell">Views</th>
                <th className="text-right py-3 px-3 hidden md:table-cell">Downloads</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => {
                const IconComp = FILE_ICONS[doc.file_type ?? doc.type] ?? FileText;
                return (
                  <tr key={doc.id} className="border-t border-app-border hover:bg-dark-700/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0">
                          <IconComp className="w-4 h-4 text-primary-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-app truncate">{doc.title}</span>
                            {doc.is_pinned && <Pin className="w-3 h-3 text-primary-400 shrink-0" fill="currentColor" />}
                          </div>
                          <p className="text-xs text-app-muted">v{doc.version} · {doc.file_type?.toUpperCase() ?? doc.type} {doc.file_size_bytes ? `· ${formatSize(doc.file_size_bytes)}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded-full border border-app-border text-app-muted"
                        style={doc.category_color ? { borderColor: doc.category_color + '40', color: doc.category_color } : undefined}>
                        {doc.category_name ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium uppercase',
                        doc.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' :
                        doc.status === 'draft' ? 'bg-gray-500/20 text-gray-400' :
                        'bg-amber-500/20 text-amber-400'
                      )}>{doc.status}</span>
                    </td>
                    <td className="py-3 px-3 text-center hidden lg:table-cell">
                      {doc.is_required_reading ? <CheckCircle className="w-4 h-4 text-amber-400 mx-auto" /> : <span className="text-app-muted">—</span>}
                    </td>
                    <td className="py-3 px-3 text-right text-app-muted hidden md:table-cell">{doc.views}</td>
                    <td className="py-3 px-3 text-right text-app-muted hidden md:table-cell">{doc.download_count}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(doc)} className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        {doc.status === 'archived' ? (
                          <button onClick={() => handleRestore(doc)} className="p-1.5 rounded text-app-muted hover:text-emerald-400 hover:bg-app-hover" title="Restore">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => handleDelete(doc)} className="p-1.5 rounded text-app-muted hover:text-danger-400 hover:bg-app-hover" title="Archive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="ghost" disabled={page <= 1} onClick={() => fetchDocs(page - 1)}>Previous</Button>
          <span className="text-sm text-app-muted py-2">Page {page}</span>
          <Button variant="ghost" disabled={documents.length < 50} onClick={() => fetchDocs(page + 1)}>Next</Button>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="rounded-xl border border-app-border bg-dark-800 w-full max-w-2xl max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-dark-800 border-b border-app-border px-6 py-4 flex items-center justify-between z-10">
              <h3 className="font-bold text-app text-lg">{editingDoc ? 'Edit Document' : 'Upload Document'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-app-muted hover:text-app"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-app mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm focus:outline-none focus:border-primary-500" />
              </div>
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-app mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full h-20 px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm resize-none focus:outline-none focus:border-primary-500" />
              </div>
              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-app mb-1">Content (rich text / markdown)</label>
                <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                  className="w-full h-32 px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm font-mono resize-y focus:outline-none focus:border-primary-500" />
              </div>
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-app mb-1">File</label>
                <div className="border-2 border-dashed border-app-border rounded-lg p-6 text-center hover:border-primary-500/50 transition-colors">
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-primary-400" />
                      <span className="text-sm text-app">{file.name}</span>
                      <button onClick={() => setFile(null)} className="text-app-muted hover:text-danger-400"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 text-app-muted mx-auto mb-2" />
                      <p className="text-sm text-app-muted">Click or drag to upload (max 50MB)</p>
                      <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </div>
              </div>
              {/* Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app mb-1">Category</label>
                  <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                    className="input-theme w-full py-2">
                    <option value="">None</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-app mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="input-theme w-full py-2">
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-app mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tagIds.map(tid => {
                    const tag = tags.find(t => t.id === tid);
                    return tag ? (
                      <span key={tid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-primary-500/20 text-primary-400">
                        {tag.name}
                        <button onClick={() => setForm(p => ({ ...p, tagIds: p.tagIds.filter(id => id !== tid) }))}><X className="w-3 h-3" /></button>
                      </span>
                    ) : null;
                  })}
                </div>
                <select onChange={e => { if (e.target.value && !form.tagIds.includes(e.target.value)) setForm(p => ({ ...p, tagIds: [...p.tagIds, e.target.value] })); e.target.value = ''; }}
                  className="input-theme w-full py-2">
                  <option value="">Add tag...</option>
                  {tags.filter(t => !form.tagIds.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {/* Toggles */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isRequiredReading} onChange={e => setForm(p => ({ ...p, isRequiredReading: e.target.checked }))}
                    className="rounded border-app-border" />
                  <span className="text-sm text-app">Required Reading</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isPinned} onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))}
                    className="rounded border-app-border" />
                  <span className="text-sm text-app">Pin to Hub</span>
                </label>
              </div>
              {form.isPinned && (
                <div>
                  <label className="block text-sm font-medium text-app mb-1">Pin Order</label>
                  <input type="number" value={form.pinOrder} onChange={e => setForm(p => ({ ...p, pinOrder: e.target.value }))}
                    className="w-24 px-3 py-2 rounded-lg border border-app-border bg-dark-700 text-app text-sm focus:outline-none focus:border-primary-500" />
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-dark-800 border-t border-app-border px-6 py-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingDoc ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
