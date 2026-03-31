import React, { Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { ROUTES } from '@/lib/routes';
import { MarketingProvider, useMarketingContext } from './MarketingContext';
import { MarketingWorkspaceLayout } from './MarketingWorkspaceLayout';
import { LucyMarketingPage } from './LucyMarketingPage';
import { MarketingPipelinePage } from './components/MarketingPipelinePage';
import { MarketingCommandCenter } from './MarketingCommandCenter';
import { MarketingWorkspaceSecondaryAlerts } from './components/MarketingWorkspaceSecondaryAlerts';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { CampaignCreatePanel } from './components/CampaignCreatePanel';
import { ContentCreatePanel } from './components/ContentCreatePanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { BrandProfileManager } from './components/BrandProfileManager';
import { EmailCampaignDetailPanel } from './components/EmailCampaignDetailPanel';
import { FunnelStrip } from './components/FunnelStrip';
import { buildMarketingModeLocation } from './lib/marketingPathUtils';

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

/** Legacy segment → redirect target. */
const LEGACY_REDIRECTS: Record<string, string> = {
  email: '/marketing/builder?type=email',
  pages: '/marketing/builder?type=landing_page',
  popups: '/marketing/builder?type=popup',
  documents: '/marketing/builder?type=document',
  agent: ROUTES.MARKETING,
  'command-center': ROUTES.MARKETING_PIPELINE,
  dashboard: ROUTES.MARKETING_PIPELINE,
  'creative-hub': ROUTES.MARKETING_PIPELINE,
  leads: ROUTES.MARKETING_PIPELINE,
  approvals: ROUTES.MARKETING_PIPELINE,
};

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

// ---------------------------------------------------------------------------
// Route wrapper components — bridge context → existing page props
// ---------------------------------------------------------------------------

function PipelineRoute(): JSX.Element {
  const ctx = useMarketingContext();
  const pipelineSectionRef = useRef<HTMLDivElement>(null);
  return (
    <MarketingPipelinePage
      pipelineSectionRef={pipelineSectionRef}
      filteredContent={ctx.filteredContent}
      campaigns={ctx.campaigns}
      emailCampaigns={ctx.emailCampaigns}
      approvalItems={ctx.approvalItems}
      metricsLoading={ctx.metricsLoading}
      onCardClick={ctx.handleCardClick}
      onCardMove={(cardId, from, to, card) => void ctx.handleCardMove(cardId, from, to, card)}
    />
  );
}

function CalendarRoute(): JSX.Element {
  const ctx = useMarketingContext();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary resetKey="calendar">
        <Suspense fallback={<SectionFallback />}>
          <ContentCalendarTab />
        </Suspense>
      </ErrorBoundary>
      {ctx.funnelError && (
        <div
          className="shrink-0 px-4 py-1 text-[10px] bg-amber-950/35 text-amber-100/95 border-t border-amber-500/20 flex items-center justify-between gap-2"
          role="status"
        >
          <span className="truncate">Funnel: {ctx.funnelError.message}</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => void ctx.refetchFunnel()}
          >
            Retry
          </button>
        </div>
      )}
      <FunnelStrip
        funnel={ctx.funnel}
        hotLeads={ctx.hotLeads}
        onLeadClick={(id) => ctx.openDetail({ type: 'lead', id })}
      />
    </div>
  );
}

function BuilderRoute(): JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary resetKey="builder">
        <Suspense fallback={<SectionFallback />}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BuilderSection />
          </div>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function IntelligenceRoute(): JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary resetKey="intelligence">
        <Suspense fallback={<SectionFallback />}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CompetitorDashboard />
          </div>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function CommandCenterRoute({ column }: { column: 'brand-social' | 'funnel' | 'experiments' | 'sandbox' }): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MarketingCommandCenter
      visibleColumn={column}
      variant="full"
      data={ctx.ccData}
      loading={ctx.ccLoading}
      error={ctx.ccError}
      brandsError={ctx.brandsError}
      days={ctx.ccDays}
      onDaysChange={ctx.setCcDays}
      brandList={ctx.brandList}
      brandFilter={ctx.brandFilter}
      onBrandFilterChange={ctx.setBrandFilter}
      onRefresh={() => void ctx.refreshCommandCenter({ fresh: true })}
      onExecuteWithDora={ctx.handleExecuteWithDora}
      onOpenCampaign={(id) => ctx.openDetail({ type: 'campaign', id })}
      onOpenEmail={(id) => ctx.openDetail({ type: 'email', id })}
      onOpenPipeline={() => void navigate(ROUTES.MARKETING_PIPELINE)}
      onOpenBuilder={() => void navigate(buildMarketingModeLocation('builder', location.search))}
      onOpenIntelligence={() => void navigate(buildMarketingModeLocation('intelligence', location.search))}
      onReconnectSocial={() => void ctx.refreshCommandCenter({ fresh: true })}
    />
  );
}

function LucyHubRoute(): JSX.Element {
  const ctx = useMarketingContext();
  return (
    <LucyMarketingPage
      executePrompt={ctx.doraExecutePrompt}
      metrics={ctx.metrics}
      metricsLoading={ctx.metricsLoading}
      approvalQueueCount={ctx.approvalItems.length}
      onOpenCampaign={() => ctx.setCreateCampaignOpen(true)}
      onOpenContent={ctx.openCreateContentDefault}
      onOpenInstagramContent={ctx.handleCreateInstagramContent}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared panels — rendered ONCE at the layout level
// ---------------------------------------------------------------------------

function MarketingSharedPanels(): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  return (
    <>
      {/* Detail slide-overs */}
      <SlideOverPanel
        isOpen={ctx.detail?.type === 'content'}
        onClose={() => {
          ctx.closeDetail();
          if (segment === 'content') {
            navigate(ROUTES.MARKETING_PIPELINE, { replace: true });
          }
        }}
        title="Content Detail"
        width={1200}
      >
        {ctx.detail?.type === 'content' && (
          <Suspense fallback={<SectionFallback />}>
            <ContentDetailPanel contentId={ctx.detail.id} onUpdated={ctx.handleDetailUpdated} />
          </Suspense>
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.detail?.type === 'campaign'}
        onClose={ctx.closeDetail}
        title="Campaign Detail"
        width={760}
      >
        {ctx.detail?.type === 'campaign' && (
          <CampaignDetailPanel campaignId={ctx.detail.id} onUpdated={ctx.handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.detail?.type === 'lead'}
        onClose={ctx.closeDetail}
        title="Lead Detail"
        width={720}
      >
        {ctx.detail?.type === 'lead' && (
          <LeadDetailPanel leadId={ctx.detail.id} onUpdated={ctx.handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.detail?.type === 'email'}
        onClose={ctx.closeDetail}
        title="Email campaign"
        width={960}
      >
        {ctx.detail?.type === 'email' && (
          <EmailCampaignDetailPanel emailId={ctx.detail.id} onUpdated={ctx.handleDetailUpdated} />
        )}
      </SlideOverPanel>

      {/* Create panels */}
      <SlideOverPanel
        isOpen={ctx.createCampaignOpen}
        onClose={() => ctx.setCreateCampaignOpen(false)}
        title="New Campaign"
        width={520}
      >
        <CampaignCreatePanel
          onCreated={() => {
            ctx.setCreateCampaignOpen(false);
            void ctx.invalidateWorkspace();
          }}
          onCancel={() => ctx.setCreateCampaignOpen(false)}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.createContentOpen}
        onClose={ctx.closeCreateContent}
        title={ctx.contentCreatePreset === 'instagram' ? 'New Instagram content' : 'New Content'}
        width={560}
      >
        <ContentCreatePanel
          preset={ctx.contentCreatePreset}
          onDraftWithMarketingAgent={ctx.handleDraftWithMarketingFromPanel}
          onCreated={() => {
            ctx.closeCreateContent();
            void ctx.invalidateWorkspace();
          }}
          onCancel={ctx.closeCreateContent}
        />
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.brandManagerOpen}
        onClose={() => ctx.setBrandManagerOpen(false)}
        title="Brand Profiles"
        width={560}
      >
        <BrandProfileManager />
      </SlideOverPanel>

      {/* Brands FAB */}
      <button
        type="button"
        onClick={() => ctx.setBrandManagerOpen(true)}
        className="fixed bottom-6 right-6 z-30 px-4 py-2 rounded-full text-xs font-medium bg-app-card border border-app-border text-app-text shadow-lg hover:bg-app-nav-hover transition-colors"
      >
        Brands
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Side-effect handlers at layout level
// ---------------------------------------------------------------------------

function MarketingLayoutEffects(): null {
  const ctx = useMarketingContext();
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  // Deep link: /marketing/content?contentId=<uuid> opens slide-over
  useEffect(() => {
    if (segment !== 'content') return;
    const id = new URLSearchParams(location.search).get('contentId');
    if (id) ctx.openDetail({ type: 'content', id });
  }, [segment, location.search, ctx.openDetail]);

  // Location state handlers (openInstagramContent, openPipeline)
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
      ctx.openCreateContentWithPreset('instagram');
      handled = true;
    }
    if (handled) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate, ctx.openCreateContentWithPreset]);

  return null;
}

// ---------------------------------------------------------------------------
// Legacy redirect helper
// ---------------------------------------------------------------------------

function LegacyRedirectRoute({ segment }: { segment: string }): JSX.Element {
  const target = LEGACY_REDIRECTS[segment];
  return <Navigate to={target || ROUTES.MARKETING} replace />;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

function MarketingLayoutInner(): JSX.Element {
  const ctx = useMarketingContext();
  const location = useLocation();

  // Legacy ?panel= redirect on /marketing
  const normPath = location.pathname.replace(/\/$/, '') || '/';
  if (normPath === '/marketing') {
    const params = new URLSearchParams(location.search);
    const legacyPanel = params.get('panel');
    if (legacyPanel === 'builder' || legacyPanel === 'intelligence') {
      params.delete('panel');
      const qs = params.toString();
      const path = legacyPanel === 'builder' ? '/marketing/builder' : '/marketing/intelligence';
      return <Navigate to={{ pathname: path, search: qs ? `?${qs}` : '' }} replace />;
    }
  }

  return (
    <ViewportContainer density="compact" className="min-h-0 flex-1 bg-app">
      <MarketingBootstrapErrorBanner error={ctx.bootstrapError} onRetry={() => void ctx.refetchBootstrap()} />
      <MarketingWorkspaceSecondaryAlerts
        funnelError={ctx.funnelError}
        brandsError={ctx.brandsError}
        onRetryFunnel={() => void ctx.refetchFunnel()}
        onRetryBrands={() => void ctx.refetchBrands()}
      />

      <MarketingLayoutEffects />

      <Routes>
        {/* Hub: Lucy CMO landing */}
        <Route index element={<LucyHubRoute />} />

        {/* Workspace routes — wrapped in workspace layout (SparkBar + canvas) */}
        <Route element={<MarketingWorkspaceLayout />}>
          <Route path="pipeline" element={<PipelineRoute />} />
          <Route path="content" element={<PipelineRoute />} />
          <Route path="calendar" element={<CalendarRoute />} />
          <Route path="builder" element={<BuilderRoute />} />
          <Route path="intelligence" element={<IntelligenceRoute />} />
          <Route path="brand-social" element={<CommandCenterRoute column="brand-social" />} />
          <Route path="funnel" element={<CommandCenterRoute column="funnel" />} />
          <Route path="experiments" element={<CommandCenterRoute column="experiments" />} />
          <Route path="sandbox" element={<CommandCenterRoute column="sandbox" />} />
        </Route>

        {/* Direct redirects */}
        <Route path="lucy" element={<Navigate to="/marketing" replace />} />
        <Route path="workspace" element={<Navigate to="/marketing" replace />} />
        <Route path="executive" element={<Navigate to="/marketing" replace />} />
        <Route path="campaigns" element={<Navigate to={ROUTES.MARKETING_EXPERIMENTS} replace />} />

        {/* Legacy redirects */}
        {Object.keys(LEGACY_REDIRECTS).map((seg) => (
          <Route key={seg} path={seg} element={<LegacyRedirectRoute segment={seg} />} />
        ))}

        {/* Catch-all: unknown marketing sub-route → hub */}
        <Route path="*" element={<Navigate to="/marketing" replace />} />
      </Routes>

      <MarketingSharedPanels />
    </ViewportContainer>
  );
}

export function MarketingLayout(): JSX.Element {
  return (
    <MarketingProvider>
      <MarketingLayoutInner />
    </MarketingProvider>
  );
}
