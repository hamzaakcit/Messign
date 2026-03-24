import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, Clock, Upload, X, FileText, Loader2 } from 'lucide-react';
import { khDocumentsAPI, khUploadAPI } from '@/lib/knowledge-hub/api';
import type { DocumentType, DocumentStatus } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';
import { useKnowledgeHubStore } from '@/stores/knowledgeHubStore';
import { toast } from 'sonner';

export interface DocumentAttachment {
  url: string;
  fileName: string;
  fileSize?: number;
}

export function DocumentEditPage({ docId }: { docId?: string }) {
  const navigate = useNavigate();
  const { categories, tags } = useKnowledgeHubStore();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<unknown>({ type: 'doc', content: [{ type: 'paragraph' }] });
  const [plainText, setPlainText] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('guide');
  const [categoryId, setCategoryId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [coverImage, setCoverImage] = useState('');
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [coverUploading, setCoverUploading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!docId);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (docId) {
      khDocumentsAPI.getById(docId).then(doc => {
        setTitle(doc.title);
        setContent(doc.content);
        setPlainText(doc.plain_text ?? '');
        setExcerpt(doc.excerpt ?? '');
        setDocumentType(doc.document_type);
        setCategoryId(doc.category_id ?? '');
        setSelectedTags(doc.tags.map(t => t.id));
        setIsPublic(doc.is_public);
        setIsPinned(doc.is_pinned);
        setIsFeatured(doc.is_featured);
        setCoverImage(doc.cover_image ?? '');
        setMetadata((doc.metadata as Record<string, unknown>) ?? {});
        const meta = (doc.metadata as { attachments?: DocumentAttachment[] }) ?? {};
        setAttachments(Array.isArray(meta.attachments) ? meta.attachments : []);
      }).catch(() => navigate('/knowledge-hub')).finally(() => setLoading(false));
    }
  }, [docId, navigate]);

  const handleSave = useCallback(async (status?: DocumentStatus) => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        title, content, plainText, excerpt, documentType,
        categoryId: categoryId || undefined,
        tagIds: selectedTags,
        isPublic, isPinned, isFeatured,
        coverImage: coverImage || undefined,
        metadata: { ...metadata, attachments },
        ...(status ? { status } : {}),
      };
      if (docId) {
        await khDocumentsAPI.update(docId, data);
        toast.success('Document saved');
      } else {
        const newDoc = await khDocumentsAPI.create({ ...data, status: status || 'draft' });
        toast.success('Document created');
        navigate(`/knowledge-hub/documents/${newDoc.id}/edit`, { replace: true });
      }
      setLastSaved(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [title, content, plainText, excerpt, documentType, categoryId, selectedTags, isPublic, isPinned, isFeatured, coverImage, metadata, attachments, docId, navigate]);

  // Auto-save every 30s for existing documents
  useEffect(() => {
    if (!docId) return;
    autoSaveTimerRef.current = setInterval(() => {
      handleSave();
    }, 30000);
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); };
  }, [docId, handleSave]);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (e.g. JPG, PNG)');
      return;
    }
    setCoverUploading(true);
    try {
      const result = await khUploadAPI.uploadCover(file);
      setCoverImage(result.url);
      toast.success('Cover image uploaded');
      if (coverInputRef.current) coverInputRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload cover');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const result = await khUploadAPI.uploadFile(file, docId);
      setAttachments(prev => [...prev, { url: result.url, fileName: result.fileName, fileSize: result.fileSize }]);
      toast.success(`"${result.fileName}" added`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setFileUploading(false);
    }
  };

  const removeAttachment = (url: string) => {
    setAttachments(prev => prev.filter(a => a.url !== url));
  };

  if (loading) return <div className="flex items-center justify-center h-full text-app-muted">Loading...</div>;

  return (
    <div className="flex h-full min-h-0">
      {/* Editor area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-sidebar">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-app-muted">{docId ? 'Edit Document' : 'New Document'}</span>
            {lastSaved && <span className="text-xs text-gray-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Saved {lastSaved.toLocaleTimeString()}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleSave()} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-app-card text-app-muted hover:bg-app-hover disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button onClick={() => handleSave('in_review')} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50">
              <Send className="w-4 h-4" /> Submit for Review
            </button>
          </div>
        </div>

        {/* Title + Content */}
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
          {coverImage && (
            <div className="relative mb-4 rounded-xl overflow-hidden">
              <img src={coverImage} className="w-full h-48 object-cover" alt="Cover" />
              <button onClick={() => setCoverImage('')} className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-app-text hover:bg-black/70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title..."
            className="w-full text-2xl font-bold text-app-text bg-transparent border-none outline-none placeholder-gray-600 mb-4"
          />
          <textarea
            ref={editorRef}
            value={plainText}
            onChange={(e) => {
              setPlainText(e.target.value);
              setContent({ type: 'doc', content: e.target.value.split('\n\n').map(p => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })) });
            }}
            placeholder="Start writing..."
            className="w-full min-h-[400px] text-app-muted bg-transparent border-none outline-none resize-none placeholder-gray-600 text-sm leading-relaxed"
          />
        </div>
      </div>

      {/* Metadata sidebar */}
      <div className="w-72 border-l border-app-border bg-app-sidebar overflow-y-auto p-4 space-y-5 hidden lg:block">
        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Document Type</label>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)} className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
            {Object.entries(DOCUMENT_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
            <option value="">No category</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTags.map(tid => {
              const tag = tags.find(t => t.id === tid);
              return tag ? (
                <span key={tid} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-app-hover text-app-muted">
                  {tag.name}
                  <button onClick={() => setSelectedTags(prev => prev.filter(t => t !== tid))} className="hover:text-app-text"><X className="w-3 h-3" /></button>
                </span>
              ) : null;
            })}
          </div>
          <select value="" onChange={(e) => { if (e.target.value && !selectedTags.includes(e.target.value)) setSelectedTags(prev => [...prev, e.target.value]); }} className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
            <option value="">Add tag...</option>
            {tags.filter(t => !selectedTags.includes(t.id)).map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Excerpt</label>
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text resize-none h-20" placeholder="Short summary..." />
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Cover Image</label>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            className="hidden"
            disabled={coverUploading}
          />
          {coverImage ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-app-muted truncate flex-1">Cover set</span>
              <button
                type="button"
                onClick={() => setCoverImage('')}
                className="p-1 rounded text-app-muted hover:text-app-text hover:bg-app-hover"
                title="Remove cover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-app-border text-sm text-app-muted hover:border-app-border hover:text-app-muted disabled:opacity-50"
            >
              {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {coverUploading ? 'Uploading…' : 'Choose image'}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1.5">Attachments</label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileAttach}
            className="hidden"
            disabled={fileUploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={fileUploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-app-border text-sm text-app-muted hover:border-app-border hover:text-app-muted disabled:opacity-50"
          >
            {fileUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {fileUploading ? 'Uploading…' : 'Add file'}
          </button>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.url} className="flex items-center gap-2 px-2 py-1.5 rounded bg-app-card text-xs">
                  <FileText className="w-3.5 h-3.5 text-app-muted shrink-0" />
                  <span className="truncate flex-1 text-app-muted">{a.fileName}</span>
                  <button type="button" onClick={() => removeAttachment(a.url)} className="p-0.5 rounded text-app-muted hover:text-app-text hover:bg-app-hover" title="Remove">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-app-muted cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded bg-app-card border-app-border" />
            Public
          </label>
          <label className="flex items-center gap-2 text-sm text-app-muted cursor-pointer">
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="rounded bg-app-card border-app-border" />
            Pinned
          </label>
          <label className="flex items-center gap-2 text-sm text-app-muted cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded bg-app-card border-app-border" />
            Featured
          </label>
        </div>
      </div>
    </div>
  );
}
