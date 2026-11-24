import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryObserverResult } from '@tanstack/react-query';
import {
  marketingAPI,
  type BrandProfileClient,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
} from '@/lib/marketingApi';
import { marketingQueryKeys } from '../lib/marketingQueryKeys';

export interface UseMarketingWorkspaceOptions {
  userId: string;
  accessToken: string | null | undefined;
}

function toErr(e: unknown): Error | null {
  if (e == null) return null;
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Unified marketing data: bootstrap and brands with single invalidation.
 */
export function useMarketingWorkspace(options: UseMarketingWorkspaceOptions): {
  metrics: DashboardMetrics | null;
  campaigns: Campaign[];
  content: ContentItem[];
  emailCampaigns: EmailCampaign[];
  brandList: BrandProfileClient[];
  metricsLoading: boolean;
  bootstrapError: Error | null;
  brandsError: Error | null;
  invalidateWorkspace: () => Promise<void>;
  refetchBootstrap: () => Promise<QueryObserverResult<Awaited<ReturnType<typeof marketingAPI.getDashboardBootstrap>>, Error>>;
  refetchBrands: () => Promise<QueryObserverResult<Awaited<ReturnType<typeof marketingAPI.listBrandProfiles>>, Error>>;
} {
  const { userId, accessToken } = options;
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && accessToken);

  const bootstrapQuery = useQuery({
    queryKey: marketingQueryKeys.bootstrap(userId),
    queryFn: () => marketingAPI.getDashboardBootstrap(userId, undefined, { fresh: true }),
    enabled,
  });
  const { refetch: refetchBootstrap } = bootstrapQuery;

  const brandsQuery = useQuery({
    queryKey: marketingQueryKeys.brands(userId),
    queryFn: () => marketingAPI.listBrandProfiles(userId),
    enabled,
  });
  const { refetch: refetchBrands } = brandsQuery;

  const invalidateWorkspace = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: marketingQueryKeys.all });
  }, [queryClient]);

  const brandList = useMemo(() => {
    const profiles = brandsQuery.data?.profiles ?? [];
    return profiles.filter((b) => b.active).sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [brandsQuery.data?.profiles]);

  const bootstrap = bootstrapQuery.data;
  const metricsLoading = Boolean(enabled && bootstrapQuery.isPending);

  return {
    metrics: bootstrap?.metrics ?? null,
    campaigns: bootstrap?.campaigns.data ?? [],
    content: bootstrap?.content.data ?? [],
    emailCampaigns: bootstrap?.emailCampaigns.data ?? [],
    brandList,
    metricsLoading,
    bootstrapError: toErr(bootstrapQuery.error),
    brandsError: toErr(brandsQuery.error),
    invalidateWorkspace,
    refetchBootstrap,
    refetchBrands,
  };
}
