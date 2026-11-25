import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import {
  type BrandProfileClient,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
} from '@/lib/marketingApi';
import { ROUTES } from '@/lib/routes';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import type { ApprovalQueueItem } from './approvalQueue/types';
import type { ContentCreatePreset } from './components/ContentCreatePanel';
import { useMarketingWorkspace } from './hooks/useMarketingWorkspace';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetailTarget =
  | { type: 'content'; id: string }
  | { type: 'campaign'; id: string }
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

  // === Create panels ===
  createCampaignOpen: boolean;
  openCreateCampaign: () => void;
  closeCreateCampaign: () => void;
  createContentOpen: boolean;
  contentCreatePreset: ContentCreatePreset;
  openCreateContent: (preset?: ContentCreatePreset) => void;
  closeCreateContent: () => void;

  // === Workspace actions ===
  invalidateWorkspace: () => Promise<void>;
  refetchBootstrap: () => Promise<unknown>;
  refetchBrands: () => Promise<unknown>;
  approveItem: (id: string) => Promise<void>;


  // === Dora / Lucy integration ===
  handleInstagramDraftAi: () => void;
  handleCreateInstagramContent: () => void;
  handleDraftWithMarketingFromPanel: () => void;
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
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.authUserId || user?.id || '';

  // --- Local UI state ---
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createContentOpen, setCreateContentOpen] = useState(false);
  const [contentCreatePreset, setContentCreatePreset] = useState<ContentCreatePreset>('default');

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

  // --- Create panels ---
  const openCreateCampaign = useCallback(() => setCreateCampaignOpen(true), []);
  const closeCreateCampaign = useCallback(() => setCreateCampaignOpen(false), []);

  const openCreateContent = useCallback((preset: ContentCreatePreset = 'default') => {
    setContentCreatePreset(preset);
    setCreateContentOpen(true);
  }, []);

  const closeCreateContent = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
  }, []);

  // --- Dora / Lucy integration ---
  const handleInstagramDraftAi = useCallback(() => {
    navigate(ROUTES.MARKETING_OFFER_NEW);
  }, [navigate]);

  const handleCreateInstagramContent = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
    navigate(ROUTES.MARKETING_OFFER_NEW);
  }, [navigate]);

  const handleDraftWithMarketingFromPanel = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
    navigate(ROUTES.MARKETING_OFFER_NEW);
  }, [navigate]);

  // --- Side effects: location-state-driven navigation ---
  useEffect(() => {
    const st = location.state as {
      openInstagramContent?: boolean;
    } | null;
    if (!st) return;

    let handled = false;
    if (st.openInstagramContent) {
      setContentCreatePreset('instagram');
      setCreateContentOpen(true);
      handled = true;
    }
    if (handled) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

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

      // Create panels
      createCampaignOpen,
      openCreateCampaign,
      closeCreateCampaign,
      createContentOpen,
      contentCreatePreset,
      openCreateContent,
      closeCreateContent,

      // Actions
      invalidateWorkspace: workspace.invalidateWorkspace,
      refetchBootstrap: workspace.refetchBootstrap,
      refetchBrands: workspace.refetchBrands,
      approveItem,


      // Dora / Lucy
      handleInstagramDraftAi,
      handleCreateInstagramContent,
      handleDraftWithMarketingFromPanel,
    }),
    [
      workspace.metrics, workspace.campaigns, workspace.content, workspace.emailCampaigns,
      workspace.brandList, workspace.metricsLoading,
      workspace.bootstrapError, workspace.brandsError,
      workspace.invalidateWorkspace,
      workspace.refetchBootstrap, workspace.refetchBrands,
      filteredContent, approvalItems, approveItem,
      detail, detailRefreshKey, openDetail, closeDetail, bumpContentDetail,
      createCampaignOpen, openCreateCampaign, closeCreateCampaign,
      createContentOpen, contentCreatePreset, openCreateContent, closeCreateContent,
      handleInstagramDraftAi, handleCreateInstagramContent, handleDraftWithMarketingFromPanel,
    ],
  );

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
