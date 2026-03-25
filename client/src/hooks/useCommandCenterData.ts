import { useCallback, useEffect, useRef, useState } from 'react';
import { commandCenterAPI } from '@/lib/commandCenterApi';
import { getSocket } from '@/lib/socket';
import type { CommandCenterDTO } from '@/types/command-center';

const REFRESH_MS = 60_000;
/** Batch rapid task socket events so we do not hammer the command-center API. */
const TASK_SOCKET_DEBOUNCE_MS = 10_000;
/** Chat messages are high-frequency; refresh workspace/chat slice after activity settles. */
const CHAT_SOCKET_DEBOUNCE_MS = 45_000;

export interface UseCommandCenterDataResult {
  data: CommandCenterDTO | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads Command Center aggregates with polling and socket-driven invalidation.
 * Socket: immediate refresh on `activity:new` / `xp:gained`; debounced on `task:updated`,
 * `message:new`, and `thread:reply` to limit API load.
 *
 * Server may serve a short Redis cache on the first load; polling, socket refreshes, and
 * explicit refetch pass `?refresh=1` so those paths always recompute.
 */
export function useCommandCenterData(userId: string | undefined): UseCommandCenterDataResult {
  const [data, setData] = useState<CommandCenterDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const taskRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (silent: boolean, bypassCache: boolean) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await commandCenterAPI.get(userId, { refresh: bypassCache });
        if (mounted.current) setData(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load command center';
        console.error('[useCommandCenterData]', msg, e);
        if (mounted.current) {
          setError(msg);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    void load(false, false);
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => void load(true, true), REFRESH_MS);
    return () => clearInterval(t);
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const handler = (): void => {
      void load(true, true);
    };
    const onTaskUpdated = (): void => {
      if (taskRefreshTimer.current) clearTimeout(taskRefreshTimer.current);
      taskRefreshTimer.current = setTimeout(() => {
        taskRefreshTimer.current = null;
        void load(true, true);
      }, TASK_SOCKET_DEBOUNCE_MS);
    };
    const onChatActivity = (): void => {
      if (chatRefreshTimer.current) clearTimeout(chatRefreshTimer.current);
      chatRefreshTimer.current = setTimeout(() => {
        chatRefreshTimer.current = null;
        void load(true, true);
      }, CHAT_SOCKET_DEBOUNCE_MS);
    };
    const s = getSocket();
    s.on('activity:new', handler);
    s.on('xp:gained', handler);
    s.on('task:updated', onTaskUpdated);
    s.on('message:new', onChatActivity);
    s.on('thread:reply', onChatActivity);
    return () => {
      if (taskRefreshTimer.current) clearTimeout(taskRefreshTimer.current);
      taskRefreshTimer.current = null;
      if (chatRefreshTimer.current) clearTimeout(chatRefreshTimer.current);
      chatRefreshTimer.current = null;
      s.off('activity:new', handler);
      s.off('xp:gained', handler);
      s.off('task:updated', onTaskUpdated);
      s.off('message:new', onChatActivity);
      s.off('thread:reply', onChatActivity);
    };
  }, [userId, load]);

  return {
    data,
    loading,
    error,
    refreshing,
    refetch: () => load(false, true),
  };
}
