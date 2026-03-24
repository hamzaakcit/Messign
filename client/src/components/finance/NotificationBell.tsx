import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceNotification } from '@/lib/financeApi';
import { Bell, Check, CheckCheck, FileText, DollarSign, AlertTriangle, Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, typeof Bell> = {
  expense_approved: Check,
  expense_flagged: AlertTriangle,
  expense_rejected: X,
  invoice_paid: DollarSign,
  invoice_overdue: AlertTriangle,
  budget_alert: AlertTriangle,
  ai_decision: Bot,
  default: FileText,
};

interface Props {
  onNavigate?: (entityType: string, entityId: string) => void;
}

export function NotificationBell({ onNavigate }: Props) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [notifications, setNotifications] = useState<FinanceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await financeAPI.getNotifications(userId);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {}
  }, [userId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await financeAPI.markNotificationRead(userId, id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await financeAPI.markAllNotificationsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (n: FinanceNotification) => {
    if (!n.is_read) handleMarkRead(n.id);
    if (n.entity_type && n.entity_id && onNavigate) {
      onNavigate(n.entity_type, n.entity_id);
      setOpen(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className="relative p-2 text-app-muted hover:text-app-text hover:bg-white/5 rounded-lg transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-app-text text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a2e] shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h4 className="text-sm font-semibold text-app-text">Notifications</h4>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-app-muted text-sm">No notifications</div>
            ) : (
              notifications.slice(0, 30).map((n) => {
                const Icon = TYPE_ICONS[n.type] || TYPE_ICONS.default;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5',
                      !n.is_read && 'bg-primary-500/5',
                    )}
                  >
                    <div className={cn('mt-0.5 p-1.5 rounded-lg shrink-0',
                      n.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                      n.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-white/10 text-app-muted'
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', n.is_read ? 'text-app-muted' : 'text-app-text font-medium')}>{n.title}</p>
                      <p className="text-xs text-app-muted mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-app-muted mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
