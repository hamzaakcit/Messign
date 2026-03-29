import { useState } from 'react';
import type { Message, User, DoraTransformAction } from '@/types';
import { DoraMessageResultModal } from './DoraMessageResultModal';
import { Avatar } from '@/components/ui';
import { formatTime } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { chatAPI, fetchAPI } from '@/lib/api';
import { EmbeddedTaskCard } from './EmbeddedTaskCard';
import { EmbeddedDocCard } from './EmbeddedDocCard';
import { EmojiPicker } from './EmojiPicker';
import { Smile, Pin, Pencil, Trash2, MoreHorizontal, Copy, ListChecks, MessageSquare, Sparkles, Reply } from 'lucide-react';
import { UserHoverCard } from './UserHoverCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUsersStore } from '@/stores/usersStore';
import { DORA_TRANSLATE_LOCALES } from '@/lib/doraUiConstants';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

interface EnhancedMessageBubbleProps {
  message: Message;
  user?: User | null;
  showAvatar: boolean;
  currentUserId?: string;
  /** High-density typography and padding */
  compact?: boolean;
}

export function EnhancedMessageBubble({ message, user, showAvatar, currentUserId, compact = false }: EnhancedMessageBubbleProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const openContextMenu = useChatStore((s) => s.openContextMenu);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const editingMessageId = useChatStore((s) => s.editingMessageId);

  const displayName = user?.name ?? message.senderName ?? message.userId;
  const avatarSrc = user?.avatar ?? message.senderAvatar;
  const isOwnMessage = message.userId === currentUserId;
  const isEditing = editingMessageId === message.id;

  const handleReaction = async (emoji: string) => {
    const hasReacted = message.reactions?.some((r) => r.emoji === emoji && r.users.includes(currentUserId ?? ''));
    try {
      if (hasReacted) {
        await chatAPI.removeReaction(message.channelId, message.id, emoji);
      } else {
        await chatAPI.addReaction(message.channelId, message.id, emoji);
      }
    } catch { /* socket will sync */ }
    setShowReactionPicker(false);
  };

  const handlePin = async () => {
    try {
      await chatAPI.togglePin(message.channelId, message.id);
    } catch { /* handled by socket */ }
    setShowMoreMenu(false);
  };

  const handleEdit = () => {
    setEditingMessage(message.id);
    setShowMoreMenu(false);
  };

  const handleDelete = async () => {
    try {
      await chatAPI.deleteMessage(message.channelId, message.id);
    } catch { /* handled by socket */ }
    setShowMoreMenu(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setShowMoreMenu(false);
  };

  const openThread = useChatStore((s) => s.openThread);
  const requestComposerInsert = useChatStore((s) => s.requestComposerInsert);
  const allUsers = useUsersStore((s) => s.users);
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [doraOpen, setDoraOpen] = useState(false);
  const [doraTitle, setDoraTitle] = useState('');
  const [doraBody, setDoraBody] = useState('');
  const [doraLoading, setDoraLoading] = useState(false);

  const runDoraTransform = async (action: DoraTransformAction, title: string, targetLocale?: string) => {
    setShowMoreMenu(false);
    setDoraTitle(title);
    setDoraBody('');
    setDoraOpen(true);
    setDoraLoading(true);
    try {
      const out = await chatAPI.doraTransformMessage(message.channelId, message.id, { action, targetLocale });
      setDoraBody(out.text || '');
      if (out.text) {
        await chatAPI.awardChatXP(message.channelId, 'chat.dora.transform_used').catch(() => {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      setDoraBody(msg);
      toast.error(msg);
    } finally {
      setDoraLoading(false);
    }
  };

  const handleCreateTask = async () => {
    setShowMoreMenu(false);
    try {
      const title = message.content.slice(0, 200);
      await fetchAPI('/tasks', {
        method: 'POST',
        body: JSON.stringify({ title, description: `Created from chat message by ${displayName}`, priority: 'medium', status: 'todo' }),
      });
      await chatAPI.awardChatXP(message.channelId, 'chat.task.created_from_chat').catch(() => {});
      toast.success('Task created from message');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleReplyInThread = () => {
    openThread(message.id);
    setShowMoreMenu(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(message, { x: e.clientX, y: e.clientY });
  };

  if (message.isDeleted) {
    return (
      <div className={cn('flex gap-2 opacity-50', showAvatar ? (compact ? 'mt-2' : 'mt-4') : 'mt-0.5')}>
        <div className={cn('shrink-0', compact ? 'w-8' : 'w-10')} />
        <div className={cn('text-app-muted italic', compact ? 'text-xs' : 'text-sm')}>This message was deleted</div>
      </div>
    );
  }

  const embeddedCards = message.metadata?.embeddedCards ?? [];

  return (
    <div
      className={cn(
        'flex group relative',
        compact ? 'gap-2' : 'gap-3',
        showAvatar ? (compact ? 'mt-2' : 'mt-4') : 'mt-0.5',
        'hover:bg-app-hover/30 -mx-2 px-2 py-0.5 rounded-lg transition-colors',
      )}
      onMouseLeave={() => { setShowReactionPicker(false); setShowMoreMenu(false); }}
      onContextMenu={handleContextMenu}
    >
      {/* Avatar */}
      <div className={cn('shrink-0', compact ? 'w-8' : 'w-10')}>
        {showAvatar && user ? (
          <UserHoverCard user={user}>
            <Avatar src={avatarSrc} name={displayName} size={compact ? 'sm' : 'md'} status={user?.status} />
          </UserHoverCard>
        ) : showAvatar ? (
          <Avatar src={avatarSrc} name={displayName} size={compact ? 'sm' : 'md'} status={user?.status} />
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('font-semibold text-app', compact ? 'text-xs' : 'text-sm')}>{displayName}</span>
            <span className={cn('text-app-muted', compact ? 'text-[12px]' : 'text-[11px]')}>{formatTime(message.timestamp)}</span>
            {message.isPinned && (
              <span className="flex items-center gap-0.5 text-[10px] text-warning-500 bg-warning-500/10 px-1.5 py-0.5 rounded-full">
                <Pin className="w-2.5 h-2.5" /> Pinned
              </span>
            )}
            {message.isEdited && (
              <span className="text-[10px] text-app-muted">(edited)</span>
            )}
          </div>
        )}

        {/* Message text */}
        {isEditing ? (
          <EditMessageInline message={message} />
        ) : (
          <div
            className={cn(
              'text-app break-words border w-fit max-w-[min(100%,42rem)]',
              compact ? 'text-xs leading-snug rounded-lg px-2 py-1' : 'text-sm leading-relaxed rounded-2xl px-3 py-2',
              isOwnMessage
                ? 'bg-primary-500/15 border-primary-500/25'
                : 'bg-app-hover/60 border-app/70',
            )}
          >
            {formatMessageContent(message.content)}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment, idx) => {
              const key = attachment.id ?? `att-${idx}`;
              const isImage = attachment.type?.startsWith('image/') && attachment.url;
              return (
                <div key={key} className="rounded-xl overflow-hidden bg-app-hover border border-app">
                  {isImage ? (
                    <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={attachment.url} alt={attachment.name} className="max-w-[280px] max-h-[200px] object-cover" />
                    </a>
                  ) : (
                    <div className="px-3 py-2 text-sm text-app-muted flex items-center gap-2">
                      <span className="truncate max-w-[200px]">{attachment.name}</span>
                      <span className="text-xs opacity-60">{formatFileSize(attachment.size)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Embedded cards */}
        {embeddedCards.map((card, idx) => (
          <div key={idx} className="mt-2">
            {card.type === 'task' && <EmbeddedTaskCard refId={card.refId} channelId={message.channelId} />}
            {card.type === 'document' && <EmbeddedDocCard refId={card.refId} channelId={message.channelId} />}
          </div>
        ))}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {message.reactions.map((reaction) => {
              const reactorNames = reaction.users
                .map((uid) => allUsers.find((u) => u.id === uid)?.name ?? uid)
                .slice(0, 5);
              const remaining = reaction.users.length - reactorNames.length;
              const tooltipText = remaining > 0
                ? `${reactorNames.join(', ')} and ${remaining} more`
                : reactorNames.join(', ');
              return (
                <div key={reaction.emoji} className="relative">
                  <button
                    type="button"
                    onClick={() => handleReaction(reaction.emoji)}
                    aria-label={`${reaction.emoji} reaction, ${reaction.users.length} ${reaction.users.length === 1 ? 'person' : 'people'}`}
                    onMouseEnter={() => setHoveredReaction(reaction.emoji)}
                    onMouseLeave={() => setHoveredReaction(null)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all duration-200',
                      reaction.users.includes(currentUserId ?? '')
                        ? 'border-primary-500/30 bg-primary-500/10 text-primary-400 scale-100 hover:scale-105'
                        : 'border-app bg-app-hover text-app-muted hover:border-primary-500/20 hover:scale-105',
                    )}
                  >
                    <span className="transition-transform duration-200 hover:scale-110">{reaction.emoji}</span>
                    <span className="font-medium">{reaction.users.length}</span>
                  </button>
                  {hoveredReaction === reaction.emoji && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-lg whitespace-nowrap z-30 shadow-lg pointer-events-none">
                      {tooltipText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover action toolbar — icon-first; visible on hover/focus-within */}
      {!isEditing && (
        <div
          className={cn(
            'absolute -top-2 right-1 flex items-center gap-0.5 bg-app-sidebar/95 backdrop-blur-md border border-app rounded-lg shadow-lg p-0.5 z-10',
            'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
            'focus-within:opacity-100 focus-within:pointer-events-auto',
          )}
        >
          {!message.threadId && (
            <button
              type="button"
              onClick={handleReplyInThread}
              className="w-7 h-7 flex items-center justify-center rounded-md text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="Reply in thread"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
          )}
          {isOwnMessage && (
            <button
              type="button"
              onClick={handleEdit}
              className="w-7 h-7 flex items-center justify-center rounded-md text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="Edit message"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReaction(emoji)}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-app-hover text-sm transition-colors"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label="Open emoji picker"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-app mx-0.5" />
          <button
            type="button"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label="Message actions"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reaction picker */}
      {showReactionPicker && (
        <div className="absolute -top-12 right-2 z-20">
          <div className="bg-app-sidebar border border-app rounded-xl shadow-xl p-2 flex gap-1 mb-1">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReaction(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-app-hover text-lg transition-transform hover:scale-110"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <EmojiPicker
            onSelect={(emoji) => handleReaction(emoji)}
            onClose={() => setShowReactionPicker(false)}
          />
        </div>
      )}

      {/* More menu */}
      {showMoreMenu && (
        <div className="absolute top-6 right-2 bg-app-sidebar border border-app rounded-xl shadow-xl py-1 z-20 min-w-[180px] max-h-[min(70vh,320px)] overflow-y-auto">
          <button onClick={handleCopy} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copy text
          </button>
          <button onClick={handlePin} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            <Pin className="w-3.5 h-3.5" /> {message.isPinned ? 'Unpin' : 'Pin'} message
          </button>
          {isOwnMessage && (
            <>
              <button onClick={handleEdit} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
          <button onClick={handleCreateTask} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            <ListChecks className="w-3.5 h-3.5" /> Create task
          </button>
          {!message.threadId && (
            <button onClick={handleReplyInThread} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
              <MessageSquare className="w-3.5 h-3.5" /> Reply in thread
            </button>
          )}
          <div className="my-1 h-px bg-app" />
          <p className="px-3 py-0.5 text-[10px] font-semibold text-app-muted uppercase flex items-center gap-1">
            <Sparkles className="w-3 h-3" aria-hidden /> Dora
          </p>
          <button type="button" onClick={() => runDoraTransform('explain', 'Explain message')} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            Explain
          </button>
          <button type="button" onClick={() => runDoraTransform('shorten', 'Shorten message')} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            Shorten
          </button>
          <button type="button" onClick={() => runDoraTransform('expand', 'Expand message')} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            Expand
          </button>
          <button type="button" onClick={() => runDoraTransform('professional', 'Professional tone')} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            Professional tone
          </button>
          <button type="button" onClick={() => runDoraTransform('friendly', 'Friendly tone')} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors">
            Friendly tone
          </button>
          <p className="px-3 py-0.5 text-[10px] font-semibold text-app-muted uppercase">Translate</p>
          {DORA_TRANSLATE_LOCALES.map(({ label, locale }) => (
            <button
              key={locale}
              type="button"
              onClick={() => runDoraTransform('translate', `Translate to ${label}`, locale)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-app hover:bg-app-hover transition-colors"
            >
              → {label}
            </button>
          ))}
        </div>
      )}

      <DoraMessageResultModal
        open={doraOpen}
        title={doraTitle}
        body={doraBody}
        loading={doraLoading}
        onClose={() => setDoraOpen(false)}
        onApply={(text) => { requestComposerInsert(text); toast.success('Inserted in composer'); }}
        applyLabel="Insert in composer"
      />

      {/* Thread reply count badge */}
      {(message.replyCount ?? 0) > 0 && !message.threadId && (
        <button
          type="button"
          onClick={handleReplyInThread}
          className={cn(
            'absolute bottom-0 flex items-center gap-1 text-primary-400 hover:text-primary-300 hover:underline transition-colors',
            compact ? 'left-10 text-[11px]' : 'left-12 text-xs',
          )}
          aria-label={`Open thread with ${message.replyCount} ${message.replyCount === 1 ? 'reply' : 'replies'}`}
        >
          <MessageSquare className="w-3 h-3" />
          {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  );
}

function EditMessageInline({ message }: { message: Message }) {
  const [content, setContent] = useState(message.content);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);

  const handleSave = async () => {
    if (content.trim() && content !== message.content) {
      try {
        await chatAPI.editMessage(message.channelId, message.id, content.trim());
      } catch { /* socket will sync */ }
    }
    setEditingMessage(null);
  };

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
          if (e.key === 'Escape') setEditingMessage(null);
        }}
        className="w-full p-2 text-sm bg-app-inputBg border border-primary-500 rounded-lg text-app focus:outline-none resize-none"
        rows={2}
        autoFocus
      />
      <div className="flex items-center gap-2 text-xs">
        <button onClick={handleSave} className="px-2 py-1 bg-primary-500 text-white rounded-md hover:bg-primary-600">Save</button>
        <button onClick={() => setEditingMessage(null)} className="px-2 py-1 text-app-muted hover:text-app">Cancel</button>
        <span className="text-app-muted">Escape to cancel, Enter to save</span>
      </div>
    </div>
  );
}

function formatMessageContent(content: string): React.ReactNode {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="text-primary-400 font-medium bg-primary-500/10 px-0.5 rounded">
          {part}
        </span>
      );
    }
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlParts = part.split(urlRegex);
    return urlParts.map((urlPart, urlIdx) => {
      if (urlRegex.test(urlPart)) {
        return (
          <a key={`${index}-${urlIdx}`} href={urlPart} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
            {urlPart}
          </a>
        );
      }
      return urlPart;
    });
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
