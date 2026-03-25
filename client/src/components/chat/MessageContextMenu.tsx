import { useEffect, useRef } from 'react';
import { Copy, Pin, Pencil, Trash2, ListChecks } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { chatAPI } from '@/lib/api';

export function MessageContextMenu() {
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

  if (!message || !position) return null;

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
        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-app hover:bg-app-hover transition-colors">
          <ListChecks className="w-4 h-4 text-app-muted" /> Create task
        </button>
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
      </div>
    </>
  );
}
