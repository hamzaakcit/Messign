import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, FileText, X } from 'lucide-react';
import { khSearchAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';
import { stripHtmlForPreview } from '@/lib/knowledge-hub/stripHtml';

export function SearchResultsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const tagFilter = searchParams.get('tag') ?? '';
  const [inputValue, setInputValue] = useState(query);
  const [docs, setDocs] = useState<KhDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; title: string; slug: string }[]>([]);

  const doSearch = useCallback(async (q: string, tag?: string) => {
    if (!q && !tag) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (tag) params.tag = tag;
      const result = await khSearchAPI.search(params);
      setDocs(result.docs);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch(query, tagFilter);
  }, [query, tagFilter, doSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() });
    }
  };

  const handleInputChange = async (value: string) => {
    setInputValue(value);
    if (value.length >= 2) {
      try {
        const s = await khSearchAPI.suggestions(value);
        setSuggestions(s);
      } catch { setSuggestions([]); }
    } else {
      setSuggestions([]);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <form onSubmit={handleSearch} className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-app-muted" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search knowledge base..."
          className="w-full pl-12 pr-4 py-3 rounded-xl bg-app-sidebar border border-app-border text-app-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
          autoFocus
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-app-sidebar border border-app-border rounded-xl shadow-xl z-10 overflow-hidden">
            {suggestions.map(s => (
              <button key={s.id} onClick={() => { navigate(`/knowledge-hub/documents/${s.slug}`); setSuggestions([]); }} className="w-full text-left px-4 py-2.5 text-sm text-app-muted hover:bg-app-hover hover:text-app-text flex items-center gap-2">
                <FileText className="w-4 h-4 text-app-muted" />
                {s.title}
              </button>
            ))}
          </div>
        )}
      </form>

      {(query || tagFilter) && (
        <div className="flex items-center gap-2 mb-4 text-sm text-app-muted">
          {total} results {query && <>for "<span className="text-app-text">{query}</span>"</>}
          {tagFilter && <span className="px-2 py-0.5 rounded-full bg-app-card text-app-muted flex items-center gap-1">tag: {tagFilter} <button onClick={() => setSearchParams({})}><X className="w-3 h-3" /></button></span>}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-app-muted">Searching...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-app-muted">
          <Search className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No results found</p>
          <p className="text-sm mt-1">Try different keywords or browse categories</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
            return (
              <button key={doc.id} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} className="text-left w-full p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: typeMeta?.color + '20', color: typeMeta?.color }}>{typeMeta?.label}</span>
                  {doc.category_name && <span className="text-xs text-app-muted">{doc.category_name}</span>}
                </div>
                <h3 className="text-base font-medium text-app-text group-hover:text-primary-400 mb-1">{doc.title}</h3>
                <p className="text-sm text-app-muted line-clamp-2">{stripHtmlForPreview(doc.excerpt || doc.plain_text, 200)}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-app-muted">
                  <span>{doc.author_name}</span>
                  <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
                  <span>{doc.view_count} views</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
