import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Mail } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';

export function AdminMessagesPanel() {
  const { notifications } = useNotificationStore();

  const adminMessages = useMemo(
    () =>
      notifications
        .filter((n) => n.type === 'admin_message')
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ),
    [notifications]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
        <Mail className="w-5 h-5 text-blue-400" />
        <div>
          <h3 className="font-semibold text-app-text">Messages from Admin</h3>
          <p className="text-xs text-app-muted">
            Messages sent to you by administrators
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {adminMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-app-muted">
            <Mail className="w-12 h-12 mb-4 text-gray-600" />
            <p className="text-lg font-medium">No admin messages yet</p>
            <p className="text-sm">
              When an admin sends you a message, it will appear here and in your
              notifications.
            </p>
          </div>
        ) : (
          adminMessages.map((n) => (
              <div
                key={n.id}
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/15 border border-blue-500/30">
                    <Mail className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-app-text text-sm mb-1">
                      {n.title}
                    </h4>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                      {n.message}
                    </p>
                    <p className="text-xs text-app-muted mt-2">
                      {formatDistanceToNow(new Date(n.timestamp), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
