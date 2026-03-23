import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/lib/marketingApi';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import { SparkBar, type ViewMode } from './components/SparkBar';
import { KanbanBoard, BoardSkeleton, type LaneId } from './components/KanbanBoard';
import { FunnelStrip } from './components/FunnelStrip';
import { DoraRail } from './components/DoraRail';
import type { BoardCardData } from './components/BoardCard';
import type { ApprovalQueueItem } from './approvalQueue/types';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { CampaignCreatePanel } from './components/CampaignCreatePanel';
import { ContentCreatePanel } from './components/ContentCreatePanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { BrandProfileManager } from './components/BrandProfileManager';

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
  content: '/marketing/campaigns?tab=content',
  leads: '/marketing',
  approvals: '/marketing',
};

type DetailTarget =
  | { type: 'content'; id: string }
  | { type: 'campaign'; id: string }
  | { type: 'lead'; id: string }
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
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [brandList, setBrandList] = useState<BrandProfileClient[]>([]);

  const { items: approvalItems, approve: approveItem } = useMarketingApprovalQueue(
    userId || undefined,
  );

  const fetchData = useCallback(async () => {
    if (!userId) return;
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
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredContent = useMemo(() => {
    if (!brandFilter) return content;
    return content.filter((c) => c.brand_profile_id === brandFilter);
  }, [content, brandFilter]);

  const segment = location.pathname.split('/').filter(Boolean)[1];

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
            onCreateContent={() => setCreateContentOpen(true)}
            onCreateEmail={() => setMode('builder')}
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
            onCreateContent={() => setCreateContentOpen(true)}
            onCreateEmail={() => setMode('builder')}
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
            onCreateContent={() => setCreateContentOpen(true)}
            onCreateEmail={() => setMode('builder')}
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
      setDetail({ type: 'content', id: e.id });
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
        onCreateContent={() => setCreateContentOpen(true)}
        onCreateEmail={() => setMode('builder')}
      />

      {brandList.length > 0 && mode === 'board' && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/[0.06] bg-[#0a0d12] shrink-0">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Brand</span>
          <select
            value={brandFilter || ''}
            onChange={(e) => setBrandFilter(e.target.value || null)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-app-text min-w-[140px]"
          >
            <option value="">All brands</option>
            {brandList.map((b) => (
              <option key={b.id} value={b.id}>{b.brand_name}</option>
            ))}
          </select>
          {brandFilter && (
            <button
              type="button"
              onClick={() => setBrandFilter(null)}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {mode === 'board' && (
          metricsLoading ? <BoardSkeleton /> : (
            <KanbanBoard
              content={filteredContent}
              campaigns={campaigns}
              emailCampaigns={emailCampaigns}
              approvalItems={approvalItems}
              onCardClick={handleCardClick}
              onCardMove={(cardId, from, to, card) => void handleCardMove(cardId, from, to, card)}
            />
          )
        )}

        {mode === 'calendar' && (
          <ErrorBoundary resetKey="calendar">
            <Suspense fallback={<SectionFallback />}>
              <ContentCalendarTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {doraOpen && mode === 'board' && <DoraRail selectedCard={selectedCard} />}
      </div>

      {mode === 'board' && (
        <FunnelStrip
          funnel={funnel}
          hotLeads={hotLeads}
          onLeadClick={(id) => setDetail({ type: 'lead', id })}
        />
      )}

      {/* Detail panels */}
      <SlideOverPanel
        isOpen={detail?.type === 'content'}
        onClose={() => { setDetail(null); setSelectedCard(null); }}
        title="Content Detail"
        width={1200}
      >
        {detail?.type === 'content' && (
          <Suspense fallback={<SectionFallback />}>
            <ContentDetailPanel contentId={detail.id} onUpdated={fetchData} />
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
          <CampaignDetailPanel campaignId={detail.id} onUpdated={fetchData} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={detail?.type === 'lead'}
        onClose={() => { setDetail(null); setSelectedCard(null); }}
        title="Lead Detail"
        width={720}
      >
        {detail?.type === 'lead' && (
          <LeadDetailPanel leadId={detail.id} onUpdated={fetchData} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        title="New Campaign"
        width={520}
      >
        <CampaignCreatePanel
          onCreated={() => { setCreateCampaignOpen(false); void fetchData(); }}
          onCancel={() => setCreateCampaignOpen(false)}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createContentOpen}
        onClose={() => setCreateContentOpen(false)}
        title="New Content"
        width={560}
      >
        <ContentCreatePanel
          onCreated={() => { setCreateContentOpen(false); void fetchData(); }}
          onCancel={() => setCreateContentOpen(false)}
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
        className="fixed bottom-6 right-6 z-30 px-4 py-2 rounded-full text-xs font-medium bg-app-card border border-app-border text-app-text shadow-lg hover:bg-white/5 transition-colors"
      >
        Brands
      </button>
    </div>
  );
}
