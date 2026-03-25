import { useState } from 'react';
import { Bell } from 'lucide-react';

/**
 * Soft prompt to enable desktop notifications when permission is still "default".
 */
export function ChatNotificationPrompt() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return null;
  if (Notification.permission !== 'default') return null;

  return (
    <div className="mx-auto mb-2 flex max-w-4xl items-center justify-between gap-3 rounded-xl border border-app/80 bg-app-card/40 px-3 py-2 text-sm text-app-muted">
      <div className="flex items-center gap-2 min-w-0">
        <Bell className="w-4 h-4 shrink-0 text-primary-400" aria-hidden />
        <span className="min-w-0">
          Enable browser notifications to see new messages when this tab is in the background.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="rounded-lg bg-primary-500/15 px-2.5 py-1 text-xs font-medium text-primary-300 hover:bg-primary-500/25"
          onClick={() => {
            void Notification.requestPermission();
          }}
        >
          Enable
        </button>
        <button
          type="button"
          className="text-xs text-app-muted hover:text-app"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
