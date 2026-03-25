import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type Campaign,
  type ContentItem,
  type EmailCampaign,
  type CommandCenterStrategyPlay,
} from '@/lib/marketingApi';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import { SparkBar, type ViewMode } from './components/SparkBar';
import type { LaneId } from './components/KanbanBoard';
import { FunnelStrip } from './components/FunnelStrip';
import { DoraRail, MARKETING_DORA_RAIL_OUTSET_RIGHT } from './components/DoraRail';
import type { BoardCardData } from './components/BoardCard';
import type { ApprovalQueueItem } from './approvalQueue/types';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { CampaignCreatePanel } from './components/CampaignCreatePanel';
import { ContentCreatePanel, type ContentCreatePreset } from './components/ContentCreatePanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { BrandProfileManager } from './components/BrandProfileManager';
import { EmailCampaignDetailPanel } from './components/EmailCampaignDetailPanel';
import { useMarketingWorkspace } from './hooks/useMarketingWorkspace';
import { buildMarketingModeLocation, pathnameToViewMode } from './lib/marketingPathUtils';
import { MarketingWorkspaceSecondaryAlerts } from './components/MarketingWorkspaceSecondaryAlerts';
import { MarketingBoardAndPipeline } from './components/MarketingBoardAndPipeline';

const ContentDetailPanel = React.lazy(() =>
  import('./components/ContentDetailPanel').then((m) => ({ default: m.ContentDetailPanel })),
);
const ContentCalendarTab = React.lazy(() =>
  import('./sections/ContentCalendarTab').then((m) => ({ default: m.ContentCalendarTab })),
);
const BuilderSection = React.lazy(() =>
  import('./sections/BuilderSection').then((m) => ({ default: m.BuilderSection })),
);
const CompetitorDashboard = React.lazy(() =>
  import('./components/CompetitorDashboard').then((m) => ({ default: m.CompetitorDashboard })),
);
const LEGACY_REDIRECTS: Record<string, string> = {
  email: '/marketing/builder?type=email',
  pages: '/marketing/builder?type=landing_page',
  popups: '/marketing/builder?type=popup',
  documents: '/marketing/builder?type=document',
  agent: '/marketing',
  'command-center': '/marketing',
  dashboard: '/marketing',
  'creative-hub': '/marketing',
  automation: '/marketing',
  /** Do not redirect `/marketing/content` — it is used for deep links (`?contentId=`). */
  leads: '/marketing',
  approvals: '/marketing',
};

type DetailTarget =
  | { type: 'content'; id: string }
  | { type: 'campaign'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'email'; id: string }
  | null;

function SectionFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
    </div>
  );
}

function MarketingBootstrapErrorBanner({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}): JSX.Element | null {
  if (!error) return null;
  return (
    <div
      className="shrink-0 px-4 py-1.5 text-xs bg-rose-950/50 text-rose-100 border-b border-rose-500/30 flex items-center justify-between gap-2"
      role="alert"
    >
      <span className="truncate">{error.message}</span>
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void onRetry()}>
        Retry
      </button>
    </div>
  );
}

export function MarketingHub(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.authUserId || user?.id || '';

  const mode = pathnameToViewMode(location.pathname);
  const setMode = useCallback(
    (m: ViewMode) => {
      navigate(buildMarketingModeLocation(m, location.search));
    },
    [navigate, location.search],
  );
  const [doraOpen, setDoraOpen] = useState(true);
  const [selectedCard, setSelectedCard] = useState<BoardCardData | null>(null);

  const [detail, setDetail] = useState<DetailTarget>(null);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createContentOpen, setCreateContentOpen] = useState(false);
  const [contentCreatePreset, setContentCreatePreset] = useState<ContentCreatePreset>('default');
  const [igModalSignal, setIgModalSignal] = useState(0);
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [ccDays, setCcDays] = useState(7);
  const [doraExecutePrompt, setDoraExecutePrompt] = useState<{ id: number; text: string } | null>(null);
  const pipelineSectionRef = useRef<HTMLDivElement>(null);

  const {
    metrics,
    campaigns,
    content,
    emailCampaigns,
    hotLeads,
    funnel,
    brandList,
    metricsLoading,
    bootstrapError,
    funnelError,
    brandsError,
    ccData,
    ccLoading,
    ccError,
    invalidateWorkspace,
    refreshCommandCenter,
    refetchBootstrap,
    refetchFunnel,
    refetchBrands,
  } = useMarketingWorkspace({
    userId,
    accessToken,
    ccDays,
    brandFilter,
  });

  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId && accessToken ? userId : undefined,
  );

  const handleDetailUpdated = useCallback(() => {
    void invalidateWorkspace();
  }, [invalidateWorkspace]);

  const scrollToPipeline = useCallback((): void => {
    pipelineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleExecuteWithDora = useCallback((play: CommandCenterStrategyPlay) => {
    setDoraOpen(true);
    const text = `[Marketing Command Center — ${play.title}]\nContext: ${JSON.stringify(play.contextJson)}\n\n${play.snippet}\n\nHelp me execute this strategy step by step.`;
    setDoraExecutePrompt({ id: Date.now(), text });
  }, []);

  const openCreateContentDefault = useCallback(() => {
    setContentCreatePreset('default');
    setCreateContentOpen(true);
  }, []);

  const handleInstagramDraftAi = useCallback(() => {
    setDoraOpen(true);
    setIgModalSignal((k) => k + 1);
  }, []);

  const handleCreateInstagramContent = useCallback(() => {
    setContentCreatePreset('instagram');
    setCreateContentOpen(true);
  }, []);

  const handleDraftWithMarketingFromPanel = useCallback(() => {
    setCreateContentOpen(false);
    setContentCreatePreset('default');
    setDoraOpen(true);
    setIgModalSignal((k) => k + 1);
  }, []);

  const sparkInstagramFromSubsegment = useMemo(
    () => ({
      onInstagramDraftAi: () => navigate('/marketing', { state: { openInstagramAi: true } }),
      onCreateInstagramContent: () => navigate('/marketing', { state: { openInstagramContent: true } }),
    }),
    [navigate],
  );

  useEffect(() => {
    const st = location.state as {
      openInstagramAi?: boolean;
      openInstagramContent?: boolean;
      openPipeline?: boolean;
    } | null;
    if (!st) return;
    let handled = false;
    if (st.openInstagramAi) {
      setDoraOpen(true);
      setIgModalSignal((k) => k + 1);
      handled = true;
    }
    if (st.openInstagramContent) {
      setContentCreatePreset('instagram');
      setCreateContentOpen(true);
      handled = true;
    }
    if (st.openPipeline) {
      queueMicrotask(() => scrollToPipeline());
      handled = true;
    }
    if (handled) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate, scrollToPipeline]);

  const segment = location.pathname.split('/').filter(Boolean)[1];

  /** Deep link: `/marketing/content?contentId=<uuid>` opens the content slide-over (cockpit & "Open full page" rely on this). */
  useEffect(() => {
    if (segment !== 'content') return;
    const id = new URLSearchParams(location.search).get('contentId');
    if (id) {
      setDetail({ type: 'content', id });
    }
  }, [segment, location.search]);

  const filteredContent = useMemo(() => {
    if (!brandFilter) return content;
    return content.filter((c) => c.brand_profile_id === brandFilter);
  }, [content, brandFilter]);

  if (segment === 'builder') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <MarketingBootstrapErrorBanner error={bootstrapError} onRetry={() => void refetchBootstrap()} />
        <MarketingWorkspaceSecondaryAlerts
          funnelError={funnelError}
          brandsError={brandsError}
          onRetryFunnel={() => void refetchFunnel()}
          onRetryBrands={() => void refetchBrands()}
        />
        <div className="shrink-0 px-4 py-2">
          <SparkBar
            mode="builder"
            onModeChange={setMode}
            metrics={metrics}
            loading={metricsLoading}
            doraOpen={doraOpen}
            onToggleDora={() => setDoraOpen((o) => !o)}
            onCreateCampaign={() => setCreateCampaignOpen(true)}
            onCreateContent={openCreateContentDefault}
            onCreateEmail={() => setMode('builder')}
            {...sparkInstagramFromSubsegment}
          />
        </div>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary resetKey="builder">
            <Suspense fallback={<SectionFallback />}>
              <BuilderSection />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  if (segment === 'intelligence') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <MarketingBootstrapErrorBanner error={bootstrapError} onRetry={() => void refetchBootstrap()} />
        <MarketingWorkspaceSecondaryAlerts
          funnelError={funnelError}
          brandsError={brandsError}
          onRetryFunnel={() => void refetchFunnel()}
          onRetryBrands={() => void refetchBrands()}
        />
        <div className="shrink-0 px-4 py-2">
          <SparkBar
            mode="intelligence"
            onModeChange={setMode}
            metrics={metrics}
            loading={metricsLoading}
            doraOpen={doraOpen}
            onToggleDora={() => setDoraOpen((o) => !o)}
            onCreateCampaign={() => setCreateCampaignOpen(true)}
            onCreateContent={openCreateContentDefault}
            onCreateEmail={() => setMode('builder')}
            {...sparkInstagramFromSubsegment}
          />
        </div>
        <main className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary resetKey="intelligence">
            <Suspense fallback={<SectionFallback />}>
              <CompetitorDashboard />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  if (segment === 'executive') {
    return <Navigate to="/marketing" replace />;
  }

  if (segment === 'pipeline') {
    return <Navigate to="/marketing" replace state={{ openPipeline: true }} />;
  }

  if (segment === 'campaigns') {
    return <Navigate to="/marketing" replace />;
  }

  const redirect = segment ? LEGACY_REDIRECTS[segment] : undefined;
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  const handleCardClick = (card: BoardCardData) => {
    setSelectedCard(card);
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
  };

  const handleCardMove = async (
    _cardId: string,
    fromLane: LaneId,
    toLane: LaneId,
    card: BoardCardData,
  ) => {
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
      await invalidateWorkspace();
    } catch (e) {
      toast.error('Move failed', { description: e instanceof Error ? e.message : 'Unknown' });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <MarketingBootstrapErrorBanner error={bootstrapError} onRetry={() => void refetchBootstrap()} />
      <MarketingWorkspaceSecondaryAlerts
        funnelError={mode === 'calendar' ? null : funnelError}
        brandsError={brandsError}
        onRetryFunnel={() => void refetchFunnel()}
        onRetryBrands={() => void refetchBrands()}
      />
      <SparkBar
        mode={mode}
        onModeChange={setMode}
        metrics={metrics}
        loading={metricsLoading}
        doraOpen={doraOpen}
        onToggleDora={() => setDoraOpen((o) => !o)}
        onCreateCampaign={() => setCreateCampaignOpen(true)}
        onCreateContent={openCreateContentDefault}
        onCreateEmail={() => setMode('builder')}
        onInstagramDraftAi={handleInstagramDraftAi}
        onCreateInstagramContent={handleCreateInstagramContent}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {mode === 'board' && (
          <MarketingBoardAndPipeline
            ccData={ccData}
            ccLoading={ccLoading}
            ccError={ccError}
            ccDays={ccDays}
            onCcDaysChange={setCcDays}
            brandList={brandList}
            brandFilter={brandFilter}
            onBrandFilterChange={setBrandFilter}
            onRefreshCommandCenter={() => void refreshCommandCenter({ fresh: true })}
            onExecuteWithDora={handleExecuteWithDora}
            onOpenCampaign={(id) => setDetail({ type: 'campaign', id })}
            onOpenEmail={(id) => setDetail({ type: 'email', id })}
            onOpenPipeline={scrollToPipeline}
            onOpenBuilder={() => setMode('builder')}
            onOpenIntelligence={() => setMode('intelligence')}
            onReconnectSocial={() => void refreshCommandCenter({ fresh: true })}
            brandsError={brandsError}
            pipelineSectionRef={pipelineSectionRef}
            filteredContent={filteredContent}
            campaigns={campaigns}
            emailCampaigns={emailCampaigns}
            approvalItems={approvalItems}
            metricsLoading={metricsLoading}
            onCardClick={handleCardClick}
            onCardMove={(cardId, from, to, card) => void handleCardMove(cardId, from, to, card)}
          />
        )}

        {mode === 'calendar' && (
          <ErrorBoundary resetKey="calendar">
            <Suspense fallback={<SectionFallback />}>
              <ContentCalendarTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {doraOpen && (mode === 'board' || mode === 'calendar') && (
          <DoraRail
            selectedCard={selectedCard}
            instagramModalSignal={igModalSignal}
            executePrompt={doraExecutePrompt}
          />
        )}
      </div>

      {mode === 'calendar' && funnelError ? (
        <div
          className="shrink-0 px-4 py-1 text-[10px] bg-amber-950/35 text-amber-100/95 border-t border-amber-500/20 flex items-center justify-between gap-2"
          role="status"
        >
          <span className="truncate">Funnel: {funnelError.message}</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => void refetchFunnel()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {mode === 'calendar' && (
        <FunnelStrip
          funnel={funnel}
          hotLeads={hotLeads}
          onLeadClick={(id) => setDetail({ type: 'lead', id })}
        />
      )}

      {/* Detail panels */}
      <SlideOverPanel
        isOpen={detail?.type === 'content'}
        onClose={() => {
          setDetail(null);
          setSelectedCard(null);
          if (segment === 'content') {
            navigate('/marketing', { replace: true });
          }
        }}
        title="Content Detail"
        width={1200}
      >
        {detail?.type === 'content' && (
          <Suspense fallback={<SectionFallback />}>
            <ContentDetailPanel contentId={detail.id} onUpdated={handleDetailUpdated} />
          </Suspense>
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={detail?.type === 'campaign'}
        onClose={() => { setDetail(null); setSelectedCard(null); }}
        title="Campaign Detail"
        width={760}
      >
        {detail?.type === 'campaign' && (
          <CampaignDetailPanel campaignId={detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={detail?.type === 'lead'}
        onClose={() => { setDetail(null); setSelectedCard(null); }}
        title="Lead Detail"
        width={720}
      >
        {detail?.type === 'lead' && (
          <LeadDetailPanel leadId={detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={detail?.type === 'email'}
        onClose={() => { setDetail(null); setSelectedCard(null); }}
        title="Email campaign"
        width={960}
      >
        {detail?.type === 'email' && (
          <EmailCampaignDetailPanel emailId={detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        title="New Campaign"
        width={520}
      >
        <CampaignCreatePanel
          onCreated={() => {
            setCreateCampaignOpen(false);
            void invalidateWorkspace();
          }}
          onCancel={() => setCreateCampaignOpen(false)}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createContentOpen}
        onClose={() => {
          setCreateContentOpen(false);
          setContentCreatePreset('default');
        }}
        title={contentCreatePreset === 'instagram' ? 'New Instagram content' : 'New Content'}
        width={560}
      >
        <ContentCreatePanel
          preset={contentCreatePreset}
          onDraftWithMarketingAgent={handleDraftWithMarketingFromPanel}
          onCreated={() => {
            setCreateContentOpen(false);
            setContentCreatePreset('default');
            void invalidateWorkspace();
          }}
          onCancel={() => {
            setCreateContentOpen(false);
            setContentCreatePreset('default');
          }}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={brandManagerOpen}
        onClose={() => setBrandManagerOpen(false)}
        title="Brand Profiles"
        width={560}
      >
        <BrandProfileManager />
      </SlideOverPanel>

      <button
        type="button"
        onClick={() => setBrandManagerOpen(true)}
        className={`fixed bottom-6 z-30 px-4 py-2 rounded-full text-xs font-medium bg-app-card border border-app-border text-app-text shadow-lg hover:bg-app-nav-hover transition-colors ${
          doraOpen && mode === 'board' ? MARKETING_DORA_RAIL_OUTSET_RIGHT : 'right-6'
        }`}
      >
        Brands
      </button>
    </div>
  );
}
