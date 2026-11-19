import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  FlaskConical,
  Instagram,
  LayoutGrid,
  Mail,
  Megaphone,
  Radar,
  Share2,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import {
  EngageGoToTiles, EngagePanels, EngageQuickActions, EngageSectionBody, EngageTabStrip, useEngageAccess, useEngageWorkspace,
} from '@/engage/engageWorkspace';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { BentoCard } from '@/pages/marketing/components/bento/BentoCard';
import { ViewportWrapper } from '@/pages/marketing/components/bento/ViewportWrapper';
import { DoraRail } from '@/pages/marketing/components/DoraRail';
import { MarketingMetricChips } from '@/pages/marketing/components/MarketingMetricChips';
import { LUCY_UI_GREETING } from '@/pages/marketing/lib/lucyUiGreeting';
import { lucyTokens } from '@/pages/marketing/lib/lucyVisualTokens';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';
import { useMarketingContext } from './MarketingContext';

const TILE_BTN =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-slate-950/50 px-2 py-1.5 text-xs font-medium text-app-text shadow-sm ring-1 ring-violet-500/10 transition-all hover:brightness-110 sm:justify-start';

const PRIMARY_CREATE =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary-500/35 bg-gradient-to-b from-primary-950/50 to-slate-950/90 px-2 py-1.5 text-xs font-medium text-app-text ring-1 ring-primary-500/20 transition-all hover:brightness-110 sm:justify-start';

const IG_BTN =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-pink-500/35 bg-gradient-to-b from-pink-950/40 to-rose-950/50 px-2 py-1.5 text-xs font-medium text-app-text ring-1 ring-pink-500/20 transition-all hover:brightness-110 sm:justify-start';

/** Main bento: Lucy gets 3/5 width; merged CMO+stats column 2/5 */
const LUCY_BENTO_GRID_CLASS =
  'grid h-full min-h-0 w-full min-w-0 grid-cols-1 gap-2 p-2 md:gap-3 md:p-4 lg:grid-cols-5 lg:grid-rows-1 xl:gap-3';

/**
 * Lucy CMO bento (`/marketing`): viewport-locked grid with Lucy (Dora rail).
 * Reads all data from {@link useMarketingContext}.
 *
 * Where the signed-in organization may use engage (ADR-016), the same page also holds the engage sections: tabs next to
 * the Lucy chat, tiles and quick actions in the CMO column, and panels for records and editors. Where it may not, none
 * of that is shown and the page is exactly the Company-OS Lucy page.
 */
export function LucyMarketingPage(): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [igModalSignal, setIgModalSignal] = useState(0);
  const engage = useEngageAccess();
  const workspace = useEngageWorkspace('lucy', engage.isAdmin);
  const onLucyTab = !engage.available || workspace.tab === 'lucy';

  useEffect(() => {
    const st = location.state as { openInstagramAi?: boolean } | null;
    if (st?.openInstagramAi) {
      setIgModalSignal((k) => k + 1);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  const openInstagramAi = useCallback(() => {
    setIgModalSignal((k) => k + 1);
  }, []);

  return (
    <ViewportWrapper
      className={cn(
        'min-h-0 flex-1 bg-gradient-to-b from-[#030712] via-[#050816] to-[#0a0c12]',
        marketingShell.borderSubtle,
      )}
    >
      <div className={LUCY_BENTO_GRID_CLASS}>
        <div className="order-1 flex min-h-[min(48vh,420px)] flex-col min-w-0 lg:order-none lg:col-span-3 lg:row-start-1 lg:min-h-0 xl:min-h-0">
          {engage.available && (
            <div className="mb-2 shrink-0 rounded-xl border border-white/[0.08] bg-[#080a0e] px-3 py-2">
              <EngageTabStrip workspace={workspace} withLucy />
            </div>
          )}
          {/* Hidden, not unmounted, while an engage tab is open: the chat keeps its conversation. */}
          <div className={cn('flex min-h-0 flex-1 flex-col', !onLucyTab && 'hidden')}>
            <DoraRail
              layout="pageSplit"
              selectedCard={null}
              instagramModalSignal={igModalSignal}
              executePrompt={ctx.doraExecutePrompt}
            />
          </div>
          {!onLucyTab && (
            <BentoCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <EngageSectionBody workspace={workspace} />
              </div>
            </BentoCard>
          )}
        </div>

        <BentoCard className="order-2 overflow-hidden lg:order-none lg:col-span-2 lg:row-start-1">
          <div className="flex min-h-0 max-h-[min(92vh,920px)] flex-1 flex-col gap-3 overflow-y-auto">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    color: lucyTokens.colors.glow,
                    background: 'rgba(124,58,237,0.12)',
                    border: `1px solid ${lucyTokens.colors.border}`,
                  }}
                >
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                  CMO
                </span>
              </div>
              <h1 className="mt-1.5 text-sm font-semibold leading-tight tracking-tight text-app-text">
                {LUCY_UI_GREETING.headline}
              </h1>
              <p className="mt-1 line-clamp-4 text-xs leading-snug text-app-muted">{LUCY_UI_GREETING.message}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-app-muted">Go to</p>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_BRAND_SOCIAL)}
                  className={TILE_BTN}
                >
                  <Share2 className="h-3.5 w-3.5 shrink-0 text-sky-400/90" />
                  <span className="truncate">Brand & social</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_FUNNEL)}
                  className={TILE_BTN}
                >
                  <Workflow className="h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  <span className="truncate">Funnel</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_EXPERIMENTS)}
                  className={TILE_BTN}
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0 text-orange-400/90" />
                  <span className="truncate">Campaigns & lab</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_SANDBOX)}
                  className={TILE_BTN}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-purple-400/90" />
                  <span className="truncate">Lucy sandbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_PIPELINE)}
                  className={TILE_BTN}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-primary-400" />
                  <span className="truncate">Pipeline</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_CALENDAR)}
                  className={TILE_BTN}
                >
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-cyan-400/90" />
                  <span className="truncate">Calendar</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_BUILDER)}
                  className={TILE_BTN}
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" />
                  <span className="truncate">Builder</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_INTELLIGENCE)}
                  className={TILE_BTN}
                >
                  <Radar className="h-3.5 w-3.5 shrink-0 text-violet-400/90" />
                  <span className="truncate">Intel</span>
                </button>
              </div>
              {engage.available && (
                <>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-app-muted">Engage</p>
                  <EngageGoToTiles workspace={workspace} />
                </>
              )}
            </div>

            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Live stats</p>
              <div className="mt-1.5">
                <MarketingMetricChips metrics={ctx.metrics} loading={ctx.metricsLoading} variant="bento" />
              </div>
              <div className="mt-2 rounded-lg border border-white/[0.06] bg-slate-950/40 px-2 py-1.5 ring-1 ring-cyan-500/10">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-cyan-400/90">Social proof</p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-app-muted">
                  <Star className="h-3 w-3 shrink-0 text-amber-400/90" aria-hidden />
                  <span className="leading-tight">Teams ship faster with Lucy on the marketing hub.</span>
                </div>
                <p className="mt-1 text-[10px] text-app-muted">
                  Approvals in queue:{' '}
                  <span className="font-semibold text-app-text">{ctx.approvalItems.length}</span>
                </p>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Quick actions</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button type="button" onClick={ctx.openCreateCampaign} className={PRIMARY_CREATE}>
                  <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary-400" />
                  <span className="truncate">Campaign</span>
                </button>
                <button type="button" onClick={() => ctx.openCreateContent('default')} className={TILE_BTN}>
                  <Target className="h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  <span className="truncate">Content</span>
                </button>
                <button type="button" onClick={openInstagramAi} className={IG_BTN}>
                  <Instagram className="h-3.5 w-3.5 shrink-0 text-pink-300" />
                  <span className="truncate">IG AI</span>
                </button>
                <button type="button" onClick={ctx.handleCreateInstagramContent} className={TILE_BTN}>
                  <Instagram className="h-3.5 w-3.5 shrink-0 text-pink-300/80" />
                  <span className="truncate">IG post</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MARKETING_BUILDER)}
                  className={cn(TILE_BTN, 'col-span-2')}
                >
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-app-muted" />
                  Open builder
                </button>
                {engage.available && <EngageQuickActions workspace={workspace} />}
              </div>
            </div>
          </div>
        </BentoCard>
      </div>
      {engage.available && <EngagePanels workspace={workspace} />}
    </ViewportWrapper>
  );
}
