import React, { Suspense, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ROUTES } from '@/lib/routes';
import { MarketingProvider, useMarketingContext } from './MarketingContext';
import { MarketingWorkspaceLayout } from './MarketingWorkspaceLayout';
import { LucyMarketingPage } from './LucyMarketingPage';
import { NewOfferPage } from './NewOfferPage';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { LeadDetailPanel } from './components/LeadDetailPanel';
import { BrandProfileManager } from './components/BrandProfileManager';
import { TenantContentSetupPanel } from './components/TenantContentSetupPanel';
import { EmailCampaignDetailPanel } from './components/EmailCampaignDetailPanel';
import { MarketingWorkspaceSecondaryAlerts } from './components/MarketingWorkspaceSecondaryAlerts';
import { HelpDrawer } from '@/components/ui/HelpDrawer';

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
        brandsError={ctx.brandsError}
        onRetryBrands={() => void ctx.refetchBrands()}
      />
      <LucyMarketingPage />
    </>
  );
}

/** Old board URLs land on the offer list, keeping `?contentId=` (and any status) so links still open their item. */
function ToOffers({ status }: { status?: string }): JSX.Element {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (status && !params.has('status')) params.set('status', status);
  const qs = params.toString();
  return <Navigate to={{ pathname: ROUTES.MARKETING, search: qs ? `?${qs}` : '' }} replace />;
}

function CalendarRoute(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary resetKey="calendar">
        <Suspense fallback={<SectionFallback />}>
          <ContentCalendarTab />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

/** Builder (email designs) */
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

/** Shop settings: the shop's content setup and its brand profiles, on paper (UX-05 replaces the Brands button). */
function ShopSettingsRoute(): JSX.Element {
  return (
    <div data-theme="light" className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-app-bg text-app-text">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-lg font-semibold">Shop settings</h1>
        <TenantContentSetupPanel />
        <section aria-label="Brand profiles">
          <BrandProfileManager />
        </section>
      </div>
    </div>
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
  if (panelParams.get('panel') === 'builder') {
    panelParams.delete('panel');
    const qs = panelParams.toString();
    return <Navigate to={{ pathname: ROUTES.MARKETING_BUILDER, search: qs ? `?${qs}` : '' }} replace />;
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
  const handleDetailUpdated = useCallback(() => {
    void ctx.invalidateWorkspace();
  }, [ctx.invalidateWorkspace]);

  return (
    <>
      {/* Detail panels */}
      <SlideOverPanel
        isOpen={ctx.detail?.type === 'content'}
        onClose={ctx.closeDetail}
        title="Content Detail"
        width={1200}
      >
        {ctx.detail?.type === 'content' && (
          <Suspense fallback={<SectionFallback />}>
            <ContentDetailPanel
              contentId={ctx.detail.id}
              refreshKey={ctx.detailRefreshKey}
              onUpdated={handleDetailUpdated}
            />
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
          <EmailCampaignDetailPanel emailId={ctx.detail.id} />
        )}
      </SlideOverPanel>
    </>
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
        <Route path="offer/new" element={<NewOfferPage />} />

        {/* Workspace routes — wrapped in workspace layout with Outlet */}
        <Route element={<MarketingWorkspaceLayout />}>
          <Route
            path="calendar"
            element={
              <ErrorBoundary resetKey="calendar">
                <CalendarRoute />
              </ErrorBoundary>
            }
          />
          <Route path="builder" element={<BuilderRoute />} />
          <Route path="shop" element={<ShopSettingsRoute />} />
        </Route>

        {/* Named legacy redirects */}
        <Route path="lucy" element={<Navigate to="/marketing" replace />} />
        <Route path="workspace" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="executive" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="intelligence" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="brand-social" element={<Navigate to={ROUTES.MARKETING_SHOP} replace />} />
        <Route path="funnel" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="experiments" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="sandbox" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="campaigns" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="email" element={<Navigate to="/marketing/builder?type=email" replace />} />
        <Route path="pages" element={<Navigate to={ROUTES.MARKETING_BUILDER} replace />} />
        <Route path="popups" element={<Navigate to={ROUTES.MARKETING_BUILDER} replace />} />
        <Route path="documents" element={<Navigate to={ROUTES.MARKETING_BUILDER} replace />} />
        <Route path="agent" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="pipeline" element={<ToOffers />} />
        <Route path="content" element={<ToOffers />} />
        <Route path="approvals" element={<ToOffers status="review" />} />
        <Route path="command-center" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="dashboard" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="creative-hub" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="automation" element={<Navigate to={ROUTES.MARKETING} replace />} />
        <Route path="leads" element={<Navigate to={ROUTES.MARKETING} replace />} />

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
      <ViewportContainer density="compact" className="min-h-0 flex-1">
        <MarketingRouter />
      </ViewportContainer>
      <MarketingPanels />
      <div data-theme="light" className="text-app-text">
        <HelpDrawer />
      </div>
    </MarketingProvider>
  );
}
