import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsAPI, type AppNotification } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

const MODULE_COLORS: Record<string, string> = {
  finance: '#10b981',
  crm: '#3b82f6',
  support: '#f59e0b',
  recruitment: '#8b5cf6',
  time: '#06b6d4',
  marketing: '#ec4899',
  dora: '#a78bfa',
};

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    if (!userId) return;
    const [list, count] = await Promise.all([
      notificationsAPI.list(userId, { limit: 20 }),
      notificationsAPI.unreadCount(userId),
    ]);
    setItems(list);
    setUnreadCount(count.count);
  };

  useEffect(() => {
    void load();
  }, [userId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: any) => {
      if ((payload?.userId ?? '') !== (user?.id ?? '')) return;
      setItems((prev) => [
        {
          id: payload.id || crypto.randomUUID(),
          user_id: payload.userId,
          type: payload.type || 'notification',
          title: payload.title || 'Notification',
          message: payload.message || '',
          link: payload.link || null,
          module: payload.module || null,
          severity: payload.severity || 'info',
          is_read: false,
          created_at: payload.createdAt || new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20));
      setUnreadCount((c) => c + 1);
    };
    s.on('notification:new', handler);
    return () => {
      s.off('notification:new', handler);
    };
  }, [user?.id]);

  const markOneRead = async (id: string) => {
    if (!userId) return;
    await notificationsAPI.markRead(userId, id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const openItem = async (item: AppNotification) => {
    if (!item.is_read) {
      await markOneRead(item.id);
    }
    if (item.link) navigate(item.link);
    setOpen(false);
  };

  const markAll = async () => {
    if (!userId) return;
    await notificationsAPI.markAllRead(userId);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[400px] rounded-xl border border-app bg-app-card shadow-lg z-50 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-app flex items-center justify-between">
            <div className="text-sm font-semibold text-app">Notifications</div>
            <button className="text-xs text-cyan-300 hover:text-cyan-200" onClick={markAll}>Mark all read</button>
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-app-muted">No notifications · ✦</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void openItem(item)}
                  className={`w-full text-left px-3 py-2 border-b border-app hover:bg-app-hover ${!item.is_read ? 'border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex gap-2">
                    <span
                      className="mt-1 h-2 w-2 rounded-full"
                      style={{ backgroundColor: MODULE_COLORS[item.module || ''] || '#64748b' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-app truncate">{item.title}</div>
                      <div className="text-xs text-app-muted truncate">{item.message || ''}</div>
                      <div className="text-[11px] text-app-muted mt-0.5">{rel(item.created_at)} ago</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-app">
            <button className="text-xs text-cyan-300 hover:text-cyan-200" onClick={() => { navigate('/notifications'); setOpen(false); }}>
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
