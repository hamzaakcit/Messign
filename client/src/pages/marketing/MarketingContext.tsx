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
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type BrandProfileClient,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
} from '@/lib/marketingApi';
import { ROUTES } from '@/lib/routes';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import type { ApprovalQueueItem } from './approvalQueue/types';
import type { LaneId } from './components/KanbanBoard';
import type { BoardCardData } from './components/BoardCard';
import type { ContentCreatePreset } from './components/ContentCreatePanel';
import { useMarketingWorkspace } from './hooks/useMarketingWorkspace';
import { boardMove, refusedMoveMessage } from './lib/boardMoves';

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
  brandManagerOpen: boolean;
  openBrandManager: () => void;
  closeBrandManager: () => void;

  // === Workspace actions ===
  invalidateWorkspace: () => Promise<void>;
  refetchBootstrap: () => Promise<unknown>;
  refetchBrands: () => Promise<unknown>;
  approveItem: (id: string) => Promise<void>;

  // === Pipeline card handlers ===
  handleCardClick: (card: BoardCardData) => void;
  handleCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;

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
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);

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

  const openBrandManager = useCallback(() => setBrandManagerOpen(true), []);
  const closeBrandManager = useCallback(() => setBrandManagerOpen(false), []);

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

  // --- Pipeline card handlers ---
  const handleCardClick = useCallback(
    (card: BoardCardData) => {
      if (card.type === 'content') {
        const c = card.sourceData as ContentItem;
        setDetail({ type: 'content', id: c.id });
      } else if (card.type === 'campaign') {
        const c = card.sourceData as Campaign;
        setDetail({ type: 'campaign', id: c.id });
      } else if (card.type === 'email') {
        const e = card.sourceData as EmailCampaign;
        setDetail({ type: 'email', id: e.id });
      } else if (card.type === 'approval') {
        const a = card.sourceData as ApprovalQueueItem;
        if (a.contentId) {
          setDetail({ type: 'content', id: a.contentId });
        }
      }
    },
    [],
  );

  const handleCardMove = useCallback(
    async (_cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => {
      const move = boardMove(fromLane, toLane, card);
      if (!move) {
        toast.message(refusedMoveMessage(toLane));
        return;
      }
      try {
        if (move === 'submit_for_review') {
          const c = card.sourceData as ContentItem;
          await marketingAPI.updateContent(userId, c.id, { submit_for_review: true });
          toast.success('Sent to review');
        } else {
          const a = card.sourceData as ApprovalQueueItem;
          await approveItem(a.id);
          toast.success('Approved');
        }
        await workspace.invalidateWorkspace();
      } catch (e) {
        toast.error('Move failed', { description: e instanceof Error ? e.message : 'Unknown' });
      }
    },
    [userId, approveItem, workspace.invalidateWorkspace],
  );

  // --- Side effects: location-state-driven navigation ---
  useEffect(() => {
    const st = location.state as {
      openInstagramContent?: boolean;
      openPipeline?: boolean;
    } | null;
    if (!st) return;
    const pathNorm = location.pathname.replace(/\/$/, '') || '/';

    if (st.openPipeline && pathNorm === ROUTES.MARKETING) {
      navigate(ROUTES.MARKETING_PIPELINE, { replace: true, state: { openPipeline: true } });
      return;
    }

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

  // --- Deep link: /marketing/content?contentId=<uuid> ---
  const segment = location.pathname.split('/').filter(Boolean)[1];
  useEffect(() => {
    if (segment !== 'content') return;
    const id = new URLSearchParams(location.search).get('contentId');
    if (id) {
      setDetail({ type: 'content', id });
    }
  }, [segment, location.search]);

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
      brandManagerOpen,
      openBrandManager,
      closeBrandManager,

      // Actions
      invalidateWorkspace: workspace.invalidateWorkspace,
      refetchBootstrap: workspace.refetchBootstrap,
      refetchBrands: workspace.refetchBrands,
      approveItem,

      // Pipeline handlers
      handleCardClick,
      handleCardMove,

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
      brandManagerOpen, openBrandManager, closeBrandManager,
      handleCardClick, handleCardMove,
      handleInstagramDraftAi, handleCreateInstagramContent, handleDraftWithMarketingFromPanel,
    ],
  );

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
