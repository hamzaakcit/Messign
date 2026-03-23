import { useEffect, useState } from 'react';
import { notificationsAPI, type AppNotification } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!userId) return;
    notificationsAPI.list(userId, { limit: 100 }).then(setItems).catch(() => setItems([]));
  }, [userId]);

  return (
    <div className="h-[calc(100vh-48px)] overflow-y-auto p-4 md:p-6 bg-app">
      <div className="rounded-xl border border-app bg-app-card p-5 mb-4">
        <h1 className="text-2xl font-bold text-app">Notifications</h1>
      </div>
      <div className="rounded-xl border border-app bg-app-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-6 text-sm text-app-muted">No notifications</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3 border-b border-app">
              <div className="text-sm font-medium text-app">{item.title}</div>
              <div className="text-xs text-app-muted">{item.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
