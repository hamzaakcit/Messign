import { useCallback, useEffect, useState } from 'react';
import { marketingAPI, type CommandCenterPayload } from '@/lib/marketingApi';

export interface UseMarketingCommandCenterDataOptions {
  userId: string;
  accessToken: string | null | undefined;
  days?: number;
  brandId?: string | null;
}

export interface UseMarketingCommandCenterDataResult {
  data: CommandCenterPayload | null;
  loading: boolean;
  error: Error | null;
  refresh: (opts?: { fresh?: boolean }) => Promise<void>;
  /** Merge local updates (e.g. optimistic campaign status) without refetch. */
  patchLocal: (partial: Partial<CommandCenterPayload> | ((prev: CommandCenterPayload | null) => CommandCenterPayload | null)) => void;
}

/**
 * Loads Command Center bundle; supports manual refresh and optimistic patching.
 */
export function useMarketingCommandCenterData(
  options: UseMarketingCommandCenterDataOptions,
): UseMarketingCommandCenterDataResult {
  const { userId, accessToken, days = 7, brandId } = options;
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(
    async (opts?: { fresh?: boolean }) => {
      if (!userId || !accessToken) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await marketingAPI.getCommandCenter(userId, {
          days,
          brandId: brandId ?? undefined,
          fresh: opts?.fresh,
        });
        setData(payload);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
    },
    [userId, accessToken, days, brandId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patchLocal = useCallback(
    (partial: Partial<CommandCenterPayload> | ((prev: CommandCenterPayload | null) => CommandCenterPayload | null)) => {
      setData((prev) => {
        if (typeof partial === 'function') {
          return partial(prev);
        }
        if (!prev) return prev;
        return { ...prev, ...partial };
      });
    },
    [],
  );

  return { data, loading, error, refresh, patchLocal };
}
