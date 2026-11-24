import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  EngagePanels, EngageQuickActions, EngageSectionBody, EngageTabStrip, useEngageAccess, useEngageWorkspace,
} from '@/engage/engageWorkspace';
import { ROUTES } from '@/lib/routes';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { ViewportWrapper } from '@/pages/marketing/components/bento/ViewportWrapper';
import { ContentTenantSwitch } from '@/pages/marketing/components/ContentTenantSwitch';
import { DoraRail } from '@/pages/marketing/components/DoraRail';
import { useContentTenant } from '@/pages/marketing/lib/contentTenant';
import { shopOfferRows, type ShopOfferRow } from '@/pages/marketing/lib/shopOffers';
import { useMarketingContext } from './MarketingContext';

const MORE_LINKS: Array<{ label: string; path: string }> = [
  { label: 'Pipeline', path: ROUTES.MARKETING_PIPELINE },
  { label: 'Calendar', path: ROUTES.MARKETING_CALENDAR },
  { label: 'Builder', path: ROUTES.MARKETING_BUILDER },
];

/**
 * Shop counter at `/marketing`. Offers for the selected shop. Lucy stays closed until asked.
 *
 * Where the organization may use engage (ADR-016), the same page carries the engage sections as tabs after Offers,
 * their create actions under More, and their record panels.
 */
export function LucyMarketingPage(): JSX.Element {
  const ctx = useMarketingContext();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((s) => s.user?.authUserId ?? s.user?.id ?? null);
  const { setup } = useContentTenant();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lucyOpen, setLucyOpen] = useState(false);
  const engage = useEngageAccess();
  const workspace = useEngageWorkspace('lucy', engage.isAdmin);
  const onOffers = !engage.available || workspace.tab === 'lucy';

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const [offers, posts] = await Promise.all([
        marketingAPI.listContent(userId, { contentType: 'offer', pageSize: '50' }),
        marketingAPI.listContent(userId, { channel: 'instagram', pageSize: '200' }),
      ]);
      const byId = new Map<string, ContentItem>();
      for (const item of [...offers.data, ...posts.data]) byId.set(item.id, item);
      setItems([...byId.values()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load offers');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, setup.orgKey]);

  useEffect(() => {
    const st = location.state as { openInstagramAi?: boolean } | null;
    if (!st?.openInstagramAi) return;
    navigate(ROUTES.MARKETING_OFFER_NEW, { replace: true });
  }, [location.state, location.pathname, location.search, navigate]);

  const rows = shopOfferRows(items, setup);

  useEffect(() => {
    if (loading || loadError) return;
    if (ctx.detail?.type !== 'content') return;
    const openId = ctx.detail.id;
    const visible = rows.some((row) => row.offer.id === openId || row.child?.id === openId);
    if (!visible) ctx.closeDetail();
  }, [loading, loadError, rows, ctx]);

  return (
    <ViewportWrapper className="relative min-h-0 flex-1 bg-[#f4efe8]">
      <div className="flex h-full min-h-0 flex-col text-[#1c1917]">
        <header className="flex flex-wrap items-end gap-3 border-b border-[#e7e0d6] px-4 py-3">
          <div className="w-48">
            <ContentTenantSwitch />
          </div>
          <button
            type="button"
            className="mb-1 text-sm"
            onClick={() => navigate(ROUTES.MARKETING_OFFER_NEW)}
          >
            New offer
          </button>
          <button
            type="button"
            className="mb-1 text-sm text-[#78716c]"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            More
          </button>
          <button
            type="button"
            className="mb-1 ml-auto text-sm text-[#78716c]"
            onClick={() => setLucyOpen(true)}
          >
            Ask Lucy
          </button>
        </header>
        {moreOpen ? (
          <div className="border-b border-[#e7e0d6] px-4 py-2">
            <nav aria-label="More" className="flex flex-wrap gap-3">
              {MORE_LINKS.map((link) => (
                <button
                  key={link.path}
                  type="button"
                  className="text-sm"
                  onClick={() => navigate(link.path)}
                >
                  {link.label}
                </button>
              ))}
            </nav>
            {engage.available ? (
              <div data-theme="light" className="mt-2 grid max-w-md grid-cols-2 gap-1.5 text-app-text" data-testid="engage-create">
                <EngageQuickActions workspace={workspace} />
              </div>
            ) : null}
          </div>
        ) : null}
        {engage.available ? (
          <div data-theme="light" className="border-b border-[#e7e0d6] px-4 py-2 text-app-text">
            <EngageTabStrip workspace={workspace} withLucy lucyLabel="Offers" />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          {onOffers ? (
            <div className="mx-auto w-full max-w-xl">
              <h1 className="text-lg font-medium">{setup.brandName}</h1>
              {loading ? <p className="mt-4 text-sm text-[#78716c]">Loading offers</p> : null}
              {loadError ? (
                <div className="mt-4 rounded-2xl border border-[#e7e0d6] bg-white p-5">
                  <p className="text-sm text-red-700">{loadError}</p>
                  <button type="button" className="mt-3 text-sm" onClick={() => void load()}>
                    Try again
                  </button>
                </div>
              ) : null}
              {!loading && !loadError && rows.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-[#e7e0d6] bg-white p-5">
                  <p className="text-sm text-[#78716c]">No offers for {setup.brandName}.</p>
                  <button type="button" className="mt-3 text-sm" onClick={() => navigate(ROUTES.MARKETING_OFFER_NEW)}>
                    New offer
                  </button>
                </div>
              ) : null}
              <ul className="mt-4 space-y-4">
                {rows.map((row) => (
                  <li key={row.offer.id}>
                    <OfferLine row={row} onOpen={() => ctx.openDetail({ type: 'content', id: row.offer.id })} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div data-theme="light" className="mx-auto w-full max-w-5xl rounded-2xl border border-[#e7e0d6] bg-white p-4 text-app-text">
              <EngageSectionBody workspace={workspace} />
            </div>
          )}
        </div>
      </div>
      {lucyOpen ? (
        <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-app-border bg-[#0a0c12] text-app-text" data-testid="lucy-drawer">
          <div className="flex justify-end px-3 py-2">
            <button type="button" className="text-sm text-app-muted" onClick={() => setLucyOpen(false)}>
              Close Lucy
            </button>
          </div>
          <DoraRail
            layout="pageSplit"
            selectedCard={null}
          />
        </div>
      ) : null}
      {engage.available ? (
        <div data-theme="light" className="text-app-text">
          <EngagePanels workspace={workspace} />
        </div>
      ) : null}
    </ViewportWrapper>
  );
}

function OfferLine({ row, onOpen }: { row: ShopOfferRow; onOpen: () => void }): JSX.Element {
  const still = row.child?.image_url || row.offer.image_url;
  return (
    <button type="button" onClick={onOpen} className="w-full overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white text-left">
      {still ? (
        <img src={still} alt="" className="h-64 w-full object-cover" />
      ) : (
        <span className="flex h-64 items-center justify-center bg-[#f4efe8] text-sm text-[#78716c]">No still yet</span>
      )}
      <span className="flex items-baseline justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="block truncate text-base">{row.product}</span>
          {row.price ? <span className="block text-sm text-[#78716c]">{row.price}</span> : null}
        </span>
        <span className="text-xs text-[#78716c]">{row.step}</span>
      </span>
    </button>
  );
}
