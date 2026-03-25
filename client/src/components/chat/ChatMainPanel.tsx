import { useEffect, useRef, useState } from 'react';
import { useChatStore, type UniversalSearchTab } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { ChatHeader } from './ChatHeader';
import { EnhancedMessageBubble } from './EnhancedMessageBubble';
import { EnhancedMessageInput } from './EnhancedMessageInput';
import { SmartReplyBar } from './SmartReplyBar';
import { DoraChatAssistant } from './DoraChatAssistant';
import { Hash, Search, X, Loader2, ListChecks, FileText, User, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChatMainPanel() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const searchResults = useChatStore((s) => s.searchResults);
  const performSearch = useChatStore((s) => s.performSearch);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const doraPanelOpen = useChatStore((s) => s.doraPanelOpen);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const universalSearchResults = useChatStore((s) => s.universalSearchResults);
  const universalSearchLoading = useChatStore((s) => s.universalSearchLoading);
  const universalSearchTab = useChatStore((s) => s.universalSearchTab);
  const performUniversalSearch = useChatStore((s) => s.performUniversalSearch);
  const setUniversalSearchTab = useChatStore((s) => s.setUniversalSearchTab);
  const [isUniversalSearch, setIsUniversalSearch] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState('');

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = activeChannelId ? (messages[activeChannelId] || []).filter((m) => !m.isDeleted) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    performSearch(searchInput, activeChannelId ?? undefined);
  };

  if (!activeChannel) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted bg-app-bg">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mb-6">
          <Hash className="w-10 h-10 text-primary-400" />
        </div>
        <h3 className="text-xl font-semibold text-app mb-2">Welcome to Chat</h3>
        <p className="text-sm text-app-muted max-w-xs text-center">
          Select a channel to start chatting, or create a new one
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-app-bg via-app-bg to-app-hover/[0.08]">
      <ChatHeader />

      {/* Search bar - Universal or Channel */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-app bg-app-bg/80">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-app-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isUniversalSearch) performUniversalSearch(searchInput);
                  else handleSearch();
                }
              }}
              placeholder={isUniversalSearch ? 'Search everything...' : 'Search messages...'}
              className="flex-1 bg-transparent text-sm text-app placeholder:text-app-muted focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => setIsUniversalSearch(!isUniversalSearch)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors',
                isUniversalSearch ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              {isUniversalSearch ? 'Universal' : 'Channel'}
            </button>
            <button onClick={() => { setSearchOpen(false); setSearchInput(''); setIsUniversalSearch(false); }} className="p-1 rounded text-app-muted hover:text-app">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Universal search tabs & results */}
          {isUniversalSearch && (
            <div className="mt-2">
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
                  {universalSearchResults.messages.length === 0 && universalSearchResults.tasks.length === 0 &&
                   universalSearchResults.documents.length === 0 && universalSearchResults.users.length === 0 && (
                    <div className="py-4 text-center text-sm text-app-muted">No results found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Channel-only search results */}
          {!isUniversalSearch && (
            <>
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
              {searchResults.length === 0 && searchInput.trim().length > 0 && (
                <div className="mt-2 py-4 text-center text-sm text-app-muted">
                  No results for &quot;{searchInput}&quot;
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dora panel */}
      {doraPanelOpen && <DoraChatAssistant />}

      {/* Messages — framed column for readability on wide screens */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 sm:px-4 py-3">
        <div className="max-w-4xl mx-auto min-h-[min(100%,24rem)] rounded-2xl border border-app/50 bg-app-bg/40 shadow-inner shadow-black/5 px-2 sm:px-4 py-3">
        {channelMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-app-muted">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/10 to-accent-500/10 flex items-center justify-center mb-4">
              <Hash className="w-8 h-8 text-primary-400/50" />
            </div>
            <p className="text-base font-medium">No messages yet</p>
            <p className="text-sm mt-1">Be the first to say something!</p>
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
        </div>
      </div>

      {/* Smart replies */}
      <div className="max-w-4xl mx-auto w-full px-2 sm:px-4">
        <SmartReplyBar />
      </div>

      {/* Input */}
      <div className="max-w-4xl mx-auto w-full px-2 sm:px-4 pb-1">
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
