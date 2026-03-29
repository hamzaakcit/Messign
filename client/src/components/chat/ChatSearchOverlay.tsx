import { useEffect, useRef, useState } from 'react';
import { useChatStore, type UniversalSearchTab } from '@/stores/chatStore';
import { Search, X, Loader2, ListChecks, FileText, User, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Full-screen modal for channel / universal message search so the main chat column
 * stays fixed-height with only the transcript scrolling.
 */
export function ChatSearchOverlay(): JSX.Element | null {
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const searchResults = useChatStore((s) => s.searchResults);
  const performSearch = useChatStore((s) => s.performSearch);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const searchError = useChatStore((s) => s.searchError);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const universalSearchResults = useChatStore((s) => s.universalSearchResults);
  const universalSearchLoading = useChatStore((s) => s.universalSearchLoading);
  const universalSearchError = useChatStore((s) => s.universalSearchError);
  const universalSearchTab = useChatStore((s) => s.universalSearchTab);
  const performUniversalSearch = useChatStore((s) => s.performUniversalSearch);
  const setUniversalSearchTab = useChatStore((s) => s.setUniversalSearchTab);

  const [searchInput, setSearchInput] = useState('');
  const [isUniversalSearch, setIsUniversalSearch] = useState(false);
  const channelSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const universalSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const usMessages = universalSearchResults?.messages ?? [];
  const usTasks = universalSearchResults?.tasks ?? [];
  const usDocs = universalSearchResults?.documents ?? [];
  const usPeople = universalSearchResults?.users ?? [];

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchInput('');
      setIsUniversalSearch(false);
    }
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!searchOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, setSearchOpen]);

  useEffect(() => {
    if (!searchOpen || isUniversalSearch) {
      if (channelSearchTimerRef.current) {
        clearTimeout(channelSearchTimerRef.current);
        channelSearchTimerRef.current = null;
      }
      return;
    }
    if (!searchInput.trim()) {
      void performSearch('', activeChannelId ?? undefined);
      return;
    }
    channelSearchTimerRef.current = setTimeout(() => {
      void performSearch(searchInput, activeChannelId ?? undefined);
      channelSearchTimerRef.current = null;
    }, 400);
    return () => {
      if (channelSearchTimerRef.current) {
        clearTimeout(channelSearchTimerRef.current);
        channelSearchTimerRef.current = null;
      }
    };
  }, [searchInput, searchOpen, isUniversalSearch, activeChannelId, performSearch]);

  useEffect(() => {
    if (!searchOpen || !isUniversalSearch) {
      if (universalSearchTimerRef.current) {
        clearTimeout(universalSearchTimerRef.current);
        universalSearchTimerRef.current = null;
      }
      return;
    }
    if (!searchInput.trim()) {
      void performUniversalSearch('');
      return;
    }
    universalSearchTimerRef.current = setTimeout(() => {
      void performUniversalSearch(searchInput);
      universalSearchTimerRef.current = null;
    }, 400);
    return () => {
      if (universalSearchTimerRef.current) {
        clearTimeout(universalSearchTimerRef.current);
        universalSearchTimerRef.current = null;
      }
    };
  }, [searchInput, searchOpen, isUniversalSearch, performUniversalSearch]);

  const handleChannelSearchNow = () => {
    setSearchQuery(searchInput);
    if (channelSearchTimerRef.current) {
      clearTimeout(channelSearchTimerRef.current);
      channelSearchTimerRef.current = null;
    }
    void performSearch(searchInput, activeChannelId ?? undefined);
  };

  const handleUniversalSearchNow = () => {
    if (universalSearchTimerRef.current) {
      clearTimeout(universalSearchTimerRef.current);
      universalSearchTimerRef.current = null;
    }
    void performUniversalSearch(searchInput);
  };

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-3 sm:px-4"
      data-testid="chat-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search messages"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm border-0 cursor-default p-0"
        onClick={() => setSearchOpen(false)}
        aria-label="Close search"
      />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-app bg-app-sidebar/95 backdrop-blur-xl shadow-2xl max-h-[min(80vh,32rem)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-app shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-app-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isUniversalSearch) handleUniversalSearchNow();
                  else handleChannelSearchNow();
                }
              }}
              placeholder={isUniversalSearch ? 'Search everything...' : 'Search messages...'}
              className="flex-1 bg-transparent text-sm text-app placeholder:text-app-muted focus:outline-none min-w-0"
            />
            <button
              type="button"
              onClick={() => setIsUniversalSearch(!isUniversalSearch)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0',
                isUniversalSearch ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              {isUniversalSearch ? 'Universal' : 'Channel'}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="p-1 rounded text-app-muted hover:text-app shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-app-muted mt-1.5 px-0.5">
            ⌘⇧F / Ctrl⇧F opens search. Escape closes.
          </p>
          {searchError && !isUniversalSearch && (
            <p className="mt-2 text-xs text-red-400/90" role="alert">
              {searchError}
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {isUniversalSearch && (
            <div>
              {universalSearchError && (
                <p className="mb-2 text-xs text-red-400/90" role="alert">
                  {universalSearchError}
                </p>
              )}
              <div className="flex gap-1 mb-2 flex-wrap">
                {(['all', 'messages', 'tasks', 'docs', 'people'] as UniversalSearchTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setUniversalSearchTab(tab)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                      universalSearchTab === tab ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
                    )}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              {universalSearchLoading && (
                <div className="flex items-center justify-center py-4 gap-2 text-app-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Searching...</span>
                </div>
              )}
              {universalSearchResults && !universalSearchLoading && (
                <div className="space-y-1">
                  {(universalSearchTab === 'all' || universalSearchTab === 'messages') && usMessages.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-1">Messages</p>}
                      {usMessages.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            if (r.channelId !== activeChannelId) setActiveChannel(r.channelId);
                            setSearchOpen(false);
                            setSearchInput('');
                            setIsUniversalSearch(false);
                            setTimeout(() => {
                              const el = document.getElementById(`msg-${r.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('ring-2', 'ring-primary-500/50');
                                setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500/50'), 2000);
                              }
                            }, 200);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-500/10 text-sm transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <MessageSquare className="w-3 h-3 text-app-muted" />
                            <span className="font-medium text-app">{r.senderName}</span>
                            <span className="text-xs text-app-muted">in #{r.channelName}</span>
                          </div>
                          <p className="text-app-muted text-xs line-clamp-1">{r.content}</p>
                        </button>
                      ))}
                    </>
                  )}
                  {(universalSearchTab === 'all' || universalSearchTab === 'tasks') && universalSearchResults.tasks.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-2">Tasks</p>}
                      {universalSearchResults.tasks.map((r) => (
                        <a key={r.id} href="/projects" className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-primary-500/10 text-sm transition-colors">
                          <ListChecks className="w-4 h-4 text-primary-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-app font-medium truncate">{r.title}</p>
                            {r.subtitle && <p className="text-xs text-app-muted truncate">{r.subtitle}</p>}
                          </div>
                          {r.status && <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover text-app-muted">{r.status}</span>}
                        </a>
                      ))}
                    </>
                  )}
                  {(universalSearchTab === 'all' || universalSearchTab === 'docs') && usDocs.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-2">Documents</p>}
                      {usDocs.map((r) => (
                        <a key={r.id} href="/knowledge" className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-primary-500/10 text-sm transition-colors">
                          <FileText className="w-4 h-4 text-accent-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-app font-medium truncate">{r.title}</p>
                            {r.subtitle && <p className="text-xs text-app-muted truncate">{r.subtitle}</p>}
                          </div>
                        </a>
                      ))}
                    </>
                  )}
                  {(universalSearchTab === 'all' || universalSearchTab === 'people') && usPeople.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-2">People</p>}
                      {usPeople.map((r) => (
                        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-primary-500/10 text-sm transition-colors">
                          <User className="w-4 h-4 text-success-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-app font-medium truncate">{r.title}</p>
                            {r.subtitle && <p className="text-xs text-app-muted truncate">{r.subtitle}</p>}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {!universalSearchError &&
                    usMessages.length === 0 &&
                    usTasks.length === 0 &&
                    usDocs.length === 0 &&
                    usPeople.length === 0 && (
                    <div className="py-4 text-center text-sm text-app-muted">Nothing matched — try different words or another tab.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isUniversalSearch && (
            <>
              {searchLoading && searchInput.trim().length > 0 && (
                <div className="mt-2 flex items-center justify-center gap-2 py-4 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  <span>Searching…</span>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        if (r.channelId && r.channelId !== activeChannelId) {
                          setActiveChannel(r.channelId);
                        }
                        setSearchOpen(false);
                        setSearchInput('');
                        setTimeout(() => {
                          const el = document.getElementById(`msg-${r.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('ring-2', 'ring-primary-500/50');
                            setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500/50'), 2000);
                          }
                        }, 200);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-app-hover hover:bg-primary-500/10 text-sm transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-app">{r.senderName}</span>
                        <span className="text-xs text-app-muted">in #{r.channelName}</span>
                      </div>
                      <p className="text-app-muted text-xs line-clamp-2">{r.content}</p>
                    </button>
                  ))}
                </div>
              )}
              {searchResults.length === 0 &&
                searchInput.trim().length > 0 &&
                !searchLoading &&
                !searchError && (
                <div className="py-4 text-center text-sm text-app-muted">
                  No messages match &quot;{searchInput}&quot; in this channel. Try another phrase or check spelling.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
