import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileText, FolderOpen, Clock } from 'lucide-react';
import { knowledgeAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface SearchResult {
  docs: Array<{ id: string; title: string; slug: string; description: string; category_name?: string }>;
  total: number;
}

interface Props {
  onSearch: (query: string) => void;
  onSelectDocument?: (slug: string) => void;
}

const RECENT_KEY = 'kb-recent-searches';

function getRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

function saveRecentSearch(q: string) {
  const recent = getRecentSearches().filter(s => s !== q);
  recent.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
}

export function SearchBar({ onSearch, onSelectDocument }: Props) {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setFocused(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !user?.id) { setResults(null); return; }
    setSearching(true);
    try {
      const data = await knowledgeAPI.search(user.id, { q, limit: '8' }) as SearchResult;
      setResults(data);
    } catch { setResults(null); }
    setSearching(false);
  }, [user?.id]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query.trim());
      onSearch(query.trim());
      setFocused(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    onSearch('');
    inputRef.current?.focus();
  };

  const recentSearches = getRecentSearches();
  const showDropdown = focused && (results?.docs?.length || (!query && recentSearches.length));

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
          focused
            ? 'border-primary-500 bg-app-card shadow-lg shadow-primary-500/10'
            : 'border-app-border bg-app-sidebar hover:border-app-border-hover'
        )}>
          <Search className="w-5 h-5 text-app-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Search documents, tags, topics...  ⌘K"
            className="flex-1 bg-transparent text-app placeholder:text-app-muted outline-none text-sm"
          />
          {query && (
            <button type="button" onClick={handleClear} className="text-app-muted hover:text-app">
              <X className="w-4 h-4" />
            </button>
          )}
          {searching && <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-app-border bg-app-sidebar shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {!query && recentSearches.length > 0 && (
            <div className="p-3">
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent searches
              </p>
              {recentSearches.map(s => (
                <button key={s} onClick={() => { setQuery(s); handleChange(s); onSearch(s); }}
                  className="block w-full text-left px-3 py-1.5 text-sm text-app hover:bg-app-hover rounded transition-colors truncate">
                  {s}
                </button>
              ))}
            </div>
          )}
          {results?.docs && results.docs.length > 0 && (
            <div className="p-3">
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Documents ({results.total})
              </p>
              {results.docs.map(doc => (
                <button key={doc.id}
                  onClick={() => { setFocused(false); onSelectDocument?.(doc.slug); }}
                  className="block w-full text-left px-3 py-2 hover:bg-app-hover rounded transition-colors">
                  <p className="text-sm font-medium text-app truncate">{doc.title}</p>
                  {doc.category_name && (
                    <p className="text-xs text-app-muted flex items-center gap-1 mt-0.5">
                      <FolderOpen className="w-3 h-3" /> {doc.category_name}
                    </p>
                  )}
                </button>
              ))}
              {results.total > results.docs.length && (
                <button onClick={handleSubmit}
                  className="block w-full text-center text-xs text-primary-400 hover:text-primary-300 py-2">
                  View all {results.total} results
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
