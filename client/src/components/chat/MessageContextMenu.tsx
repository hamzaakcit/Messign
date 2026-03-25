import { useEffect, useRef, useState } from 'react';
import { Copy, Pin, Pencil, Trash2, ListChecks, MessageSquare, Sparkles } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { chatAPI, fetchAPI } from '@/lib/api';
import { toast } from 'sonner';
import type { DoraTransformAction } from '@/types';
import { DoraMessageResultModal } from './DoraMessageResultModal';

export function MessageContextMenu() {
  const [doraOpen, setDoraOpen] = useState(false);
  const [doraTitle, setDoraTitle] = useState('');
  const [doraBody, setDoraBody] = useState('');
  const [doraLoading, setDoraLoading] = useState(false);

  const message = useChatStore((s) => s.contextMenuMessage);
  const position = useChatStore((s) => s.contextMenuPosition);
  const closeContextMenu = useChatStore((s) => s.closeContextMenu);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const currentUser = useAuthStore((s) => s.user);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwnMessage = message?.userId === currentUser?.id;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeContextMenu]);

  if (!message || !position) {
    return (
      <DoraMessageResultModal
        open={doraOpen}
        title={doraTitle}
        body={doraBody}
        loading={doraLoading}
        onClose={() => setDoraOpen(false)}
      />
    );
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.y, window.innerHeight - 250),
    left: Math.min(position.x, window.innerWidth - 200),
    zIndex: 100,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    closeContextMenu();
  };

  const handlePin = async () => {
    try {
      await chatAPI.togglePin(message.channelId, message.id);
    } catch { /* handled by socket */ }
    closeContextMenu();
  };

  const handleEdit = () => {
    setEditingMessage(message.id);
    closeContextMenu();
  };

  const handleDelete = async () => {
    try {
      await chatAPI.deleteMessage(message.channelId, message.id);
    } catch { /* handled by socket */ }
    closeContextMenu();
  };

  const runDora = async (action: DoraTransformAction, title: string) => {
    const channelId = message.channelId;
    const messageId = message.id;
    closeContextMenu();
    if (!channelId || !messageId) return;
    setDoraTitle(title);
    setDoraBody('');
    setDoraOpen(true);
    setDoraLoading(true);
    try {
      const out = await chatAPI.doraTransformMessage(channelId, messageId, { action });
      setDoraBody(out.text || '');
      if (out.text) {
        await chatAPI.awardChatXP(channelId, 'chat.dora.transform_used').catch(() => {});
      }
    } catch {
      setDoraBody('Something went wrong. Try again.');
    } finally {
      setDoraLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[99]" />
      <div ref={menuRef} style={menuStyle} className="bg-app-sidebar border border-app rounded-xl shadow-2xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-150">
        <button onClick={handleCopy} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
          <Copy className="w-4 h-4 text-app-muted" /> Copy text
        </button>
        <button onClick={handlePin} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
          <Pin className="w-4 h-4 text-app-muted" /> {message.isPinned ? 'Unpin' : 'Pin'} message
        </button>
        <button
          onClick={async () => {
            closeContextMenu();
            try {
              const title = message.content.slice(0, 200);
              await fetchAPI('/tasks', {
                method: 'POST',
                body: JSON.stringify({ title, description: `Created from chat message`, priority: 'medium', status: 'todo' }),
              });
              await chatAPI.awardChatXP(message.channelId, 'chat.task.created_from_chat').catch(() => {});
              toast.success('Task created from message');
            } catch {
              toast.error('Failed to create task');
            }
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors"
        >
          <ListChecks className="w-4 h-4 text-app-muted" /> Create task
        </button>
        {!message.threadId && (
          <button
            onClick={() => {
              useChatStore.getState().openThread(message.id);
              closeContextMenu();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-app-muted" /> Reply in thread
          </button>
        )}
        {isOwnMessage && (
          <>
            <div className="my-1 h-px bg-app" />
            <button onClick={handleEdit} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
              <Pencil className="w-4 h-4 text-app-muted" /> Edit message
            </button>
            <button onClick={handleDelete} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" /> Delete message
            </button>
          </>
        )}
        <div className="my-1 h-px bg-app" />
        <p className="px-3 py-1 text-[10px] font-semibold text-app-muted uppercase flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" aria-hidden /> Dora
        </p>
        <button type="button" onClick={() => runDora('explain', 'Explain message')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
          Explain
        </button>
        <button type="button" onClick={() => runDora('shorten', 'Shorten message')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
          Shorten
        </button>
      </div>
      <DoraMessageResultModal
        open={doraOpen}
        title={doraTitle}
        body={doraBody}
        loading={doraLoading}
        onClose={() => setDoraOpen(false)}
      />
    </>
  );
}
