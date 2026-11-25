import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  type BrandProfileClient,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
} from '@/lib/marketingApi';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import type { ApprovalQueueItem } from './approvalQueue/types';
import { useMarketingWorkspace } from './hooks/useMarketingWorkspace';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetailTarget =
  | { type: 'content'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'email'; id: string }
  | null;

interface MarketingContextValue {
  // === Workspace data ===
  metrics: DashboardMetrics | null;
  campaigns: Campaign[];
  content: ContentItem[];
  filteredContent: ContentItem[];
  emailCampaigns: EmailCampaign[];
  brandList: BrandProfileClient[];
  metricsLoading: boolean;
  bootstrapError: Error | null;
  brandsError: Error | null;
  approvalItems: ApprovalQueueItem[];

  // === Detail panel ===
  detail: DetailTarget;
  /** Increments when Lucy finishes a pinned content write so the open panel refetches. */
  detailRefreshKey: number;
  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;
  bumpContentDetail: () => void;

  // === Workspace actions ===
  invalidateWorkspace: () => Promise<void>;
  refetchBootstrap: () => Promise<unknown>;
  refetchBrands: () => Promise<unknown>;
  approveItem: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MarketingContext = createContext<MarketingContextValue | null>(null);

export function useMarketingContext(): MarketingContextValue {
  const ctx = useContext(MarketingContext);
  if (!ctx) throw new Error('useMarketingContext must be used within <MarketingProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MarketingProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.authUserId || user?.id || '';

  // --- Local UI state ---
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // --- Data hooks ---
  const workspace = useMarketingWorkspace({ userId, accessToken });
  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId && accessToken ? userId : undefined,
  );

  // --- Computed ---
  const filteredContent = useMemo(
    () => workspace.content.filter((c) => (c.content_type ?? '') !== 'offer'),
    [workspace.content],
  );

  // --- Detail panel ---
  const openDetail = useCallback((target: DetailTarget) => setDetail(target), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const bumpContentDetail = useCallback(() => setDetailRefreshKey((n) => n + 1), []);

  // --- Context value (stable via useMemo) ---
  const value = useMemo<MarketingContextValue>(
    () => ({
      // Workspace data
      metrics: workspace.metrics,
      campaigns: workspace.campaigns,
      content: workspace.content,
      filteredContent,
      emailCampaigns: workspace.emailCampaigns,
      brandList: workspace.brandList,
      metricsLoading: workspace.metricsLoading,
      bootstrapError: workspace.bootstrapError,
      brandsError: workspace.brandsError,
      approvalItems,

      // Detail panel
      detail,
      detailRefreshKey,
      openDetail,
      closeDetail,
      bumpContentDetail,

      // Actions
      invalidateWorkspace: workspace.invalidateWorkspace,
      refetchBootstrap: workspace.refetchBootstrap,
      refetchBrands: workspace.refetchBrands,
      approveItem,
    }),
    [
      workspace.metrics, workspace.campaigns, workspace.content, workspace.emailCampaigns,
      workspace.brandList, workspace.metricsLoading,
      workspace.bootstrapError, workspace.brandsError,
      workspace.invalidateWorkspace,
      workspace.refetchBootstrap, workspace.refetchBrands,
      filteredContent, approvalItems, approveItem,
      detail, detailRefreshKey, openDetail, closeDetail, bumpContentDetail,
    ],
  );

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
