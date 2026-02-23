import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Plus, BookOpen, Bot, Bookmark } from 'lucide-react';
import { khSearchAPI } from '@/lib/knowledge-hub/api';
import { useKnowledgeHubStore } from '@/stores/knowledgeHubStore';
import { cn } from '@/lib/utils';

export function KnowledgeCommandPalette() {
  const navigate = useNavigate();
  const { commandPaletteOpen, toggleCommandPalette } = useKnowledgeHubStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; title: string; slug: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleCommandPalette]);

  useEffect(() => {
    if (commandPaletteOpen) {
      inputRef.current?.focus();
      const stored = localStorage.getItem('kh-recent-searches');
      if (stored) setRecentSearches(JSON.parse(stored));
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [commandPaletteOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    try {
      const suggestions = await khSearchAPI.suggestions(q);
      setResults(suggestions);
      setSelectedIndex(0);
    } catch { setResults([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const quickActions = [
    { label: 'New Document', icon: Plus, action: () => navigate('/knowledge-hub/documents/new') },
    { label: 'AI Assistant', icon: Bot, action: () => navigate('/knowledge-hub/ai-assistant') },
    { label: 'Bookmarks', icon: Bookmark, action: () => navigate('/knowledge-hub/bookmarks') },
    { label: 'All Documents', icon: BookOpen, action: () => navigate('/knowledge-hub/documents') },
  ];

  const allItems = [
    ...results.map(r => ({ type: 'doc' as const, ...r })),
    ...(query.length < 2 ? quickActions.map((a, i) => ({ type: 'action' as const, id: `action-${i}`, ...a })) : []),
  ];

  const handleSelect = (index: number) => {
    const item = allItems[index];
    if (!item) return;
    if (item.type === 'doc') {
      if (query) {
        const recent = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
        setRecentSearches(recent);
        localStorage.setItem('kh-recent-searches', JSON.stringify(recent));
      }
      navigate(`/knowledge-hub/documents/${(item as { slug: string }).slug}`);
    } else {
      (item as { action: () => void }).action();
    }
    toggleCommandPalette();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { handleSelect(selectedIndex); }
    if (e.key === 'Escape') { toggleCommandPalette(); }
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => toggleCommandPalette()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents, or type a command..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
          />
          <kbd className="text-xs text-gray-500 bg-dark-600 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {allItems.length > 0 ? (
            allItems.map((item, i) => {
              const Icon = item.type === 'doc' ? FileText : (item as { icon: React.ElementType }).icon;
              return (
              <button
                key={item.id}
                onClick={() => handleSelect(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors', i === selectedIndex ? 'bg-dark-700 text-white' : 'text-gray-400 hover:bg-dark-700/50')}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{item.type === 'doc' ? (item as { title: string }).title : (item as { label: string }).label}</span>
                {item.type === 'doc' && <span className="ml-auto text-xs text-gray-600">Document</span>}
              </button>
            );
            })
          ) : query.length >= 2 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No results found</div>
          ) : recentSearches.length > 0 ? (
            <>
              <p className="px-4 py-1 text-xs text-gray-600 font-medium">Recent Searches</p>
              {recentSearches.map(s => (
                <button key={s} onClick={() => setQuery(s)} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:bg-dark-700/50">
                  <Search className="w-3.5 h-3.5" />
                  <span>{s}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
