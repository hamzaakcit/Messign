import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  FileText,
  BookOpen,
  MessageSquare,
  BarChart3,
  Settings,
  Brain,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { knowledgeAPI } from '@/lib/api';

interface SearchDoc {
  id: string;
  title: string;
  slug: string;
  description?: string;
}

interface PaletteItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: string;
  action: string;
}

const STATIC_PAGES: PaletteItem[] = [
  { id: 'page-dora', label: 'Dora (AI Assistant)', icon: Brain, group: 'Pages', action: '/dora' },
  { id: 'page-knowledge', label: 'Knowledge Hub', icon: BookOpen, group: 'Pages', action: '/knowledge' },
  { id: 'page-dashboard', label: 'Dashboard', icon: BarChart3, group: 'Pages', action: '/dashboard' },
  { id: 'page-chat', label: 'Chat', icon: MessageSquare, group: 'Pages', action: '/chat' },
  { id: 'page-settings', label: 'Settings', icon: Settings, group: 'Pages', action: '/settings' },
];

interface CommandPaletteOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: string) => void;
}

export function CommandPaletteOverlay({
  open,
  onClose,
  onSelect,
}: CommandPaletteOverlayProps) {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchDoc[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || !userId) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await knowledgeAPI.search(userId, { q });
        const data = (res as { data?: { documents?: SearchDoc[] } }).data;
        setResults(data?.documents ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const filteredPages = STATIC_PAGES.filter((p) =>
    p.label.toLowerCase().includes(query.toLowerCase()),
  );

  const allItems: Array<{ id: string; label: string; icon: React.ElementType; group: string; action: string; description?: string }> = [
    ...results.map((r) => ({
      id: r.id,
      label: r.title,
      icon: FileText,
      group: 'Documents',
      action: `/knowledge/${r.slug}`,
      description: r.description,
    })),
    ...filteredPages,
  ];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[selectedIndex];
      if (item) {
        onSelect(item.action);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const groups = allItems.reduce<Record<string, typeof allItems>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl mx-4 rounded-2xl border border-app-border bg-app-sidebar shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-app-border">
          <Search className="w-5 h-5 text-app-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or type a command..."
            className="flex-1 bg-transparent text-base text-app-text placeholder:text-gray-600 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-app-hover text-app-muted hover:text-app-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {isSearching && (
            <div className="px-5 py-6 text-center text-sm text-app-muted">
              Searching...
            </div>
          )}

          {!isSearching && allItems.length === 0 && query && (
            <div className="px-5 py-6 text-center text-sm text-app-muted">
              No results
            </div>
          )}

          {!isSearching &&
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="px-5 py-1.5 text-[11px] font-semibold text-app-muted uppercase tracking-wider">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = flatIndex++;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelect(item.action);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors',
                        idx === selectedIndex
                          ? 'bg-primary-500/10 text-app-text'
                          : 'text-app-muted hover:bg-app-hover hover:text-app-text',
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.label}
                        </p>
                        {item.description && (
                          <p className="text-xs text-app-muted truncate">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

          {!isSearching && !query && (
            <div className="px-5 py-6 text-center text-sm text-app-muted">
              Start typing to search
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-app-border flex items-center gap-4 text-[11px] text-gray-600">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-app-card text-app-muted font-mono">
              ↑↓
            </kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-app-card text-app-muted font-mono">
              ↵
            </kbd>{' '}
            select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-app-card text-app-muted font-mono">
              esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
