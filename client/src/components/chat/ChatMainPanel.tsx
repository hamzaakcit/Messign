import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { ChatHeader } from './ChatHeader';
import { EnhancedMessageBubble } from './EnhancedMessageBubble';
import { EnhancedMessageInput } from './EnhancedMessageInput';
import { SmartReplyBar } from './SmartReplyBar';
import { DoraChatAssistant } from './DoraChatAssistant';
import { Hash, Search, X } from 'lucide-react';

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
    <div className="h-full flex flex-col">
      <ChatHeader />

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-app bg-app-bg/80">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-app-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-sm text-app placeholder:text-app-muted focus:outline-none"
              autoFocus
            />
            <button onClick={() => { setSearchOpen(false); setSearchInput(''); }} className="p-1 rounded text-app-muted hover:text-app">
              <X className="w-4 h-4" />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {searchResults.map((r) => (
                <div key={r.id} className="px-3 py-2 rounded-lg bg-app-hover text-sm">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-app">{r.senderName}</span>
                    <span className="text-xs text-app-muted">in #{r.channelName}</span>
                  </div>
                  <p className="text-app-muted text-xs line-clamp-2">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dora panel */}
      {doraPanelOpen && <DoraChatAssistant />}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
                <div key={message.id}>
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

      {/* Smart replies */}
      <SmartReplyBar />

      {/* Input */}
      <EnhancedMessageInput channelName={activeChannel.name} />
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
