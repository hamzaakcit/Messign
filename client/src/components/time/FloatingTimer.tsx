import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Play, Square, Trash2, Minimize2, Expand } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { timeApi } from '@/lib/timeApi';
import { onTimeTimerUpdate } from '@/lib/socket';
import { cn } from '@/lib/utils';

interface ActiveTimer {
  id: string;
  projectId?: string | null;
  taskId?: string | null;
  description?: string | null;
  startedAt: string;
}

function formatDuration(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function FloatingTimer() {
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  /** Board view uses a fixed Dora rail on the right; shift timer left so it does not cover the composer. */
  const marketingHubPath = pathname.replace(/\/$/, '') === '/marketing';
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadActiveTimer = async () => {
    if (!userId) return;
    try {
      const active = (await timeApi.getActiveTimer(userId)) as Record<string, unknown> | null;
      if (!active?.id) {
        setTimer(null);
        setElapsed(0);
        return;
      }
      const startedAt = String(active.startedAt ?? active.started_at ?? new Date().toISOString());
      setTimer({
        id: String(active.id),
        projectId: (active.projectId as string | null | undefined) ?? (active.project_id as string | null | undefined),
        taskId: (active.taskId as string | null | undefined) ?? (active.task_id as string | null | undefined),
        description: (active.description as string | null | undefined) ?? null,
        startedAt,
      });
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    } catch {
      setTimer(null);
      setElapsed(0);
    }
  };

  useEffect(() => {
    void loadActiveTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  useEffect(() => {
    const unsub = onTimeTimerUpdate(() => {
      void loadActiveTimer();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleStart = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await timeApi.startTimer(userId, {});
      await loadActiveTimer();
      setExpanded(true);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!userId || !timer || busy) return;
    setBusy(true);
    try {
      await timeApi.stopTimer(userId, timer.id);
      setTimer(null);
      setElapsed(0);
      setExpanded(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!userId || !timer || busy) return;
    setBusy(true);
    try {
      await timeApi.discardTimer(userId, timer.id);
      setTimer(null);
      setElapsed(0);
      setExpanded(false);
    } finally {
      setBusy(false);
    }
  };

  const label = useMemo(() => {
    if (!timer) return 'No active timer';
    const project = timer.projectId ? `Project ${timer.projectId}` : 'General';
    const task = timer.taskId ? `• Task ${timer.taskId}` : '';
    return `${project} ${task}`.trim();
  }, [timer]);

  if (!userId) return null;

  return (
    <div
      className={`fixed bottom-[80px] z-40 ${marketingHubPath ? 'right-[300px]' : 'right-5'}`}
    >
      {!timer ? (
        <button
          data-testid="timer-start"
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="flex items-center gap-2 rounded-full border border-app-border bg-app-card px-4 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover transition-colors"
        >
          <Play className="w-4 h-4" />
          <span>Start Timer</span>
        </button>
      ) : (
        <div
          data-testid="timer-running"
          className={cn(
            'rounded-xl border border-emerald-500/30 bg-app-card shadow-lg transition-all',
            expanded ? 'w-[320px] p-3' : 'w-auto px-3 py-2',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-sm text-app">{formatDuration(elapsed)}</span>
            {!expanded ? (
              <>
                <span className="max-w-[140px] truncate text-xs text-app-muted">{label}</span>
                <button data-testid="timer-expand" type="button" onClick={() => setExpanded(true)} className="ml-auto text-app-muted hover:text-app" aria-label="Expand">
                  <Expand className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setExpanded(false)} className="ml-auto text-app-muted hover:text-app" aria-label="Minimize">
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-app-border bg-app px-3 py-2">
                <p className="text-xs text-app-muted">{label}</p>
                {timer.description && <p className="mt-1 text-sm text-app">{timer.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-red-500/90 px-3 py-2 text-sm font-medium text-app-text hover:bg-red-500"
                >
                  <span className="inline-flex items-center gap-1"><Square className="w-4 h-4" />Stop</span>
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={busy}
                  className="rounded-lg border border-app-border px-3 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover"
                >
                  <span className="inline-flex items-center gap-1"><Trash2 className="w-4 h-4" />Discard</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
