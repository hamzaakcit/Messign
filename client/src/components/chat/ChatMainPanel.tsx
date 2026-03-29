import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import type { Message } from '@/types';
import { ChatHeader } from './ChatHeader';
import { EnhancedMessageBubble } from './EnhancedMessageBubble';
import { EnhancedMessageInput } from './EnhancedMessageInput';
import { SmartReplyBar } from './SmartReplyBar';
import { DoraChatAssistant } from './DoraChatAssistant';
import { ChatNotificationPrompt } from './ChatNotificationPrompt';
import { ChatSearchOverlay } from './ChatSearchOverlay';
import { Hash, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeChannelList } from '@/lib/chatChannelUtils';

type TranscriptRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: Message; showAvatar: boolean };

export function ChatMainPanel() {
  const channelsRaw = useChatStore((s) => s.channels);
  const channels = useMemo(() => normalizeChannelList(channelsRaw), [channelsRaw]);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const doraPanelOpen = useChatStore((s) => s.doraPanelOpen);
  const toggleDoraPanel = useChatStore((s) => s.toggleDoraPanel);
  const setChannelCreateOpen = useChatStore((s) => s.setChannelCreateOpen);
  const chatTranscriptWide = useChatStore((s) => s.chatTranscriptWide);
  const chatCompactMode = useChatStore((s) => s.chatCompactMode);
  const messagesHasMore = useChatStore((s) =>
    activeChannelId ? (s.messagesHasMore?.[activeChannelId] ?? false) : false,
  );
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [a11yAnnouncement, setA11yAnnouncement] = useState('');
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const dayRowH = chatCompactMode ? 38 : 52;
  const msgRowH = chatCompactMode ? 72 : 92;

  const virtualizer = useVirtualizer({
    count: transcriptRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (transcriptRows[index]?.kind === 'day' ? dayRowH : msgRowH),
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
  }, [lastMessageId, channelMessages, currentUser?.id, activeChannel?.name]);

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

  if (!activeChannel) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted bg-app-bg/90 px-6 min-h-0 overflow-hidden">
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
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-gradient-to-b from-app-bg/75 via-app-bg/92 to-app-bg">
      <ChatSearchOverlay />

      {doraPanelOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[44] bg-black/40 backdrop-blur-[1px] border-0 p-0 cursor-default"
            onClick={() => toggleDoraPanel()}
            aria-label="Close Dora panel"
          />
          <div className="fixed left-1/2 top-[max(4.5rem,env(safe-area-inset-top,0px))] z-[45] w-[min(100%-1rem,42rem)] -translate-x-1/2 max-h-[min(70vh,26rem)] overflow-hidden flex flex-col rounded-lg border border-app bg-app-sidebar/95 backdrop-blur-xl shadow-lg">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DoraChatAssistant />
            </div>
          </div>
        </>
      )}

      <ChatHeader />

      {/* Transcript — sole scroll region */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-2 sm:px-3 py-2 border-b border-app/80"
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
            'mx-auto min-h-[min(100%,20rem)] rounded-xl border border-app bg-app-card/25 backdrop-blur-sm px-2 sm:px-3 py-2',
            chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl',
          )}
        >
        {channelMessages.length === 0 ? (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-app-muted px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/15 to-accent-500/10 flex items-center justify-center mb-4 ring-1 ring-primary-500/20">
              <Hash className="w-8 h-8 text-primary-400/70" aria-hidden />
            </div>
            <p className="text-base font-medium text-app">You&apos;re all caught up</p>
            <p className="text-sm mt-1.5 text-center max-w-xs leading-relaxed text-app-muted">
              No messages here yet — say hello below and get the conversation started.
            </p>
          </div>
        ) : (
          <>
            {messagesHasMore && (
              <div className="flex justify-center pb-2">
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
              <div key={chatCompactMode ? 'compact' : 'comfort'} className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
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
                        <div className={cn('flex items-center gap-2', chatCompactMode ? 'my-3' : 'my-6')}>
                          <div className="flex-1 h-px bg-app-hover" />
                          <span className="text-[11px] font-medium text-app-muted px-2">{row.label}</span>
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
                        compact={chatCompactMode}
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
                        <div className={cn('flex items-center gap-3', chatCompactMode ? 'my-3' : 'my-6')}>
                          <div className="flex-1 h-px bg-app-hover" />
                          <span className="text-[11px] font-medium text-app-muted px-2">
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
                        compact={chatCompactMode}
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

      <div className={cn('shrink-0 border-t border-app/80 mx-auto w-full px-2 sm:px-3 py-1', chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl')}>
        <SmartReplyBar />
      </div>

      <div className={cn('shrink-0 mx-auto w-full px-2 sm:px-3 pb-2 pt-0 border-t border-app/60', chatTranscriptWide ? 'max-w-6xl' : 'max-w-4xl')}>
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
