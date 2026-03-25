import { useQuery } from '@tanstack/react-query';
import { bountiesAPI } from '@/lib/api';
import type { SideOpItem } from '@/pages/projects/types';

export const openBountiesQueryKey = (userId: string): readonly string[] => ['bounties-open', userId];

/**
 * Cached OPEN bounties for the Opportunity Hub (aligned with marketplace query).
 */
export function useOpenBountiesQuery(userId: string | undefined): {
  data: SideOpItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: openBountiesQueryKey(userId ?? ''),
    queryFn: async () => {
      const data = await bountiesAPI.list({ status: 'OPEN' });
      const list = Array.isArray((data as { bounties?: SideOpItem[] }).bounties)
        ? (data as { bounties: SideOpItem[] }).bounties
        : [];
      return list;
    },
    enabled: Boolean(userId),
  });
  return {
    data: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof Error ? q.error : null,
    refetch: () => {
      void q.refetch();
    },
  };
}
