import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doraBriefingAPI, type DailyBriefing } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { Bot } from 'lucide-react';

const STORAGE_KEY = 'lastBriefingToast';
const AUTO_DISMISS_MS = 10000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MorningBriefingToast() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [shown, setShown] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user?.id || shown) return;
    const last = localStorage.getItem(STORAGE_KEY);
    const today = todayKey();
    if (last === today) return;

    const userId = user.authUserId || user.id || '';
    doraBriefingAPI.getToday(userId)
      .then((briefing: DailyBriefing) => {
        if (!mountedRef.current) return;
        const name = user.name?.split(' ')[0] ?? 'there';
        const firstMetric = briefing.sections[0]?.items[0]?.text ?? briefing.sections[0]?.title ?? briefing.summary?.slice(0, 80);
        toast.info(
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-app-text">Good morning, {name}</p>
              <p className="text-sm text-app-muted mt-0.5 line-clamp-2">{firstMetric}</p>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(STORAGE_KEY, today);
                  navigate('/dora/briefing');
                }}
                className="mt-2 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
              >
                View full briefing →
              </button>
            </div>
          </div>,
          {
            duration: AUTO_DISMISS_MS,
            onDismiss: () => localStorage.setItem(STORAGE_KEY, today),
          }
        );
        setShown(true);
      })
      .catch(() => {});
  }, [user?.id, user?.name, shown, navigate]);

  return null;
}
