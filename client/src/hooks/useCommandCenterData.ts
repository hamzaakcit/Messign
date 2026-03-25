import { useCallback, useEffect, useRef, useState } from 'react';
import { commandCenterAPI } from '@/lib/commandCenterApi';
import { getSocket } from '@/lib/socket';
import type { CommandCenterDTO } from '@/types/command-center';

const REFRESH_MS = 60_000;

export interface UseCommandCenterDataResult {
  data: CommandCenterDTO | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads Command Center aggregates with polling and socket-driven invalidation.
 */
export function useCommandCenterData(userId: string | undefined): UseCommandCenterDataResult {
  const [data, setData] = useState<CommandCenterDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (silent: boolean) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await commandCenterAPI.get(userId);
        if (mounted.current) setData(next);
      } catch (e) {
        if (mounted.current) {
          setError(e instanceof Error ? e.message : 'Failed to load command center');
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
    void load(false);
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const handler = (): void => {
      void load(true);
    };
    const s = getSocket();
    s.on('activity:new', handler);
    s.on('xp:gained', handler);
    return () => {
      s.off('activity:new', handler);
      s.off('xp:gained', handler);
    };
  }, [userId, load]);

  return {
    data,
    loading,
    error,
    refreshing,
    refetch: () => load(false),
  };
}
