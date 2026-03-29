import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@/types';
import { PresenceAvatar } from './PresenceAvatar';
import { cn } from '@/lib/utils';

interface UserHoverCardProps {
  user: User;
  children: React.ReactNode;
  className?: string;
}

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 120;

/**
 * Lightweight hover profile card (no Radix) — keeps users in the chat view.
 */
export function UserHoverCard({ user, children, className }: UserHoverCardProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const clearShow = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearHide();
    clearShow();
    showTimer.current = setTimeout(() => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cardW = 260;
      let left = r.left + r.width / 2 - cardW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - cardW - 8));
      let top = r.bottom + 8;
      if (top + 140 > window.innerHeight) {
        top = r.top - 8 - 120;
      }
      setPos({ top, left });
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearHide, clearShow]);

  const scheduleHide = useCallback(() => {
    clearShow();
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearShow]);

  useEffect(() => () => {
    clearShow();
    clearHide();
  }, [clearShow, clearHide]);

  return (
    <span
      ref={wrapRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      {children}
      {open && (
        <div
          className="fixed z-[80] w-[260px] rounded-xl border border-app bg-app-sidebar/95 backdrop-blur-xl shadow-xl p-3 pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          <div className="flex items-start gap-3">
            <PresenceAvatar user={user} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-app truncate">{user.name}</p>
              {user.jobTitle && <p className="text-[12px] text-app-muted truncate">{user.jobTitle}</p>}
              {user.department && !user.jobTitle && (
                <p className="text-[12px] text-app-muted truncate">{user.department}</p>
              )}
              {user.email && (
                <p className="text-[11px] text-app-muted/90 truncate mt-1">{user.email}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
