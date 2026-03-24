import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, List, FileText, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { khDocumentsAPI } from '@/lib/knowledge-hub/api';
import { useKnowledgeHubStore } from '@/stores/knowledgeHubStore';
import type { KhDocument, DocumentType, DocumentStatus } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META, STATUS_META } from '@/types/knowledge-hub';
import { cn } from '@/lib/utils';
import { stripHtmlForPreview } from '@/lib/knowledge-hub/stripHtml';

export function AllDocumentsPage() {
  const { filters, setFilters } = useKnowledgeHubStore();
  const [docs, setDocs] = useState<KhDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const limit = 20;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit), sort: filters.sort };
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.tag) params.tag = filters.tag;
      if (filters.type) params.type = filters.type;
      // Pass status: 'all' when "All Statuses" selected; otherwise backend defaults to published+in_review
      if (filters.status) params.status = filters.status;
      else params.status = 'all';
      const result = await khDocumentsAPI.list(params);
      setDocs(result.docs);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
      setDocs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const totalPages = Math.ceil(total / limit);

  const activeFilterCount = [filters.category, filters.tag, filters.type, filters.status].filter(Boolean).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-app-text">All Documents</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors', showFilters ? 'bg-primary-500/20 text-primary-400' : 'bg-app-card text-gray-300 hover:bg-app-hover')}>
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-primary-500 text-app-text text-xs flex items-center justify-center">{activeFilterCount}</span>}
          </button>
          <div className="flex rounded-lg overflow-hidden border border-app-border">
            <button onClick={() => setViewMode('grid')} className={cn('p-1.5', viewMode === 'grid' ? 'bg-app-hover text-app-text' : 'text-app-muted hover:text-gray-300')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('p-1.5', viewMode === 'list' ? 'bg-app-hover text-app-text' : 'text-app-muted hover:text-gray-300')}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-6 p-4 rounded-xl bg-app-sidebar border border-app-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Filter Documents</span>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilters({ category: '', tag: '', type: '' as DocumentType, status: '' as DocumentStatus }); }} className="text-xs text-primary-400 hover:text-primary-300">Clear all</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={filters.type} onChange={(e) => setFilters({ type: e.target.value as DocumentType })} className="px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
              <option value="">All Types</option>
              {Object.entries(DOCUMENT_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value as DocumentStatus })} className="px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
              <option value="">All Statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as 'recent' | 'popular' | 'alphabetical' | 'oldest' })} className="px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text">
              <option value="recent">Most Recent</option>
              <option value="popular">Most Popular</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="oldest">Oldest First</option>
            </select>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              placeholder="Search..."
              className="px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text placeholder-gray-500"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-app-muted">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-app-muted">
          <FileText className="w-12 h-12 mb-3 text-gray-600" />
          <p className="text-lg">No documents found</p>
          <p className="text-sm mt-1">Try adjusting your filters or create a new document</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => {
            const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
            const statusMeta = STATUS_META[doc.status];
            const docPath = `/knowledge-hub/documents/${doc.slug || doc.id}`;
            return (
              <Link key={doc.id} to={docPath} className="text-left p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group block">
                {doc.cover_image && <img src={doc.cover_image} className="w-full h-32 object-cover rounded-lg mb-3" alt="" loading="lazy" />}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: typeMeta?.color + '20', color: typeMeta?.color }}>{typeMeta?.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusMeta?.color + '20', color: statusMeta?.color }}>{statusMeta?.label}</span>
                </div>
                <h3 className="text-sm font-medium text-app-text group-hover:text-primary-400 mb-1 truncate">{doc.title}</h3>
                <p className="text-xs text-app-muted line-clamp-2 mb-3">{stripHtmlForPreview(doc.excerpt || doc.plain_text, 100)}</p>
                <div className="flex items-center gap-2 text-xs text-app-muted">
                  <span>{doc.author_name}</span>
                  <span>·</span>
                  <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
                </div>
                {doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {doc.tags.slice(0, 3).map(tag => (
                      <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded bg-app-card text-app-muted">{tag.name}</span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
            const docPath = `/knowledge-hub/documents/${doc.slug || doc.id}`;
            return (
              <Link key={doc.id} to={docPath} className="text-left w-full flex items-center gap-4 p-3 rounded-lg bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeMeta?.color + '20' }}>
                  <FileText className="w-4 h-4" style={{ color: typeMeta?.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-app-text group-hover:text-primary-400 truncate">{doc.title}</h3>
                  <p className="text-xs text-app-muted truncate">{doc.author_name} · {new Date(doc.updated_at).toLocaleDateString()}</p>
                </div>
                <span className="text-xs text-app-muted">{doc.view_count} views</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg bg-app-sidebar text-app-muted hover:bg-app-hover disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-app-muted">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg bg-app-sidebar text-app-muted hover:bg-app-hover disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
