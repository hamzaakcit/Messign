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
  type DashboardMetrics,
  type EmailCampaign,
  type Lead,
  type LeadFunnelMetrics,
  type BrandProfileClient,
  type CommandCenterStrategyPlay,
} from '@/lib/marketingApi';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import { SparkBar, type ViewMode } from './components/SparkBar';
import { KanbanBoard, BoardSkeleton, type LaneId } from './components/KanbanBoard';
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
import { MarketingCommandCenter } from './MarketingCommandCenter';
import { useMarketingCommandCenterData } from './command-center/useMarketingCommandCenterData';

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
const CeoDashboard = React.lazy(() =>
  import('./components/CeoDashboard').then((m) => ({ default: m.CeoDashboard })),
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

export function MarketingHub(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.authUserId || user?.id || '';

  const [mode, setModeState] = useState<ViewMode>('board');
  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    if (m === 'intelligence') navigate('/marketing/intelligence');
    else if (m === 'builder') navigate('/marketing/builder');
    else if (m === 'executive') navigate('/marketing/executive');
    else if (location.pathname !== '/marketing') navigate('/marketing');
  }, [navigate, location.pathname]);
  const [doraOpen, setDoraOpen] = useState(true);
  const [selectedCard, setSelectedCard] = useState<BoardCardData | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [funnel, setFunnel] = useState<LeadFunnelMetrics | null>(null);

  const [detail, setDetail] = useState<DetailTarget>(null);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createContentOpen, setCreateContentOpen] = useState(false);
  const [contentCreatePreset, setContentCreatePreset] = useState<ContentCreatePreset>('default');
  const [igModalSignal, setIgModalSignal] = useState(0);
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [brandList, setBrandList] = useState<BrandProfileClient[]>([]);
  const [ccDays, setCcDays] = useState(7);
  const [doraExecutePrompt, setDoraExecutePrompt] = useState<{ id: number; text: string } | null>(null);
  const pipelineSectionRef = useRef<HTMLDivElement>(null);

  const {
    data: ccData,
    loading: ccLoading,
    error: ccError,
    refresh: refreshCc,
  } = useMarketingCommandCenterData({
    userId,
    accessToken,
    days: ccDays,
    brandId: brandFilter,
  });

  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId && accessToken ? userId : undefined,
  );

  const fetchData = useCallback(async () => {
    if (!userId || !accessToken) return;
    setMetricsLoading(true);
    try {
      const [bootstrap, funnelData, brands] = await Promise.all([
        marketingAPI.getDashboardBootstrap(userId, undefined, { fresh: true }),
        marketingAPI.getLeadFunnel(userId),
        marketingAPI.listBrandProfiles(userId).catch(() => ({ profiles: [] as BrandProfileClient[], total: 0 })),
      ]);
      setMetrics(bootstrap.metrics);
      setCampaigns(bootstrap.campaigns.data);
      setContent(bootstrap.content.data);
      setEmailCampaigns(bootstrap.emailCampaigns.data);
      setHotLeads(bootstrap.hotLeads);
      setFunnel(funnelData);
      setBrandList(brands.profiles.filter((b) => b.active).sort((a, b) => a.brand_name.localeCompare(b.brand_name)));
    } catch {
      /* non-critical */
    } finally {
      setMetricsLoading(false);
    }
  }, [userId, accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDetailUpdated = useCallback(() => {
    void fetchData();
    void refreshCc({ fresh: true });
  }, [fetchData, refreshCc]);

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
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 px-4 py-2">
          <SparkBar
            mode="executive"
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
          <ErrorBoundary resetKey="executive">
            <Suspense fallback={<SectionFallback />}>
              <CeoDashboard />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  if (segment === 'pipeline') {
    return <Navigate to="/marketing" replace state={{ openPipeline: true }} />;
  }

  if (segment === 'campaigns' || segment === 'calendar') {
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
      await fetchData();
      await refreshCc({ fresh: true });
    } catch (e) {
      toast.error('Move failed', { description: e instanceof Error ? e.message : 'Unknown' });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
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
          <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#080a0e]">
            <MarketingCommandCenter
              variant="compact"
              data={ccData}
              loading={ccLoading}
              error={ccError}
              days={ccDays}
              onDaysChange={setCcDays}
              brandList={brandList}
              brandFilter={brandFilter}
              onBrandFilterChange={setBrandFilter}
              onRefresh={() => void refreshCc({ fresh: true })}
              onExecuteWithDora={handleExecuteWithDora}
              onOpenCampaign={(id) => setDetail({ type: 'campaign', id })}
              onOpenEmail={(id) => setDetail({ type: 'email', id })}
              onOpenPipeline={scrollToPipeline}
              onOpenBuilder={() => setMode('builder')}
              onOpenIntelligence={() => setMode('intelligence')}
              onReconnectSocial={() => void refreshCc({ fresh: true })}
            />
            <section
              ref={pipelineSectionRef}
              className="flex flex-1 min-h-0 flex-col border-t border-white/[0.06] overflow-hidden"
              aria-label="Content pipeline"
            >
              <div className="shrink-0 px-3 py-1.5 bg-[#0a0d12] border-b border-white/[0.04]">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Content pipeline</h2>
              </div>
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-1">
                {metricsLoading ? (
                  <BoardSkeleton />
                ) : (
                  <KanbanBoard
                    content={filteredContent}
                    campaigns={campaigns}
                    emailCampaigns={emailCampaigns}
                    approvalItems={approvalItems}
                    onCardClick={handleCardClick}
                    onCardMove={(cardId, from, to, card) => void handleCardMove(cardId, from, to, card)}
                  />
                )}
              </div>
            </section>
          </div>
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
            void fetchData();
            void refreshCc({ fresh: true });
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
            void fetchData();
            void refreshCc({ fresh: true });
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
