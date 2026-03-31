import React, { Suspense, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ROUTES } from '@/lib/routes';
import { MarketingProvider, useMarketingContext } from './MarketingContext';
import { MarketingWorkspaceLayout } from './MarketingWorkspaceLayout';
import { LucyMarketingPage } from './LucyMarketingPage';
import { MarketingPipelinePage } from './components/MarketingPipelinePage';
import { MarketingCommandCenter } from './MarketingCommandCenter';
import { FunnelStrip } from './components/FunnelStrip';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { CampaignCreatePanel } from './components/CampaignCreatePanel';
import { ContentCreatePanel } from './components/ContentCreatePanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { BrandProfileManager } from './components/BrandProfileManager';
import { EmailCampaignDetailPanel } from './components/EmailCampaignDetailPanel';
import { MarketingWorkspaceSecondaryAlerts } from './components/MarketingWorkspaceSecondaryAlerts';
import { buildMarketingModeLocation } from './lib/marketingPathUtils';

// ---------------------------------------------------------------------------
// Lazy sections
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------

function SectionFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route-level wrappers (bridge context → props without touching subpages)
// ---------------------------------------------------------------------------

/** Lucy hub — error banners + context-driven LucyMarketingPage. */
function LucyHubRoute(): JSX.Element {
  const ctx = useMarketingContext();
  return (
    <>
      <MarketingBootstrapBanner error={ctx.bootstrapError} onRetry={() => void ctx.refetchBootstrap()} />
      <MarketingWorkspaceSecondaryAlerts
        funnelError={ctx.funnelError}
        brandsError={ctx.brandsError}
        onRetryFunnel={() => void ctx.refetchFunnel()}
        onRetryBrands={() => void ctx.refetchBrands()}
      />
      <LucyMarketingPage />
    </>
  );
}

/** Pipeline / Content board — reads context internally. */
function PipelineRoute(): JSX.Element {
  return <MarketingPipelinePage />;
}

/** Calendar with funnel strip */
function CalendarRoute(): JSX.Element {
  const ctx = useMarketingContext();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <ErrorBoundary resetKey="calendar">
          <Suspense fallback={<SectionFallback />}>
            <ContentCalendarTab />
          </Suspense>
        </ErrorBoundary>
      </div>
      {ctx.funnelError ? (
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
      ) : null}
      <FunnelStrip
        funnel={ctx.funnel}
        hotLeads={ctx.hotLeads}
        onLeadClick={(id) => ctx.openDetail({ type: 'lead', id })}
      />
    </div>
  );
}

/** Builder (email / landing page / popup / document) */
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

/** Competitor Intelligence */
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

/** Command Center (single-column view) */
function CommandCenterRoute({
  column,
}: {
  column: 'brand-social' | 'funnel' | 'experiments' | 'sandbox';
}): JSX.Element {
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
      onExecuteWithDora={ctx.executeWithDora}
      onOpenCampaign={(id) => ctx.openDetail({ type: 'campaign', id })}
      onOpenEmail={(id) => ctx.openDetail({ type: 'email', id })}
      onOpenPipeline={() => void navigate(ROUTES.MARKETING_PIPELINE)}
      onOpenBuilder={() => void navigate(buildMarketingModeLocation('builder', location.search))}
      onOpenIntelligence={() => void navigate(buildMarketingModeLocation('intelligence', location.search))}
      onReconnectSocial={() => void ctx.refreshCommandCenter({ fresh: true })}
    />
  );
}

// ---------------------------------------------------------------------------
// Legacy ?panel= redirect (hub-only)
// ---------------------------------------------------------------------------

function LegacyPanelRedirect(): JSX.Element | null {
  const location = useLocation();
  const panelParams = new URLSearchParams(
    location.search.startsWith('?') ? location.search.slice(1) : location.search,
  );
  const legacyPanel = panelParams.get('panel');
  if (legacyPanel === 'builder' || legacyPanel === 'intelligence') {
    panelParams.delete('panel');
    const qs = panelParams.toString();
    const path = legacyPanel === 'builder' ? '/marketing/builder' : '/marketing/intelligence';
    return <Navigate to={{ pathname: path, search: qs ? `?${qs}` : '' }} replace />;
  }
  // Not a legacy panel — render the hub
  return <LucyHubRoute />;
}

// ---------------------------------------------------------------------------
// Bootstrap error banner
// ---------------------------------------------------------------------------

function MarketingBootstrapBanner({
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
// Shared panels (detail, create, brand — unified, no duplication)
// ---------------------------------------------------------------------------

function MarketingPanels(): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  const handleDetailUpdated = useCallback(() => {
    void ctx.invalidateWorkspace();
  }, [ctx.invalidateWorkspace]);

  return (
    <>
      {/* Detail panels */}
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
            <ContentDetailPanel contentId={ctx.detail.id} onUpdated={handleDetailUpdated} />
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
          <CampaignDetailPanel campaignId={ctx.detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.detail?.type === 'lead'}
        onClose={ctx.closeDetail}
        title="Lead Detail"
        width={720}
      >
        {ctx.detail?.type === 'lead' && (
          <LeadDetailPanel leadId={ctx.detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={ctx.detail?.type === 'email'}
        onClose={ctx.closeDetail}
        title="Email campaign"
        width={960}
      >
        {ctx.detail?.type === 'email' && (
          <EmailCampaignDetailPanel emailId={ctx.detail.id} onUpdated={handleDetailUpdated} />
        )}
      </SlideOverPanel>

      {/* Create panels */}
      <SlideOverPanel
        isOpen={ctx.createCampaignOpen}
        onClose={ctx.closeCreateCampaign}
        title="New Campaign"
        width={520}
      >
        <CampaignCreatePanel
          onCreated={() => {
            ctx.closeCreateCampaign();
            void ctx.invalidateWorkspace();
          }}
          onCancel={ctx.closeCreateCampaign}
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
        onClose={ctx.closeBrandManager}
        title="Brand Profiles"
        width={560}
      >
        <BrandProfileManager />
      </SlideOverPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Brands FAB
// ---------------------------------------------------------------------------

function BrandsFab(): JSX.Element {
  const ctx = useMarketingContext();
  return (
    <button
      type="button"
      onClick={ctx.openBrandManager}
      className="fixed bottom-6 right-6 z-30 px-4 py-2 rounded-full text-xs font-medium bg-app-card border border-app-border text-app-text shadow-lg hover:bg-app-nav-hover transition-colors"
    >
      Brands
    </button>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------


function MarketingRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/marketing">
        {/* Hub — exact /marketing (handles ?panel= legacy too) */}
        <Route index element={<LegacyPanelRedirect />} />

        {/* Workspace routes — wrapped in workspace layout with Outlet */}
        <Route element={<MarketingWorkspaceLayout />}>
          <Route path="pipeline" element={<PipelineRoute />} />
          <Route path="content" element={<PipelineRoute />} />
          <Route
            path="calendar"
            element={
              <ErrorBoundary resetKey="calendar">
                <CalendarRoute />
              </ErrorBoundary>
            }
          />
          <Route path="builder" element={<BuilderRoute />} />
          <Route path="intelligence" element={<IntelligenceRoute />} />
          <Route path="brand-social" element={<CommandCenterRoute column="brand-social" />} />
          <Route path="funnel" element={<CommandCenterRoute column="funnel" />} />
          <Route path="experiments" element={<CommandCenterRoute column="experiments" />} />
          <Route path="sandbox" element={<CommandCenterRoute column="sandbox" />} />
        </Route>

        {/* Named legacy redirects */}
        <Route path="lucy" element={<Navigate to="/marketing" replace />} />
        <Route path="workspace" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="executive" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="campaigns" element={<Navigate to={ROUTES.MARKETING_EXPERIMENTS} replace />} />
        <Route path="email" element={<Navigate to="/marketing/builder?type=email" replace />} />
        <Route path="pages" element={<Navigate to="/marketing/builder?type=landing_page" replace />} />
        <Route path="popups" element={<Navigate to="/marketing/builder?type=popup" replace />} />
        <Route path="documents" element={<Navigate to="/marketing/builder?type=document" replace />} />
        <Route path="agent" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="command-center" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />
        <Route path="dashboard" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />
        <Route path="creative-hub" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />
        <Route path="automation" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />
        <Route path="leads" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />
        <Route path="approvals" element={<Navigate to={ROUTES.MARKETING_PIPELINE} replace />} />

        {/* Unknown segment → hub */}
        <Route path="*" element={<Navigate to="/marketing" replace />} />
      </Route>
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export function MarketingLayout(): JSX.Element {
  return (
    <MarketingProvider>
      <ViewportContainer density="compact" className="min-h-0 flex-1 bg-app">
        <MarketingRouter />
      </ViewportContainer>
      <MarketingPanels />
      <BrandsFab />
    </MarketingProvider>
  );
}
