import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  Zap,
  Award,
  Mail,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import { useNotificationStore, type Notification, type NotificationType } from '@/stores/notificationStore';

function getNotificationIcon(type: NotificationType) {
  const iconProps = { className: 'w-5 h-5', strokeWidth: 2.5 };
  switch (type) {
    case 'xp_awarded':
      return <Zap {...iconProps} className="w-5 h-5 text-yellow-400" />;
    case 'badge_earned':
      return <Award {...iconProps} className="w-5 h-5 text-amber-400" />;
    case 'admin_message':
      return <Mail {...iconProps} className="w-5 h-5 text-blue-400" />;
    case 'level_up':
      return <TrendingUp {...iconProps} className="w-5 h-5 text-green-400" />;
    default:
      return <Bell {...iconProps} className="w-5 h-5 text-app-muted" />;
  }
}

function getIconBackground(type: NotificationType): string {
  switch (type) {
    case 'xp_awarded':
      return 'bg-gradient-to-br from-yellow-500/15 to-yellow-600/10 border border-yellow-500/30 shadow-[0_0_20px_rgba(251,191,36,0.2)]';
    case 'badge_earned':
      return 'bg-gradient-to-br from-amber-500/15 to-amber-600/10 border border-amber-500/30';
    case 'admin_message':
      return 'bg-gradient-to-br from-blue-500/15 to-blue-600/10 border border-blue-500/30';
    case 'level_up':
      return 'bg-gradient-to-br from-green-500/15 to-green-600/10 border border-green-500/30';
    default:
      return 'bg-gradient-to-br from-gray-500/15 to-gray-600/10 border border-gray-500/30';
  }
}

const PANEL_BG = '#0f172a';
const HEADER_FOOTER_BG = '#1e293b';
const ROW_BG_READ = '#0f172a';
const ROW_BG_UNREAD = '#1e293b';
const BORDER = '#334155';

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, right: 0 });
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotificationStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inTrigger = panelRef.current?.contains(target);
      const inPanel = panelContainerRef.current?.contains(target);
      if (!inTrigger && !inPanel) setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleEscKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  const filtered =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      const isAdminMessage = notification.type === 'admin_message';
      navigate(notification.actionUrl, {
        state: isAdminMessage ? { openAdminMessages: true } : undefined,
      });
      setIsOpen(false);
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    markAsRead(id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteNotification(id);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-app-muted hover:text-app-text hover:bg-app-nav-hover transition-all duration-200 group"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Bell
          className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
            unreadCount > 0 ? 'animate-pulse' : ''
          }`}
        />
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 bg-red-500 text-app-text text-xs font-bold rounded-full flex items-center justify-center shadow-lg shadow-red-500/50">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full animate-ping opacity-75" />
          </>
        )}
      </button>

      {/* Panel - portal + fixed position + 100% opaque so always on top and readable */}
      {isOpen &&
        createPortal(
          <div
            ref={panelContainerRef}
            className="fixed w-[420px] max-h-[min(600px,calc(100vh-100px))] rounded-2xl flex flex-col overflow-hidden animate-slide-in-down"
            style={{
              top: panelPosition.top,
              right: panelPosition.right,
              zIndex: 2147483647,
              backgroundColor: PANEL_BG,
              border: `1px solid ${BORDER}`,
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06) inset',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0 sticky top-0 z-10 h-16 border-b"
              style={{ borderColor: BORDER, backgroundColor: HEADER_FOOTER_BG }}
            >
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-app-text/90" />
              <h3 className="text-lg font-bold text-app-text">Notifications</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  navigate('/settings');
                  setIsOpen(false);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text/60 hover:text-app-text hover:bg-app-nav-hover active:scale-95 transition-all duration-200"
                title="Notification settings"
                aria-label="Notification settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-app-text/60 hover:text-app-text hover:bg-app-nav-hover active:scale-95 transition-all duration-200"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div
            className="flex gap-2 px-5 py-3 flex-shrink-0"
            style={{ backgroundColor: PANEL_BG }}
          >
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                filter === 'all'
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-app-text border border-slate-600/50'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                filter === 'unread'
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-app-text border border-slate-600/50'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* List */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain min-h-0"
            style={{ backgroundColor: PANEL_BG }}
          >
            {filtered.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-20 px-10 text-center"
                style={{ backgroundColor: PANEL_BG }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: HEADER_FOOTER_BG }}
                >
                  <Bell className="w-8 h-8 text-slate-500" />
                </div>
                <h4 className="text-base font-semibold text-app-text/80 mb-2">
                  {filter === 'unread' ? "You're all caught up!" : 'No new notifications'}
                </h4>
                <p className="text-sm text-app-text/50">
                  {filter === 'unread'
                    ? 'Great job staying on top of things! 🎉'
                    : 'Notifications will appear here when you receive them'}
                </p>
              </div>
            ) : (
              <div>
                {filtered.map((notification) => (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(notification)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNotificationClick(notification);
                      }
                    }}
                    className={`group relative px-5 py-4 cursor-pointer transition-all duration-150 border-b hover:translate-x-0.5 active:scale-[0.99] border-l-[3px] hover:!bg-[#334155] ${
                      !notification.read ? 'border-l-blue-500' : 'border-l-transparent'
                    }`}
                    style={{
                      borderColor: BORDER,
                      backgroundColor: !notification.read ? ROW_BG_UNREAD : ROW_BG_READ,
                      borderLeftColor: !notification.read ? '#3b82f6' : 'transparent',
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${getIconBackground(notification.type)}`}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm text-app-text leading-tight mb-1 line-clamp-1">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-app-text/70 leading-snug mb-2 line-clamp-2">
                          {notification.message}
                        </p>

                        {notification.metadata && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {notification.metadata.xpAmount != null && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                <Zap className="w-3 h-3" />
                                +{notification.metadata.xpAmount} MP
                              </span>
                            )}
                            {notification.metadata.badge && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Award className="w-3 h-3" />
                                {notification.metadata.badge.name}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-app-text/40 font-medium">
                            {formatDistanceToNow(new Date(notification.timestamp), {
                              addSuffix: true,
                            })}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {!notification.read && (
                              <button
                                type="button"
                                onClick={(e) => handleMarkAsRead(e, notification.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-app-text/60 hover:bg-green-500/10 hover:text-green-400 hover:scale-110 transition-all duration-150"
                                title="Mark as read"
                                aria-label="Mark as read"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleDelete(e, notification.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-app-text/60 hover:bg-red-500/10 hover:text-red-400 hover:scale-110 transition-all duration-150"
                              title="Delete"
                              aria-label="Delete notification"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {notification.actionUrl && (
                              <ChevronRight className="w-4 h-4 text-app-text/40 ml-0.5" />
                            )}
                          </div>
                        </div>
                      </div>

                      {!notification.read && (
                        <div className="flex-shrink-0 pt-1">
                          <span
                            className="block w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse"
                            style={{ position: 'relative', top: 0, right: 0 }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {filtered.length > 0 && (
            <div
              className="flex gap-2 px-5 py-3 flex-shrink-0 border-t"
              style={{ borderColor: BORDER, backgroundColor: HEADER_FOOTER_BG }}
            >
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/15 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <CheckCheck className="w-4 h-4" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 bg-app-surface-tertiary text-app-text/80 border border-app-border hover:bg-app-hover hover:-translate-y-0.5 active:translate-y-0"
              >
                <Trash2 className="w-4 h-4" />
                Clear all
              </button>
            </div>
          )}
        </div>,
        document.body
        )}
    </div>
  );
}
