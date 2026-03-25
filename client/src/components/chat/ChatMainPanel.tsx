import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore, type UniversalSearchTab } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import type { Message } from '@/types';
import { ChatHeader } from './ChatHeader';
import { EnhancedMessageBubble } from './EnhancedMessageBubble';
import { EnhancedMessageInput } from './EnhancedMessageInput';
import { SmartReplyBar } from './SmartReplyBar';
import { DoraChatAssistant } from './DoraChatAssistant';
import { ChatNotificationPrompt } from './ChatNotificationPrompt';
import { Hash, Search, X, Loader2, ListChecks, FileText, User, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type TranscriptRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: Message; showAvatar: boolean };

export function ChatMainPanel() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const searchResults = useChatStore((s) => s.searchResults);
  const performSearch = useChatStore((s) => s.performSearch);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const searchError = useChatStore((s) => s.searchError);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const doraPanelOpen = useChatStore((s) => s.doraPanelOpen);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const universalSearchResults = useChatStore((s) => s.universalSearchResults);
  const universalSearchLoading = useChatStore((s) => s.universalSearchLoading);
  const universalSearchError = useChatStore((s) => s.universalSearchError);
  const universalSearchTab = useChatStore((s) => s.universalSearchTab);
  const performUniversalSearch = useChatStore((s) => s.performUniversalSearch);
  const setUniversalSearchTab = useChatStore((s) => s.setUniversalSearchTab);
  const setChannelCreateOpen = useChatStore((s) => s.setChannelCreateOpen);
  const chatTranscriptWide = useChatStore((s) => s.chatTranscriptWide);
  const messagesHasMore = useChatStore((s) =>
    activeChannelId ? (s.messagesHasMore?.[activeChannelId] ?? false) : false,
  );
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const [isUniversalSearch, setIsUniversalSearch] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [a11yAnnouncement, setA11yAnnouncement] = useState('');
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const universalSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = activeChannelId ? (messages[activeChannelId] || []).filter((m) => !m.isDeleted) : [];

  const transcriptRows = useMemo((): TranscriptRow[] => {
    const rows: TranscriptRow[] = [];
    for (let i = 0; i < channelMessages.length; i++) {
      const message = channelMessages[i];
      const prevMessage = channelMessages[i - 1];
      if (!prevMessage || !isSameDay(prevMessage.timestamp, message.timestamp)) {
        rows.push({ kind: 'day', key: `day-${message.id}`, label: formatDateSeparator(message.timestamp) });
      }
      const showAvatar = !prevMessage || prevMessage.userId !== message.userId;
      rows.push({ kind: 'msg', key: message.id, message, showAvatar });
    }
    return rows;
  }, [channelMessages]);

  const virtualizer = useVirtualizer({
    count: transcriptRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (transcriptRows[index]?.kind === 'day' ? 52 : 92),
    overscan: 12,
  });

  const lastMessageId = channelMessages[channelMessages.length - 1]?.id;

  useEffect(() => {
    if (transcriptRows.length === 0) return;
    virtualizer.scrollToIndex(transcriptRows.length - 1, { align: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor scroll to latest message / channel switch only
  }, [activeChannelId, lastMessageId]);

  useEffect(() => {
    const last = channelMessages[channelMessages.length - 1];
    if (!last || last.userId === currentUser?.id) return;
    setA11yAnnouncement(`${last.senderName ?? 'Someone'} sent a message in ${activeChannel?.name ?? 'chat'}`);
  }, [lastMessageId, channelMessages, currentUser?.id, activeChannel?.name]); // channelMessages: read latest list when last id changes

  const handleLoadOlder = async () => {
    if (!activeChannelId || !currentUser?.id) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    await loadOlderMessages(activeChannelId, currentUser.id);
    setLoadingOlder(false);
    requestAnimationFrame(() => {
      const nex = scrollRef.current;
      if (nex) nex.scrollTop = nex.scrollHeight - prevHeight + prevTop;
    });
  };

  useEffect(() => {
    if (channelMessages.length === 0 || transcriptRows.length > 45) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length, transcriptRows.length, lastMessageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

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

  if (!activeChannel) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted bg-app-bg/90 px-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/25 to-accent-500/20 flex items-center justify-center mb-5 shadow-lg shadow-primary-500/10 ring-1 ring-primary-500/20">
          <Hash className="w-10 h-10 text-primary-400" aria-hidden />
        </div>
        <h3 className="text-xl font-semibold text-app mb-2 text-center">Welcome to Chat</h3>
        <p className="text-sm text-app-muted max-w-sm text-center leading-relaxed">
          Choose a channel from the sidebar to jump in, or create a new space for your team.
        </p>
        <button
          type="button"
          onClick={() => setChannelCreateOpen(true)}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg shadow-lg shadow-primary-500/25 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Create a channel
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-gradient-to-b from-app-bg/75 via-app-bg/92 to-app-bg">
      <ChatHeader />

      {/* Search bar - Universal or Channel */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-app bg-app-sidebar/70 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-app-muted" />
            <input
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
              className="flex-1 bg-transparent text-sm text-app placeholder:text-app-muted focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setIsUniversalSearch(!isUniversalSearch)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors',
                isUniversalSearch ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              {isUniversalSearch ? 'Universal' : 'Channel'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchInput('');
                setIsUniversalSearch(false);
              }}
              className="p-1 rounded text-app-muted hover:text-app"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-app-muted mt-1.5 px-0.5">
            Keyboard shortcut: ⌘⇧F (Mac) or Ctrl⇧F (Windows) opens search from anywhere in chat.
          </p>
          {searchError && !isUniversalSearch && (
            <p className="mt-2 text-xs text-red-400/90" role="alert">
              {searchError}
            </p>
          )}

          {/* Universal search tabs & results */}
          {isUniversalSearch && (
            <div className="mt-2">
              {universalSearchError && (
                <p className="mb-2 text-xs text-red-400/90" role="alert">
                  {universalSearchError}
                </p>
              )}
              <div className="flex gap-1 mb-2">
                {(['all', 'messages', 'tasks', 'docs', 'people'] as UniversalSearchTab[]).map((tab) => (
                  <button
                    key={tab}
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
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {(universalSearchTab === 'all' || universalSearchTab === 'messages') && universalSearchResults.messages.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-1">Messages</p>}
                      {universalSearchResults.messages.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            if (r.channelId !== activeChannelId) setActiveChannel(r.channelId);
                            setSearchOpen(false); setSearchInput(''); setIsUniversalSearch(false);
                            setTimeout(() => {
                              const el = document.getElementById(`msg-${r.id}`);
                              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-primary-500/50'); setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500/50'), 2000); }
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
                  {(universalSearchTab === 'all' || universalSearchTab === 'docs') && universalSearchResults.documents.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-2">Documents</p>}
                      {universalSearchResults.documents.map((r) => (
                        <a key={r.id} href={`/knowledge`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-primary-500/10 text-sm transition-colors">
                          <FileText className="w-4 h-4 text-accent-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-app font-medium truncate">{r.title}</p>
                            {r.subtitle && <p className="text-xs text-app-muted truncate">{r.subtitle}</p>}
                          </div>
                        </a>
                      ))}
                    </>
                  )}
                  {(universalSearchTab === 'all' || universalSearchTab === 'people') && universalSearchResults.users.length > 0 && (
                    <>
                      {universalSearchTab === 'all' && <p className="text-[10px] font-semibold text-app-muted uppercase mt-2">People</p>}
                      {universalSearchResults.users.map((r) => (
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
                    universalSearchResults.messages.length === 0 &&
                    universalSearchResults.tasks.length === 0 &&
                    universalSearchResults.documents.length === 0 &&
                    universalSearchResults.users.length === 0 && (
                    <div className="py-4 text-center text-sm text-app-muted">Nothing matched — try different words or another tab.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Channel-only search results */}
          {!isUniversalSearch && (
            <>
              {searchLoading && searchInput.trim().length > 0 && (
                <div className="mt-2 flex items-center justify-center gap-2 py-4 text-app-muted text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  <span>Searching…</span>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
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
                <div className="mt-2 py-4 text-center text-sm text-app-muted">
                  No messages match &quot;{searchInput}&quot; in this channel. Try another phrase or check spelling.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dora panel */}
      {doraPanelOpen && <DoraChatAssistant />}

      {/* Messages — framed column for readability on wide screens */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-2 sm:px-4 py-3"
        tabIndex={-1}
      >
        <div className={cn('mx-auto mb-2', chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl')}>
          <ChatNotificationPrompt />
        </div>
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          {a11yAnnouncement}
        </div>
        <div
          className={cn(
            'mx-auto min-h-[min(100%,24rem)] rounded-2xl border border-app/80 bg-app-card/30 backdrop-blur-[2px] shadow-inner shadow-black/10 ring-1 ring-app-border/40 px-2 sm:px-4 py-3',
            chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl',
          )}
        >
        {channelMessages.length === 0 ? (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-app-muted px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/15 to-accent-500/10 flex items-center justify-center mb-4 ring-1 ring-primary-500/20">
              <Hash className="w-8 h-8 text-primary-400/70" aria-hidden />
            </div>
            <p className="text-base font-medium text-app">You&apos;re all caught up</p>
            <p className="text-sm mt-1.5 text-center max-w-xs leading-relaxed">
              No messages here yet — say hello below and get the conversation started.
            </p>
          </div>
        ) : (
          <>
            {messagesHasMore && (
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  onClick={() => void handleLoadOlder()}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-2 rounded-full border border-app bg-app-hover/50 px-3 py-1.5 text-xs font-medium text-app-muted hover:text-app hover:bg-app-hover disabled:opacity-50"
                >
                  {loadingOlder ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
                  Load older messages
                </button>
              </div>
            )}
            {transcriptRows.length > 45 ? (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const row = transcriptRows[vi.index];
                  if (!row) return null;
                  const itemStyle: CSSProperties = {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  };
                  if (row.kind === 'day') {
                    return (
                      <div
                        key={row.key}
                        data-index={vi.index}
                        ref={virtualizer.measureElement}
                        className="px-0"
                        style={itemStyle}
                      >
                        <div className="flex items-center gap-3 my-6">
                          <div className="flex-1 h-px bg-app-hover" />
                          <span className="text-xs font-medium text-app-muted px-2">{row.label}</span>
                          <div className="flex-1 h-px bg-app-hover" />
                        </div>
                      </div>
                    );
                  }
                  const user = users.find((u) => u.id === row.message.userId);
                  return (
                    <div
                      key={row.key}
                      id={`msg-${row.message.id}`}
                      data-index={vi.index}
                      ref={virtualizer.measureElement}
                      className="absolute left-0 top-0 w-full px-0"
                      style={{ transform: `translateY(${vi.start}px)` }}
                    >
                      <EnhancedMessageBubble
                        message={row.message}
                        user={user}
                        showAvatar={row.showAvatar}
                        currentUserId={currentUser?.id}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {channelMessages.map((message, index) => {
                  const user = users.find((u) => u.id === message.userId);
                  const prevMessage = channelMessages[index - 1];
                  const showAvatar = !prevMessage || prevMessage.userId !== message.userId;
                  const showDateSeparator = !prevMessage || !isSameDay(prevMessage.timestamp, message.timestamp);

                  return (
                    <div key={message.id} id={`msg-${message.id}`}>
                      {showDateSeparator && (
                        <div className="flex items-center gap-3 my-6">
                          <div className="flex-1 h-px bg-app-hover" />
                          <span className="text-xs font-medium text-app-muted px-2">
                            {formatDateSeparator(message.timestamp)}
                          </span>
                          <div className="flex-1 h-px bg-app-hover" />
                        </div>
                      )}
                      <EnhancedMessageBubble
                        message={message}
                        user={user}
                        showAvatar={showAvatar}
                        currentUserId={currentUser?.id}
                      />
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </>
        )}
        </div>
      </div>

      {/* Smart replies */}
      <div className={cn('mx-auto w-full px-2 sm:px-4', chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl')}>
        <SmartReplyBar />
      </div>

      {/* Input */}
      <div className={cn('mx-auto w-full px-2 sm:px-4 pb-1', chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl')}>
        <EnhancedMessageInput channelName={activeChannel.name} />
      </div>
    </div>
  );
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDateSeparator(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
