import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, MessageSquare, Sparkles, FileText, ListChecks, Scale, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { Avatar } from '@/components/ui';
import { formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function ThreadPanel() {
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const threadMessages = useChatStore((s) => s.threadMessages);
  const threadLoading = useChatStore((s) => s.threadLoading);
  const closeThread = useChatStore((s) => s.closeThread);
  const sendThreadReply = useChatStore((s) => s.sendThreadReply);
  const messages = useChatStore((s) => s.messages);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const threadDoraSummary = useChatStore((s) => s.threadDoraSummary);
  const threadDoraActionItems = useChatStore((s) => s.threadDoraActionItems);
  const threadDoraSummaryLoading = useChatStore((s) => s.threadDoraSummaryLoading);
  const threadDoraActionItemsLoading = useChatStore((s) => s.threadDoraActionItemsLoading);
  const threadDoraDecisions = useChatStore((s) => s.threadDoraDecisions);
  const threadDoraDecisionsLoading = useChatStore((s) => s.threadDoraDecisionsLoading);
  const fetchThreadDoraSummary = useChatStore((s) => s.fetchThreadDoraSummary);
  const fetchThreadDoraActionItems = useChatStore((s) => s.fetchThreadDoraActionItems);
  const fetchThreadDoraDecisions = useChatStore((s) => s.fetchThreadDoraDecisions);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const [replyContent, setReplyContent] = useState('');
  const [doraStripExpanded, setDoraStripExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const parentMessage = activeChannelId
    ? messages[activeChannelId]?.find((m) => m.id === activeThreadId)
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);

  useEffect(() => {
    if (activeThreadId) inputRef.current?.focus();
  }, [activeThreadId]);

  if (!activeThreadId || !parentMessage) return null;

  const parentUser = users.find((u) => u.id === parentMessage.userId);
  const parentDisplayName = parentUser?.name ?? parentMessage.senderName ?? parentMessage.userId;

  const handleSend = async () => {
    if (!replyContent.trim() || !currentUser) return;
    await sendThreadReply(replyContent.trim(), currentUser.id, activeThreadId);
    setReplyContent('');
  };

  return (
    <div className="h-full flex flex-col border-l border-app bg-app-bg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-app flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-semibold text-app">Thread</span>
          <span className="text-xs text-app-muted">
            {threadMessages.length} {threadMessages.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        <button onClick={closeThread} aria-label="Close thread" className="p-1 rounded text-app-muted hover:text-app transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread Dora — collapsible to give more room for replies */}
      {activeChannelId && activeThreadId && (
        <div className="px-3 py-2 border-b border-app bg-gradient-to-r from-primary-500/5 to-accent-500/5 shrink-0">
          <button
            type="button"
            onClick={() => setDoraStripExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 w-full text-left mb-1 rounded-lg py-1 -mx-1 px-1 hover:bg-app-hover/50 transition-colors"
            aria-expanded={doraStripExpanded}
            aria-controls="thread-dora-tools"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary-400 shrink-0" aria-hidden />
            <span className="text-[11px] font-semibold text-app-muted uppercase flex-1">Dora</span>
            <ChevronDown className={cn('w-3.5 h-3.5 text-app-muted transition-transform', !doraStripExpanded && '-rotate-90')} aria-hidden />
          </button>
          {doraStripExpanded && (
            <>
              <div id="thread-dora-tools" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchThreadDoraSummary(activeChannelId, activeThreadId)}
                  disabled={threadDoraSummaryLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-app-bg border border-app text-app hover:bg-app-hover disabled:opacity-50"
                  aria-label="Summarize this thread"
                >
                  {threadDoraSummaryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  Summarize
                </button>
                <button
                  type="button"
                  onClick={() => fetchThreadDoraActionItems(activeChannelId, activeThreadId)}
                  disabled={threadDoraActionItemsLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-app-bg border border-app text-app hover:bg-app-hover disabled:opacity-50"
                  aria-label="Find action items in thread"
                >
                  {threadDoraActionItemsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListChecks className="w-3 h-3" />}
                  Actions
                </button>
                <button
                  type="button"
                  onClick={() => fetchThreadDoraDecisions(activeChannelId, activeThreadId)}
                  disabled={threadDoraDecisionsLoading}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-app-bg border border-app text-app hover:bg-app-hover disabled:opacity-50"
                  aria-label="Extract decisions from thread"
                >
                  {threadDoraDecisionsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scale className="w-3 h-3" />}
                  Decisions
                </button>
              </div>
              {(threadDoraSummary || threadDoraActionItems || threadDoraDecisions) && (
                <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto text-[11px] text-app">
                  {threadDoraSummary?.summary && (
                    <p className="text-app-muted leading-snug"><span className="font-medium text-app">Summary:</span> {threadDoraSummary.summary}</p>
                  )}
                  {threadDoraActionItems && threadDoraActionItems.actionItems.length > 0 && (
                    <ul className="list-disc pl-3 text-app-muted space-y-0.5">
                      {threadDoraActionItems.actionItems.slice(0, 4).map((a) => (
                        <li key={a.sourceMessageId + a.text.slice(0, 20)}>{a.text}</li>
                      ))}
                    </ul>
                  )}
                  {threadDoraDecisions && threadDoraDecisions.decisions.length > 0 && (
                    <ul className="list-disc pl-3 text-app-muted space-y-0.5">
                      {threadDoraDecisions.decisions.slice(0, 5).map((d, i) => (
                        <li key={`${i}-${d.text.slice(0, 24)}`}>
                          {d.text}
                          {d.owners && d.owners.length > 0 ? ` — ${d.owners.join(', ')}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-app bg-app-hover/20 shrink-0">
        <div className="flex items-start gap-2.5">
          <Avatar src={parentUser?.avatar ?? parentMessage.senderAvatar} name={parentDisplayName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-app">{parentDisplayName}</span>
              <span className="text-[11px] text-app-muted">{formatTime(parentMessage.timestamp)}</span>
            </div>
            <p className="text-sm text-app break-words">{parentMessage.content}</p>
          </div>
        </div>
      </div>

      {/* Thread replies */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {threadLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-app-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading replies...</span>
          </div>
        ) : threadMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-app-muted">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No replies yet</p>
            <p className="text-xs mt-1">Be the first to reply</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threadMessages.map((msg) => {
              const msgUser = users.find((u) => u.id === msg.userId);
              const msgName = msgUser?.name ?? msg.senderName ?? msg.userId;
              return (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <Avatar src={msgUser?.avatar ?? msg.senderAvatar} name={msgName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-app">{msgName}</span>
                      <span className="text-[11px] text-app-muted">{formatTime(msg.timestamp)}</span>
                    </div>
                    <p className="text-sm text-app break-words">{msg.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="px-4 py-3 border-t border-app shrink-0">
        <div className={cn(
          'flex items-end gap-2 p-2.5 rounded-xl border transition-all',
          'border-app-inputBorder bg-app-inputBg focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500/30',
        )}>
          <textarea
            ref={inputRef}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Reply in thread..."
            rows={1}
            className="flex-1 bg-transparent text-app text-sm placeholder:text-app-muted resize-none focus:outline-none min-h-[24px] max-h-[80px]"
          />
          <button
            onClick={handleSend}
            disabled={!replyContent.trim()}
            className="p-1.5 rounded-lg bg-primary-500 text-white disabled:opacity-40 hover:bg-primary-600 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
