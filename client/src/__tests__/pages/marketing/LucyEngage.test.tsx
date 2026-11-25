import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setSessionSurface } from '@/lib/productSurface';
import { MarketingLayout } from '@/pages/marketing/MarketingLayout';

/**
 * ADR-016: the marketing page and engage are one page. Where the signed-in organization may use engage (surface
 * `all`, and the engage API says so), the shop counter also holds the engage sections as tabs after Offers, their
 * create actions under More, and their panels. Everywhere else it is exactly the shop counter.
 */

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: { user: { authUserId: string; id: string; role: string }; accessToken: string }) => unknown) => {
    const state = { user: { authUserId: 'u1', id: 'u1', role: 'member' }, accessToken: 'tok' };
    return selector ? selector(state) : state;
  },
}));
vi.mock('@/hooks/useMarketingApprovalQueue', () => ({
  useMarketingApprovalQueue: () => ({ items: [], approve: vi.fn() }),
}));
vi.mock('@/pages/marketing/components/DoraRail', () => ({
  DoraRail: () => <div data-testid="dora-rail" />,
  MARKETING_DORA_RAIL_OUTSET_RIGHT: 'right-6',
}));
vi.mock('@/lib/marketingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketingApi')>();
  return {
    ...actual,
    marketingAPI: {
      ...actual.marketingAPI,
      getDashboardBootstrap: vi.fn().mockResolvedValue({
        metrics: { mqls: 12, cpl: 40, roi: 2.5, emailOpenRate: 22.5, monthlyTrend: [] },
        campaigns: { data: [] }, content: { data: [] }, emailCampaigns: { data: [] }, hotLeads: [],
      }),
      getLeadFunnel: vi.fn().mockResolvedValue({ stages: [] }),
      listBrandProfiles: vi.fn().mockResolvedValue({ profiles: [], total: 0 }),
      listContent: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50 }),
      getCommandCenter: vi.fn().mockResolvedValue({
        generatedAt: new Date().toISOString(), days: 7,
        funnel7d: { new: 0, contacted: 0, nurturing: 0, qualified: 0, converted: 0, disqualified: 0 }, funnelSeries7d: [],
        cacRoi: { cac: 0, cpl: 0, roi: 0, ltvDisplay: null, signupVelocity: 0, landingConversionProxy: null },
        activeCampaigns: 0, experiments: [],
        socialPulse: { connected: false, lastSyncIso: null, errorCode: null, vibeScore: 0, accounts: [] }, plays: [],
      }),
    },
  };
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const original = globalThis.fetch;
let urls: string[];
/** The engage API as one organization sees it: `me` is what GET /engage/me answers. */
function mockEngage(me: () => Response) {
  urls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/engage/me')) return me();
    if (url.includes('/engage/profiles')) {
      return json({ profiles: [{ id: 'p1', externalId: 'kitap-1', email: 'a@example.com', emailConsent: 'granted', suppressed: false, erased: false, createdAt: '2026-11-09T10:00:00Z', lastEventAt: null }], nextCursor: null });
    }
    if (url.endsWith('/engage/templates')) return json({ templates: [] });
    if (url.endsWith('/engage/segments')) return json({ segments: [] });
    if (url.endsWith('/engage/journeys')) return json({ journeys: [] });
    return json({}, 404);
  }) as typeof fetch;
}

function renderLucy(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/marketing']}>
        <Routes><Route path="/*" element={<MarketingLayout />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider> as ReactElement,
  );
}

afterEach(() => { globalThis.fetch = original; vi.unstubAllEnvs(); setSessionSurface(null); });

describe('the marketing page and engage as one page (ADR-016)', () => {
  const allowed = () => json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'all' });
  const openMore = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));

  it('workspace surface: exactly the shop counter, and the engage API is never asked', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'workspace');
    mockEngage(allowed);
    renderLucy();
    await screen.findByText('No offers for Messign.');
    expect(screen.queryByRole('tablist')).toBeNull();
    openMore();
    expect(screen.queryByTestId('hub-new-journey')).toBeNull();
    expect(urls.filter((u) => u.includes('/engage/'))).toEqual([]);
  });

  it('all surface, organization refused by the engage API: the page stays exactly the shop counter', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(() => json({ error: 'Organization is not an engage tenant' }, 403));
    renderLucy();
    await waitFor(() => expect(urls.some((u) => u.endsWith('/engage/me'))).toBe(true));
    expect(screen.queryByRole('tablist')).toBeNull();
    openMore();
    expect(screen.getByRole('button', { name: /^Calendar$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('hub-new-journey')).toBeNull();
  });

  it('all surface, engage allowed: Offers and the engage sections are tabs of one page, create actions under More', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(allowed);
    renderLucy();
    expect(await screen.findByTestId('hub-tab-customers')).toBeInTheDocument();
    for (const id of ['lucy', 'customers', 'journeys', 'segments', 'templates']) expect(screen.getByTestId(`hub-tab-${id}`)).toBeInTheDocument();
    expect(screen.getByTestId('hub-tab-lucy')).toHaveTextContent('Offers');
    expect(screen.getByTestId('hub-tab-lucy')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('button', { name: 'New offer' }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('hub-go-journeys')).toBeNull();
    openMore();
    expect(screen.getByRole('button', { name: /^Calendar$/i })).toBeInTheDocument();
    expect(screen.getByTestId('hub-new-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('hub-customers')).toBeNull();
  });

  it('an engage tab shows the section in the main area; Offers brings the shop counter back', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(allowed);
    renderLucy();
    fireEvent.click(await screen.findByTestId('hub-tab-customers'));
    expect(await screen.findByText('kitap-1')).toBeInTheDocument();
    expect(screen.queryByText('No offers for Messign.')).toBeNull();
    fireEvent.click(screen.getByTestId('hub-tab-lucy'));
    expect(await screen.findByText('No offers for Messign.')).toBeInTheDocument();
    expect(screen.queryByTestId('hub-customers')).toBeNull();
  });

  it('a create action goes to its section and opens its panel over the page', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(allowed);
    renderLucy();
    await screen.findByTestId('hub-tab-customers');
    openMore();
    fireEvent.click(screen.getByTestId('hub-new-journey'));
    expect(await screen.findByTestId('journey-editor')).toBeInTheDocument();
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('journey-editor'));
    expect(screen.getByTestId('hub-tab-journeys')).toHaveAttribute('aria-selected', 'true');
  });

  it('choosing a tab closes the open panel and shows that section', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(allowed);
    renderLucy();
    await screen.findByTestId('hub-tab-customers');
    openMore();
    fireEvent.click(screen.getByTestId('hub-new-segment'));
    expect(await screen.findByTestId('hub-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-tab-customers'));
    await waitFor(() => expect(screen.queryByTestId('hub-panel')).toBeNull());
    expect(screen.getByTestId('hub-tab-customers')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('hub-new-template'));
    expect(await screen.findByTestId('hub-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-tab-lucy'));
    await waitFor(() => expect(screen.queryByTestId('hub-panel')).toBeNull());
    expect(screen.getByTestId('hub-tab-lucy')).toHaveAttribute('aria-selected', 'true');
  });

  it('a member of the organization sees the sections, but not the create actions', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockEngage(() => json({ organizationId: 'o', userId: 'u', role: 'employee', product: 'all' }));
    renderLucy();
    await screen.findByTestId('hub-tab-customers');
    openMore();
    expect(screen.queryByTestId('hub-new-journey')).toBeNull();
    expect(screen.getByText(/Only a tenant admin can create or change/)).toBeInTheDocument();
  });
});
