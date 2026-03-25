import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryObserverResult } from '@tanstack/react-query';
import {
  marketingAPI,
  type BrandProfileClient,
  type Campaign,
  type CommandCenterPayload,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
  type Lead,
  type LeadFunnelMetrics,
} from '@/lib/marketingApi';
import { marketingQueryKeys } from '../lib/marketingQueryKeys';

export interface UseMarketingWorkspaceOptions {
  userId: string;
  accessToken: string | null | undefined;
  ccDays: number;
  brandFilter: string | null;
}

function toErr(e: unknown): Error | null {
  if (e == null) return null;
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Unified marketing data: bootstrap, funnel, brands, and command-center bundle with single invalidation.
 */
export function useMarketingWorkspace(options: UseMarketingWorkspaceOptions): {
  metrics: DashboardMetrics | null;
  campaigns: Campaign[];
  content: ContentItem[];
  emailCampaigns: EmailCampaign[];
  hotLeads: Lead[];
  funnel: LeadFunnelMetrics | null;
  brandList: BrandProfileClient[];
  metricsLoading: boolean;
  bootstrapError: Error | null;
  funnelError: Error | null;
  brandsError: Error | null;
  ccData: CommandCenterPayload | null;
  ccLoading: boolean;
  ccError: Error | null;
  patchCcLocal: (
    partial: Partial<CommandCenterPayload> | ((prev: CommandCenterPayload | null) => CommandCenterPayload | null),
  ) => void;
  invalidateWorkspace: () => Promise<void>;
  refreshCommandCenter: (opts?: { fresh?: boolean }) => Promise<void>;
  refetchBootstrap: () => Promise<QueryObserverResult<Awaited<ReturnType<typeof marketingAPI.getDashboardBootstrap>>, Error>>;
  refetchFunnel: () => Promise<QueryObserverResult<Awaited<ReturnType<typeof marketingAPI.getLeadFunnel>>, Error>>;
  refetchBrands: () => Promise<QueryObserverResult<Awaited<ReturnType<typeof marketingAPI.listBrandProfiles>>, Error>>;
} {
  const { userId, accessToken, ccDays, brandFilter } = options;
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && accessToken);

  const bootstrapQuery = useQuery({
    queryKey: marketingQueryKeys.bootstrap(userId),
    queryFn: () => marketingAPI.getDashboardBootstrap(userId, undefined, { fresh: true }),
    enabled,
  });
  const { refetch: refetchBootstrap } = bootstrapQuery;

  const funnelQuery = useQuery({
    queryKey: marketingQueryKeys.funnel(userId),
    queryFn: () => marketingAPI.getLeadFunnel(userId),
    enabled,
  });
  const { refetch: refetchFunnel } = funnelQuery;

  const brandsQuery = useQuery({
    queryKey: marketingQueryKeys.brands(userId),
    queryFn: () => marketingAPI.listBrandProfiles(userId),
    enabled,
  });
  const { refetch: refetchBrands } = brandsQuery;

  const ccQuery = useQuery({
    queryKey: marketingQueryKeys.commandCenter(userId, ccDays, brandFilter),
    queryFn: () =>
      marketingAPI.getCommandCenter(userId, {
        days: ccDays,
        brandId: brandFilter ?? undefined,
      }),
    enabled,
  });

  const patchCcLocal = useCallback(
    (
      partial: Partial<CommandCenterPayload> | ((prev: CommandCenterPayload | null) => CommandCenterPayload | null),
    ) => {
      queryClient.setQueryData<CommandCenterPayload | null>(
        marketingQueryKeys.commandCenter(userId, ccDays, brandFilter),
        (prev) => {
          if (typeof partial === 'function') {
            return partial(prev ?? null);
          }
          if (!prev) return prev;
          return { ...prev, ...partial };
        },
      );
    },
    [queryClient, userId, ccDays, brandFilter],
  );

  const refreshCommandCenter = useCallback(
    async (opts?: { fresh?: boolean }) => {
      if (!enabled) return;
      try {
        await queryClient.fetchQuery({
          queryKey: marketingQueryKeys.commandCenter(userId, ccDays, brandFilter),
          queryFn: () =>
            marketingAPI.getCommandCenter(userId, {
              days: ccDays,
              brandId: brandFilter ?? undefined,
              fresh: opts?.fresh ?? false,
            }),
        });
      } catch {
        await queryClient.invalidateQueries({
          queryKey: marketingQueryKeys.commandCenter(userId, ccDays, brandFilter),
        });
      }
    },
    [queryClient, userId, ccDays, brandFilter, enabled],
  );

  const invalidateWorkspace = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: marketingQueryKeys.all });
  }, [queryClient]);

  const brandList = useMemo(() => {
    const profiles = brandsQuery.data?.profiles ?? [];
    return profiles.filter((b) => b.active).sort((a, b) => a.brand_name.localeCompare(b.brand_name));
  }, [brandsQuery.data?.profiles]);

  const bootstrap = bootstrapQuery.data;
  const metricsLoading = Boolean(enabled && (bootstrapQuery.isPending || funnelQuery.isPending));

  return {
    metrics: bootstrap?.metrics ?? null,
    campaigns: bootstrap?.campaigns.data ?? [],
    content: bootstrap?.content.data ?? [],
    emailCampaigns: bootstrap?.emailCampaigns.data ?? [],
    hotLeads: bootstrap?.hotLeads ?? [],
    funnel: funnelQuery.data ?? null,
    brandList,
    metricsLoading,
    bootstrapError: toErr(bootstrapQuery.error),
    funnelError: toErr(funnelQuery.error),
    brandsError: toErr(brandsQuery.error),
    ccData: ccQuery.data ?? null,
    ccLoading: ccQuery.isPending,
    ccError: toErr(ccQuery.error),
    patchCcLocal,
    invalidateWorkspace,
    refreshCommandCenter,
    refetchBootstrap,
    refetchFunnel,
    refetchBrands,
  };
}
