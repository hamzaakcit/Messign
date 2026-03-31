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
  type CommandCenterPayload,
  type CommandCenterStrategyPlay,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
  type Lead,
  type LeadFunnelMetrics,
} from '@/lib/marketingApi';
import { ROUTES } from '@/lib/routes';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import type { ApprovalQueueItem } from './approvalQueue/types';
import type { LaneId } from './components/KanbanBoard';
import type { BoardCardData } from './components/BoardCard';
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
  approvalItems: ApprovalQueueItem[];

  // === Shared controls ===
  brandFilter: string | null;
  setBrandFilter: (id: string | null) => void;
  ccDays: number;
  setCcDays: (days: number) => void;

  // === Detail panel ===
  detail: DetailTarget;
  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;

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
  refreshCommandCenter: (opts?: { fresh?: boolean }) => Promise<void>;
  refetchBootstrap: () => Promise<unknown>;
  refetchFunnel: () => Promise<unknown>;
  refetchBrands: () => Promise<unknown>;
  approveItem: (id: string) => Promise<void>;

  // === Pipeline card handlers ===
  handleCardClick: (card: BoardCardData) => void;
  handleCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;

  // === Dora / Lucy integration ===
  doraExecutePrompt: { id: number; text: string } | null;
  executeWithDora: (play: CommandCenterStrategyPlay) => void;
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
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createContentOpen, setCreateContentOpen] = useState(false);
  const [contentCreatePreset, setContentCreatePreset] = useState<ContentCreatePreset>('default');
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [ccDays, setCcDays] = useState(7);
  const [doraExecutePrompt, setDoraExecutePrompt] = useState<{ id: number; text: string } | null>(null);

  // --- Data hooks ---
  const workspace = useMarketingWorkspace({ userId, accessToken, ccDays, brandFilter });
  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId && accessToken ? userId : undefined,
  );

  // --- Computed ---
  const filteredContent = useMemo(() => {
    if (!brandFilter) return workspace.content;
    return workspace.content.filter((c) => c.brand_profile_id === brandFilter);
  }, [workspace.content, brandFilter]);

  // --- Detail panel ---
  const openDetail = useCallback((target: DetailTarget) => setDetail(target), []);
  const closeDetail = useCallback(() => setDetail(null), []);

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
  const executeWithDora = useCallback(
    (play: CommandCenterStrategyPlay) => {
      const text = `[Marketing Command Center — ${play.title}]\nContext: ${JSON.stringify(play.contextJson)}\n\n${play.snippet}\n\nHelp me execute this strategy step by step.`;
      setDoraExecutePrompt({ id: Date.now(), text });
      navigate('/marketing');
    },
    [navigate],
  );

  const handleInstagramDraftAi = useCallback(() => {
    navigate('/marketing', { state: { openInstagramAi: true } });
  }, [navigate]);

  const handleCreateInstagramContent = useCallback(() => {
    setContentCreatePreset('instagram');
    setCreateContentOpen(true);
  }, []);

  const handleDraftWithMarketingFromPanel = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
    navigate('/marketing', { state: { openInstagramAi: true } });
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
      try {
        if (fromLane === 'draft' && toLane === 'review') {
          if (card.type === 'content') {
            const c = card.sourceData as ContentItem;
            await marketingAPI.updateContent(userId, c.id, { submit_for_review: true });
            toast.success('Sent to review');
          }
        } else if (fromLane === 'review' && toLane === 'ready') {
          if (card.type === 'approval') {
            const a = card.sourceData as ApprovalQueueItem;
            await approveItem(a.id);
            toast.success('Approved');
          }
        } else if (toLane === 'live') {
          if (card.type === 'content') {
            const c = card.sourceData as ContentItem;
            await marketingAPI.publishContent(userId, c.id);
            toast.success('Published');
          }
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
      hotLeads: workspace.hotLeads,
      funnel: workspace.funnel,
      brandList: workspace.brandList,
      metricsLoading: workspace.metricsLoading,
      bootstrapError: workspace.bootstrapError,
      funnelError: workspace.funnelError,
      brandsError: workspace.brandsError,
      ccData: workspace.ccData,
      ccLoading: workspace.ccLoading,
      ccError: workspace.ccError,
      approvalItems,

      // Controls
      brandFilter,
      setBrandFilter,
      ccDays,
      setCcDays,

      // Detail panel
      detail,
      openDetail,
      closeDetail,

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
      refreshCommandCenter: workspace.refreshCommandCenter,
      refetchBootstrap: workspace.refetchBootstrap,
      refetchFunnel: workspace.refetchFunnel,
      refetchBrands: workspace.refetchBrands,
      approveItem,

      // Pipeline handlers
      handleCardClick,
      handleCardMove,

      // Dora / Lucy
      doraExecutePrompt,
      executeWithDora,
      handleInstagramDraftAi,
      handleCreateInstagramContent,
      handleDraftWithMarketingFromPanel,
    }),
    [
      workspace.metrics, workspace.campaigns, workspace.content, workspace.emailCampaigns,
      workspace.hotLeads, workspace.funnel, workspace.brandList, workspace.metricsLoading,
      workspace.bootstrapError, workspace.funnelError, workspace.brandsError,
      workspace.ccData, workspace.ccLoading, workspace.ccError,
      workspace.invalidateWorkspace, workspace.refreshCommandCenter,
      workspace.refetchBootstrap, workspace.refetchFunnel, workspace.refetchBrands,
      filteredContent, approvalItems, approveItem,
      brandFilter, ccDays,
      detail, openDetail, closeDetail,
      createCampaignOpen, openCreateCampaign, closeCreateCampaign,
      createContentOpen, contentCreatePreset, openCreateContent, closeCreateContent,
      brandManagerOpen, openBrandManager, closeBrandManager,
      handleCardClick, handleCardMove,
      doraExecutePrompt, executeWithDora,
      handleInstagramDraftAi, handleCreateInstagramContent, handleDraftWithMarketingFromPanel,
    ],
  );

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
