import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, List, FileText, BookOpen, FolderOpen, Plus, Bot, ArrowLeft } from 'lucide-react';
import { knowledgeAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { onKnowledgeNewDocument, onKnowledgeDocumentUpdated, onKnowledgeRequiredReading } from '@/lib/socket';

import { SearchBar } from '@/components/knowledge/SearchBar';
import { FilterChips } from '@/components/knowledge/FilterChips';
import { RequiredReadingBanner } from '@/components/knowledge/RequiredReadingBanner';
import { DocumentGrid, DocumentGridSkeleton } from '@/components/knowledge/DocumentGrid';
import { DocumentListView } from '@/components/knowledge/DocumentListView';
import { QuickViewModal } from '@/components/knowledge/QuickViewModal';
import { CollectionCard } from '@/components/knowledge/CollectionCard';
import { FlagModal } from '@/components/knowledge/FlagModal';
import { DocumentDetailView } from '@/components/knowledge/DocumentDetailView';
import { RichDocumentEditor, type DocumentEditorData } from '@/components/knowledge/RichDocumentEditor';
import { AIAssistantPanel } from '@/components/knowledge/AIAssistantPanel';
import { DocumentTemplates as DocumentTemplateModal, DOCUMENT_TEMPLATES } from '@/components/knowledge/DocumentTemplates';
import type { KbDocument } from '@/components/knowledge/DocumentCard';

type SubView = 'list' | 'detail' | 'editor' | 'ai-assistant';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  document_count?: number;
}

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_image?: string | null;
  share_token: string;
  document_count?: number;
  created_by_name?: string;
}

interface ListResult {
  docs: KbDocument[];
  total: number;
  page: number;
  limit: number;
}

const VIEW_MODE_KEY = 'kb-view-mode';

/* ── Skeleton for list view ── */
function DocumentListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-app-border overflow-hidden animate-pulse">
      <div className="bg-app-card h-10" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-app-border">
          <div className="w-9 h-9 rounded-lg bg-app-card shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-app-card rounded w-2/3" />
            <div className="h-3 bg-app-card rounded w-1/3" />
          </div>
          <div className="hidden md:block w-20 h-5 bg-app-card rounded" />
          <div className="hidden lg:block w-16 h-4 bg-app-card rounded" />
          <div className="flex gap-1">
            <div className="w-7 h-7 bg-app-card rounded" />
            <div className="w-7 h-7 bg-app-card rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

const KNOWLEDGE_PATH = '/knowledge';

export function KnowledgeView() {
  const { user } = useAuthStore();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();

  // Data
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<KbDocument[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });

  // Sub-view navigation
  const [subView, setSubView] = useState<SubView>('list');
  const [detailDoc, setDetailDoc] = useState<KbDocument | null>(null);
  const [editorInitialContent, setEditorInitialContent] = useState<string>('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Modals
  const [quickViewDoc, setQuickViewDoc] = useState<KbDocument | null>(null);
  const [flagDoc, setFlagDoc] = useState<KbDocument | null>(null);
  const [requiredReadingOpen, setRequiredReadingOpen] = useState(false);

  /* ──── Fetch documents ──── */
  const fetchDocuments = useCallback(async (p = 1) => {
    if (!userId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '20', sort: 'recent' };
      if (search) params.search = search;
      if (activeCategory) params.category = activeCategory;
      if (activeTag) params.tag = activeTag;

      const result = await knowledgeAPI.documents.list(userId, params) as ListResult;
      setDocuments(result.docs);
      setTotal(result.total);
      setPage(p);
    } catch (e) {
      console.error('Failed to load documents:', e);
    }
    setLoading(false);
  }, [userId, search, activeCategory, activeTag]);

  /* ──── Initial loads ──── */
  useEffect(() => { fetchDocuments(1); }, [fetchDocuments]);

  /* ──── Sync URL to document view (e.g. /knowledge/sms-guidebook) ──── */
  useEffect(() => {
    const pathname = location.pathname;
    if (pathname === KNOWLEDGE_PATH || pathname === `${KNOWLEDGE_PATH}/`) {
      setSubView('list');
      setDetailDoc(null);
      return;
    }
    if (pathname.startsWith(`${KNOWLEDGE_PATH}/`)) {
      const slug = pathname.slice(KNOWLEDGE_PATH.length + 1).split('/')[0];
      if (!slug || !userId) return;
      setSubView('detail');
      setDetailDoc(null);
      knowledgeAPI.documents.getBySlug(userId, slug)
        .then((full) => {
          setDetailDoc(full as KbDocument);
        })
        .catch(() => {
          setDetailDoc(null);
          setSubView('list');
          navigate(KNOWLEDGE_PATH);
        });
    }
  }, [location.pathname, userId, navigate]);

  useEffect(() => {
    if (!userId) return;
    knowledgeAPI.categories.list(userId).then(data => setCategories(data as Category[])).catch(() => {});
    knowledgeAPI.collections.list(userId).then(data => setCollections(data as Collection[])).catch(() => {});
    knowledgeAPI.requiredReading(userId).then(data => setRequiredDocs(data as KbDocument[])).catch(() => {});
  }, [userId]);

  /* ──── Socket: auto-refresh on knowledge events ──── */
  useEffect(() => {
    const offNew = onKnowledgeNewDocument(() => { fetchDocuments(1); });
    const offUpdated = onKnowledgeDocumentUpdated(() => { fetchDocuments(page); });
    const offRequired = onKnowledgeRequiredReading(() => {
      if (userId) {
        knowledgeAPI.requiredReading(userId).then(data => setRequiredDocs(data as KbDocument[])).catch(() => {});
      }
    });
    return () => { offNew(); offUpdated(); offRequired(); };
  }, [fetchDocuments, page, userId]);

  /* ──── Handlers ──── */
  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  const handleCategorySelect = (slug: string | null) => {
    setActiveCategory(slug);
    setActiveTag(null);
    setPage(1);
  };

  const handleTagClick = (tagSlug: string) => {
    setActiveTag(tagSlug);
    setActiveCategory(null);
    setPage(1);
  };

  const handleViewDoc = (doc: KbDocument) => {
    navigate(`${KNOWLEDGE_PATH}/${doc.slug}`);
  };

  const handleNewDocument = (templateId?: string) => {
    const template = templateId ? DOCUMENT_TEMPLATES.find(t => t.id === templateId) : null;
    setEditorInitialContent(template?.defaultContent ?? '');
    setTemplateModalOpen(false);
    setSubView('editor');
  };

  const handleSaveDocument = async (data: DocumentEditorData) => {
    if (!userId) return;
    try {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('content', data.content);
      formData.append('description', data.description);
      formData.append('type', data.type || 'wiki');
      if (data.categoryId) formData.append('categoryId', data.categoryId);
      if (data.is_required_reading) formData.append('is_required_reading', 'true');
      if (data.tags?.length) formData.append('tags', JSON.stringify(data.tags));
      if (data.file) formData.append('file', data.file);
      await knowledgeAPI.documents.create(userId, formData);
      toast.success(data.file ? 'File uploaded!' : 'Document saved!');
      setSubView('list');
      fetchDocuments(1);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const handlePin = async (doc: KbDocument) => {
    if (!userId) return;
    // Optimistic update
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, user_pinned: !d.user_pinned } : d));
    try {
      const result = await knowledgeAPI.documents.pin(userId, doc.id);
      toast.success(result.pinned ? 'Document pinned!' : 'Document unpinned');
    } catch {
      // Revert
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, user_pinned: doc.user_pinned } : d));
      toast.error('Failed to update pin');
    }
  };

  const handleDownload = async (doc: KbDocument) => {
    if (!userId) return;
    try {
      const result = await knowledgeAPI.documents.download(userId, doc.id);
      if (result.fileUrl) {
        const origin = (import.meta.env.VITE_API_ORIGIN as string) || window.location.origin;
        const url = result.fileUrl.startsWith('http') ? result.fileUrl : `${origin}${result.fileUrl}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.title;
        a.click();
      }
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    }
  };

  const handleFlag = async (reason: string) => {
    if (!userId || !flagDoc) return;
    try {
      await knowledgeAPI.documents.flag(userId, flagDoc.id, reason);
      toast.success('Flag submitted!');
    } catch {
      toast.error('Failed to submit flag');
    }
  };

  const handleAcknowledge = async (doc: KbDocument) => {
    if (!userId) return;
    try {
      await knowledgeAPI.documents.acknowledge(userId, doc.id);
      toast.success('Acknowledged!');
      setQuickViewDoc(prev => prev ? { ...prev, user_acknowledged: true } : null);
      setRequiredDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      toast.error('Failed to acknowledge');
    }
  };

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const handleLoadMore = () => {
    if (documents.length < total) fetchDocuments(page + 1);
  };

  if (!userId) return null;

  /* ── Sub-views ── */
  if (subView === 'detail' && detailDoc) {
    return (
      <DocumentDetailView
        document={detailDoc}
        onBack={() => {
          setSubView('list');
          setDetailDoc(null);
          navigate(KNOWLEDGE_PATH);
        }}
        onDownload={handleDownload}
        onPin={handlePin}
      />
    );
  }
  if (subView === 'detail' && location.pathname.startsWith(`${KNOWLEDGE_PATH}/`)) {
    return (
      <div className="h-full flex items-center justify-center bg-app-bg">
        <div className="text-app-muted">Loading document…</div>
      </div>
    );
  }

  if (subView === 'editor') {
    return (
      <RichDocumentEditor
        initialDoc={editorInitialContent ? { content: editorInitialContent } : undefined}
        onSave={handleSaveDocument}
        onCancel={() => setSubView('list')}
      />
    );
  }

  if (subView === 'ai-assistant') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b border-app-border flex items-center gap-3">
          <button onClick={() => setSubView('list')} className="p-1.5 rounded-lg hover:bg-app-hover text-app-muted hover:text-app-text transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Bot className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-app-text">AI Assistant</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <AIAssistantPanel />
        </div>
      </div>
    );
  }

  const hasMore = documents.length < total;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-4">
          <DoraInsightBar module="knowledge" />
        </div>
        {/* ──── Hero Section ──── */}
        <div className="px-6 pt-8 pb-6">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen className="w-7 h-7 text-primary-400" />
              <h1 className="text-2xl font-bold text-app">Knowledge Hub</h1>
            </div>
            <p className="text-sm text-app-muted">Find documents, guides, and resources</p>
          </div>

          <SearchBar
            onSearch={handleSearch}
            onSelectDocument={(slug) => {
              if (userId) {
                knowledgeAPI.documents.getBySlug(userId, slug).then(doc => setQuickViewDoc(doc as KbDocument)).catch(() => {});
              }
            }}
          />

          {/* Filter Chips */}
          <div className="mt-5">
            <FilterChips categories={categories} activeSlug={activeCategory} onSelect={handleCategorySelect} />
          </div>

          {/* Active tag indicator */}
          {activeTag && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-app-muted">Filtered by tag:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400 border border-primary-500/30">
                {activeTag}
              </span>
              <button onClick={() => setActiveTag(null)} className="text-xs text-app-muted hover:text-app">Clear</button>
            </div>
          )}
        </div>

        {/* ──── Required Reading Banner ──── */}
        <div className="px-6">
          <RequiredReadingBanner count={requiredDocs.length} onReviewClick={() => setRequiredReadingOpen(true)} />
        </div>

        {/* ──── Action Buttons + View Toggle + Results ──── */}
        <div className="px-6 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-app-muted">
              {loading ? 'Loading...' : `${total} document${total !== 1 ? 's' : ''}`}
              {search && <span> matching "{search}"</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5 text-blue-400 hover:text-blue-300" onClick={() => setSubView('ai-assistant')}>
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI Assistant</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setTemplateModalOpen(true)}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Document</span>
            </Button>
            <div className="w-px h-6 bg-app-border mx-1" />
            <div className="flex gap-1 p-1 bg-app-hover rounded-lg">
              <button onClick={() => handleViewMode('grid')}
                className={cn('p-2 rounded transition-colors', viewMode === 'grid' ? 'bg-primary-500/20 text-app' : 'text-app-muted hover:text-app')}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => handleViewMode('list')}
                className={cn('p-2 rounded transition-colors', viewMode === 'list' ? 'bg-primary-500/20 text-app' : 'text-app-muted hover:text-app')}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ──── Content ──── */}
        <div className="px-6 pb-6">
          {loading ? (
            viewMode === 'grid' ? (
              <DocumentGridSkeleton count={8} />
            ) : (
              <DocumentListSkeleton count={6} />
            )
          ) : documents.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-app-muted">
              <FileText className="w-12 h-12 mb-4 opacity-40" />
              <p className="text-lg font-semibold text-app">
                {search || activeCategory || activeTag ? 'No documents match your search' : 'Your Knowledge Hub is empty'}
              </p>
              <p className="text-sm mt-1">
                {search || activeCategory || activeTag
                  ? 'Try different keywords or browse all documents.'
                  : 'Start by uploading your first document.'}
              </p>
              {(search || activeCategory || activeTag) && (
                <Button variant="ghost" className="mt-4" onClick={() => { setSearch(''); setActiveCategory(null); setActiveTag(null); }}>
                  Browse all documents
                </Button>
              )}
            </div>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <DocumentGrid
                  documents={documents}
                  onView={handleViewDoc}
                  onPin={handlePin}
                  onDownload={handleDownload}
                  onFlag={(doc) => setFlagDoc(doc)}
                  onTagClick={handleTagClick}
                />
              ) : (
                <DocumentListView
                  documents={documents}
                  onView={handleViewDoc}
                  onPin={handlePin}
                  onDownload={handleDownload}
                />
              )}

              {hasMore && (
                <div className="flex justify-center mt-6">
                  <Button variant="ghost" onClick={handleLoadMore}>Load more</Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ──── Collections Section ──── */}
        {collections.length > 0 && !search && !activeCategory && !activeTag && (
          <div className="px-6 pb-8">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-app">Collections</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {collections.map(col => (
                <CollectionCard key={col.id} collection={col} onClick={() => {/* TODO: open collection detail */}} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ──── Modals ──── */}
      <QuickViewModal
        document={quickViewDoc}
        onClose={() => setQuickViewDoc(null)}
        onDownload={handleDownload}
        onPin={handlePin}
        onAcknowledge={handleAcknowledge}
      />

      <FlagModal
        open={!!flagDoc}
        onClose={() => setFlagDoc(null)}
        onSubmit={handleFlag}
        documentTitle={flagDoc?.title ?? ''}
      />

      {/* Template Selection Modal */}
      <DocumentTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={(template) => handleNewDocument(template.id)}
      />

      {/* Required Reading Drawer */}
      {requiredReadingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setRequiredReadingOpen(false)}>
          <div className="rounded-xl border border-app-border bg-app-sidebar w-full max-w-lg max-h-[70vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-app-sidebar border-b border-app-border px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-app">Required Reading</h3>
              <button onClick={() => setRequiredReadingOpen(false)} className="text-app-muted hover:text-app">
                <FileText className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {requiredDocs.length === 0 ? (
                <p className="text-sm text-app-muted text-center py-8">All caught up! No required reading pending.</p>
              ) : (
                requiredDocs.map(doc => (
                  <div key={doc.id} className="p-4 rounded-lg border border-app-border bg-app-card">
                    <h4 className="font-medium text-app text-sm">{doc.title}</h4>
                    <p className="text-xs text-app-muted mt-1">Updated on {new Date(doc.updated_at).toLocaleDateString()}</p>
                    <Button size="sm" className="mt-3 gap-2" onClick={() => { setRequiredReadingOpen(false); handleViewDoc(doc); }}>
                      Review & Acknowledge
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
