import { useQuery } from '@tanstack/react-query';
import { projectsAPI, type MarketplaceProject } from '@/lib/api';
import { mountsFrozenModules } from '@/lib/productSurface';

export const marketplaceProjectsQueryKey = (userId: string): readonly string[] => ['marketplace-projects', userId];

/**
 * Shared TanStack Query cache for GET /projects/marketplace (Opportunity Hub + sidebar).
 */
export function useMarketplaceProjectsQuery(userId: string | undefined): {
  data: MarketplaceProject[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: marketplaceProjectsQueryKey(userId ?? ''),
    queryFn: async () => {
      const raw = await projectsAPI.getMarketplace();
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(userId) && mountsFrozenModules(),
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
