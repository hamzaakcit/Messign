import { createContext, useContext, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type Campaign,
  type ContentItem,
  type DashboardMetrics,
  type EmailCampaign,
  type Lead,
  type LeadFunnelMetrics,
  type BrandProfileClient,
  type CommandCenterPayload,
  type CommandCenterStrategyPlay,
} from '@/lib/marketingApi';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import { useMarketingWorkspace } from './hooks/useMarketingWorkspace';
import type { ContentCreatePreset } from './components/ContentCreatePanel';
import type { ApprovalQueueItem } from './approvalQueue/types';
import type { LaneId } from './components/KanbanBoard';
import type { BoardCardData } from './components/BoardCard';

// ---------------------------------------------------------------------------
// Detail panel target (content / campaign / lead / email slide-overs)
// ---------------------------------------------------------------------------

export type DetailTarget =
  | { type: 'content'; id: string }
  | { type: 'campaign'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'email'; id: string }
  | null;

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface MarketingContextValue {
  // Data ------------------------------------------------------------------
  metrics: DashboardMetrics | null;
  campaigns: Campaign[];
  content: ContentItem[];
  filteredContent: ContentItem[];
  emailCampaigns: EmailCampaign[];
  hotLeads: Lead[];
  funnel: LeadFunnelMetrics | null;
  brandList: BrandProfileClient[];
  metricsLoading: boolean;
  approvalItems: ApprovalQueueItem[];

  // Command center --------------------------------------------------------
  ccData: CommandCenterPayload | null;
  ccLoading: boolean;
  ccError: Error | null;
  ccDays: number;
  setCcDays: (days: number) => void;
  brandFilter: string | null;
  setBrandFilter: (brand: string | null) => void;

  // Errors ----------------------------------------------------------------
  bootstrapError: Error | null;
  funnelError: Error | null;
  brandsError: Error | null;

  // Data actions ----------------------------------------------------------
  invalidateWorkspace: () => Promise<void>;
  refreshCommandCenter: (opts?: { fresh?: boolean }) => Promise<void>;
  refetchBootstrap: () => Promise<unknown>;
  refetchFunnel: () => Promise<unknown>;
  refetchBrands: () => Promise<unknown>;

  // Detail panel ----------------------------------------------------------
  detail: DetailTarget;
  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;
  handleDetailUpdated: () => void;

  // Card actions (Kanban) -------------------------------------------------
  handleCardClick: (card: BoardCardData) => void;
  handleCardMove: (cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => void;

  // Create panels ---------------------------------------------------------
  createCampaignOpen: boolean;
  setCreateCampaignOpen: (open: boolean) => void;
  createContentOpen: boolean;
  contentCreatePreset: ContentCreatePreset;
  openCreateContentDefault: () => void;
  openCreateContentWithPreset: (preset: ContentCreatePreset) => void;
  closeCreateContent: () => void;
  brandManagerOpen: boolean;
  setBrandManagerOpen: (open: boolean) => void;

  // Navigation helpers ----------------------------------------------------
  handleInstagramDraftAi: () => void;
  handleCreateInstagramContent: () => void;
  handleDraftWithMarketingFromPanel: () => void;

  // Dora execute ----------------------------------------------------------
  doraExecutePrompt: { id: number; text: string } | null;
  handleExecuteWithDora: (play: CommandCenterStrategyPlay) => void;
}

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

const MarketingContext = createContext<MarketingContextValue | null>(null);

export function useMarketingContext(): MarketingContextValue {
  const ctx = useContext(MarketingContext);
  if (!ctx) throw new Error('useMarketingContext must be used inside <MarketingProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MarketingProvider({ children }: { children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.authUserId || user?.id || '';

  // -- Workspace data (TanStack Query) ------------------------------------
  const [ccDays, setCcDays] = useState(7);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  const workspace = useMarketingWorkspace({ userId, accessToken, ccDays, brandFilter });

  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId && accessToken ? userId : undefined,
  );

  const filteredContent = useMemo(() => {
    if (!brandFilter) return workspace.content;
    return workspace.content.filter((c) => c.brand_profile_id === brandFilter);
  }, [workspace.content, brandFilter]);

  // -- Detail panel state -------------------------------------------------
  const [detail, setDetail] = useState<DetailTarget>(null);

  const openDetail = useCallback((target: DetailTarget) => setDetail(target), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const handleDetailUpdated = useCallback(() => {
    void workspace.invalidateWorkspace();
  }, [workspace.invalidateWorkspace]);

  // -- Card interactions --------------------------------------------------
  const handleCardClick = useCallback(
    (card: BoardCardData) => {
      if (card.type === 'content') {
        setDetail({ type: 'content', id: (card.sourceData as ContentItem).id });
      } else if (card.type === 'campaign') {
        setDetail({ type: 'campaign', id: (card.sourceData as Campaign).id });
      } else if (card.type === 'email') {
        setDetail({ type: 'email', id: (card.sourceData as EmailCampaign).id });
      } else if (card.type === 'approval') {
        const a = card.sourceData as ApprovalQueueItem;
        if (a.contentId) setDetail({ type: 'content', id: a.contentId });
      }
    },
    [],
  );

  const handleCardMove = useCallback(
    async (_cardId: string, fromLane: LaneId, toLane: LaneId, card: BoardCardData) => {
      try {
        if (fromLane === 'draft' && toLane === 'review' && card.type === 'content') {
          await marketingAPI.updateContent(userId, (card.sourceData as ContentItem).id, { submit_for_review: true });
          toast.success('Sent to review');
        } else if (fromLane === 'review' && toLane === 'ready' && card.type === 'approval') {
          await approveItem((card.sourceData as ApprovalQueueItem).id);
          toast.success('Approved');
        } else if (toLane === 'live' && card.type === 'content') {
          await marketingAPI.publishContent(userId, (card.sourceData as ContentItem).id);
          toast.success('Published');
        }
        await workspace.invalidateWorkspace();
      } catch (e) {
        toast.error('Move failed', { description: e instanceof Error ? e.message : 'Unknown' });
      }
    },
    [userId, approveItem, workspace.invalidateWorkspace],
  );

  // -- Create panels ------------------------------------------------------
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createContentOpen, setCreateContentOpen] = useState(false);
  const [contentCreatePreset, setContentCreatePreset] = useState<ContentCreatePreset>('default');

  const openCreateContentDefault = useCallback(() => {
    setContentCreatePreset('default');
    setCreateContentOpen(true);
  }, []);

  const openCreateContentWithPreset = useCallback((preset: ContentCreatePreset) => {
    setContentCreatePreset(preset);
    setCreateContentOpen(true);
  }, []);

  const closeCreateContent = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
  }, []);

  const [brandManagerOpen, setBrandManagerOpen] = useState(false);

  // -- Navigation helpers -------------------------------------------------
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

  // -- Dora execute -------------------------------------------------------
  const [doraExecutePrompt, setDoraExecutePrompt] = useState<{ id: number; text: string } | null>(null);

  const handleExecuteWithDora = useCallback(
    (play: CommandCenterStrategyPlay) => {
      const text = `[Marketing Command Center — ${play.title}]\nContext: ${JSON.stringify(play.contextJson)}\n\n${play.snippet}\n\nHelp me execute this strategy step by step.`;
      setDoraExecutePrompt({ id: Date.now(), text });
      navigate('/marketing');
    },
    [navigate],
  );

  // -- Context value ------------------------------------------------------
  const value = useMemo<MarketingContextValue>(
    () => ({
      metrics: workspace.metrics,
      campaigns: workspace.campaigns,
      content: workspace.content,
      filteredContent,
      emailCampaigns: workspace.emailCampaigns,
      hotLeads: workspace.hotLeads,
      funnel: workspace.funnel,
      brandList: workspace.brandList,
      metricsLoading: workspace.metricsLoading,
      approvalItems,
      ccData: workspace.ccData,
      ccLoading: workspace.ccLoading,
      ccError: workspace.ccError,
      ccDays,
      setCcDays,
      brandFilter,
      setBrandFilter,
      bootstrapError: workspace.bootstrapError,
      funnelError: workspace.funnelError,
      brandsError: workspace.brandsError,
      invalidateWorkspace: workspace.invalidateWorkspace,
      refreshCommandCenter: workspace.refreshCommandCenter,
      refetchBootstrap: workspace.refetchBootstrap,
      refetchFunnel: workspace.refetchFunnel,
      refetchBrands: workspace.refetchBrands,
      detail,
      openDetail,
      closeDetail,
      handleDetailUpdated,
      handleCardClick,
      handleCardMove,
      createCampaignOpen,
      setCreateCampaignOpen,
      createContentOpen,
      contentCreatePreset,
      openCreateContentDefault,
      openCreateContentWithPreset,
      closeCreateContent,
      brandManagerOpen,
      setBrandManagerOpen,
      handleInstagramDraftAi,
      handleCreateInstagramContent,
      handleDraftWithMarketingFromPanel,
      doraExecutePrompt,
      handleExecuteWithDora,
    }),
    [
      workspace,
      filteredContent,
      approvalItems,
      ccDays,
      brandFilter,
      detail,
      openDetail,
      closeDetail,
      handleDetailUpdated,
      handleCardClick,
      handleCardMove,
      createCampaignOpen,
      createContentOpen,
      contentCreatePreset,
      openCreateContentDefault,
      openCreateContentWithPreset,
      closeCreateContent,
      brandManagerOpen,
      handleInstagramDraftAi,
      handleCreateInstagramContent,
      handleDraftWithMarketingFromPanel,
      doraExecutePrompt,
      handleExecuteWithDora,
    ],
  );

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
