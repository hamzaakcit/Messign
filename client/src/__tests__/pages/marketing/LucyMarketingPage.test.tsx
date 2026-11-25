import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketingLayout } from '@/pages/marketing/MarketingLayout';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (s: { user: { authUserId: string; id: string; role: string }; accessToken: string }) => unknown) => {
    const state = {
      user: { authUserId: 'u1', id: 'u1', role: 'member' },
      accessToken: 'tok',
    };
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
  const minimalCc: import('@/lib/marketingApi').CommandCenterPayload = {
    generatedAt: new Date().toISOString(),
    days: 7,
    funnel7d: { new: 0, contacted: 0, nurturing: 0, qualified: 0, converted: 0, disqualified: 0 },
    funnelSeries7d: [],
    cacRoi: { cac: 0, cpl: 0, roi: 0, ltvDisplay: null, signupVelocity: 0, landingConversionProxy: null },
    activeCampaigns: 0,
    experiments: [],
    socialPulse: { connected: false, lastSyncIso: null, errorCode: null, vibeScore: 0, accounts: [] },
    plays: [],
  };
  return {
    ...actual,
    marketingAPI: {
      ...actual.marketingAPI,
      getDashboardBootstrap: vi.fn().mockResolvedValue({
        metrics: { mqls: 12, cpl: 40, roi: 2.5, emailOpenRate: 22.5, monthlyTrend: [] },
        campaigns: { data: [] },
        content: { data: [] },
        emailCampaigns: { data: [] },
        hotLeads: [],
      }),
      getLeadFunnel: vi.fn().mockResolvedValue({ stages: [] }),
      listBrandProfiles: vi.fn().mockResolvedValue({ profiles: [], total: 0 }),
      listContent: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'offer-dora',
            content_type: 'offer',
            title: 'Dora is in Istanbul',
            status: 'draft',
            channel: 'internal',
            user_brief: 'product: Dora',
            created_at: '2026-11-14T00:00:00.000Z',
            body: null,
          },
          {
            id: 'ig-dora',
            content_type: 'social',
            channel: 'instagram',
            parent_content_id: 'offer-dora',
            body: 'Dora in the city',
            image_url: 'https://cdn.example/dora.jpg',
            status: 'draft',
            created_at: '2026-11-14T00:00:00.000Z',
          },
          {
            id: 'offer-book',
            content_type: 'offer',
            title: 'Window drop',
            status: 'draft',
            channel: 'internal',
            user_brief: 'product: Kürk Mantolu Madonna\nprice: ₺189',
            created_at: '2026-11-14T01:00:00.000Z',
            body: null,
          },
        ],
        total: 3,
        page: 1,
        pageSize: 50,
      }),
      getContent: vi.fn().mockResolvedValue({
        id: 'offer-dora',
        content_type: 'offer',
        title: 'Dora',
        body: null,
        type: 'social',
        channel: 'internal',
        status: 'draft',
        user_brief: 'product: Dora',
        organization_id: null,
        campaign_id: null,
        created_by: null,
        created_at: '2026-11-14T00:00:00.000Z',
        updated_at: '2026-11-14T00:00:00.000Z',
        published_at: null,
        scheduled_for: null,
      }),
    },
  };
});

function wrap(ui: ReactElement): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function renderLucy(path = '/marketing') {
  return render(
    wrap(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/*" element={<MarketingLayout />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

describe('shop counter', () => {
  it('lists this shop’s offers and keeps Lucy closed', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    expect(await screen.findByRole('button', { name: /Dora/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kürk Mantolu Madonna/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dora-rail')).not.toBeInTheDocument();
    expect(screen.queryByText('Live stats')).not.toBeInTheDocument();
  });

  it('opens Lucy only when asked', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    await screen.findByRole('button', { name: /Dora/ });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lucy' }));
    expect(await screen.findByTestId('dora-rail')).toBeInTheDocument();
  });

  it('lands the old Pipeline URL on the offer list, which More no longer links to', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy('/marketing/pipeline');
    expect(await screen.findByRole('button', { name: /^Dora/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Pipeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('filters the offers by status, the view Pipeline used to give', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    await screen.findByRole('button', { name: /^Dora/ });
    fireEvent.click(screen.getByRole('button', { name: 'In review' }));
    expect(screen.getByRole('button', { name: 'In review' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('No offers in this view.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dora/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'In progress' }));
    expect(screen.getByRole('button', { name: /^Dora/ })).toBeInTheDocument();
  });

  it('names the shop when it has no offers and retries after an error', async () => {
    const { marketingAPI } = await import('@/lib/marketingApi');
    sessionStorage.setItem('messign.contentTenant', 'bookstore');
    for (let i = 0; i < 3; i += 1) {
      vi.mocked(marketingAPI.listContent).mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 50 });
    }
    renderLucy();
    expect(await screen.findByText('No offers for Kitapyurdu.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dora/ })).not.toBeInTheDocument();

    for (let i = 0; i < 3; i += 1) {
      vi.mocked(marketingAPI.listContent).mockRejectedValueOnce(new Error('Could not load offers'));
    }
    fireEvent.change(screen.getByLabelText(/Content tenant/), { target: { value: 'messign' } });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('closes Dora when the shop changes to Kitapyurdu', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    fireEvent.click(await screen.findByRole('button', { name: /^Dora/ }));
    expect(await screen.findByRole('heading', { name: 'Dora' }, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Content tenant/), { target: { value: 'bookstore' } });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Content Detail' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Dora/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kürk Mantolu Madonna/ })).toBeInTheDocument();
  });

  it('opens Shop settings from More, with no floating Brands button', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    await screen.findByRole('button', { name: /^Dora/ });
    expect(screen.queryByRole('button', { name: 'Brands' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shop settings' }));
    expect(await screen.findByRole('heading', { name: 'Shop settings' })).toBeInTheDocument();
    expect(screen.getByText('Content setup')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Brand profiles' })).toBeInTheDocument();
  });

  it('sends the old brand-social URL to Shop settings', async () => {
    renderLucy('/marketing/brand-social');
    expect(await screen.findByRole('heading', { name: 'Shop settings' })).toBeInTheDocument();
  });

  it('gives the tab bar one create button, New offer, and no create menu', async () => {
    renderLucy('/marketing/shop');
    await screen.findByRole('heading', { name: 'Shop settings' });
    const bar = screen.getByRole('navigation', { name: 'Marketing workspace' }).parentElement as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'New offer' })).toBeInTheDocument();
    expect(screen.queryByTitle('Create new')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Campaign/ })).not.toBeInTheDocument();
  });

  it('reloads the list when the offer panel closes, so a change made inside shows on the card', async () => {
    const { marketingAPI } = await import('@/lib/marketingApi');
    const original = vi.mocked(marketingAPI.listContent).getMockImplementation();
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    fireEvent.click(await screen.findByRole('button', { name: /^Dora/ }));
    expect(await screen.findByRole('heading', { name: 'Dora' }, { timeout: 5000 })).toBeInTheDocument();
    // While the panel is open the post goes to review.
    vi.mocked(marketingAPI.listContent).mockImplementation(async (_user, filters) => {
      const rows = [
        { id: 'offer-dora', content_type: 'offer', title: 'Dora is in Istanbul', status: 'draft', channel: 'internal', user_brief: 'product: Dora', created_at: '2026-11-14T00:00:00.000Z', body: null },
        { id: 'ig-dora', content_type: 'social', channel: 'instagram', parent_content_id: 'offer-dora', body: 'Dora in the city', image_url: 'https://cdn.example/dora.jpg', status: 'in_review', created_at: '2026-11-14T00:00:00.000Z' },
      ];
      const data = filters?.channel ? rows.filter((r) => r.channel === filters.channel) : filters?.contentType ? rows.filter((r) => r.content_type === filters.contentType) : rows;
      return { data, total: data.length, page: 1, pageSize: 50 } as never;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    try {
      expect(await screen.findByRole('button', { name: /^Dora.*In review/ })).toBeInTheDocument();
    } finally {
      if (original) vi.mocked(marketingAPI.listContent).mockImplementation(original);
    }
  });

  it('names the campaign on the card and filters the list by it', async () => {
    const { marketingAPI } = await import('@/lib/marketingApi');
    const original = vi.mocked(marketingAPI.listContent).getMockImplementation();
    sessionStorage.setItem('messign.contentTenant', 'messign');
    const row = (id: string, product: string, campaign: { id: string; name: string } | null) => ({
      id, content_type: 'offer', title: product, status: 'draft', channel: 'internal', user_brief: `product: ${product}`,
      created_at: '2026-11-14T00:00:00.000Z', body: null,
      campaign_id: campaign?.id ?? null, campaign_name: campaign?.name ?? null,
    });
    vi.mocked(marketingAPI.listContent).mockImplementation(async (_user, filters) => {
      const offers = [row('o1', 'Dora', { id: 'c1', name: 'Launch week' }), row('o2', 'Knowledge Hub', null)];
      const data = filters?.contentType === 'offer' ? offers : [];
      return { data, total: data.length, page: 1, pageSize: 50 } as never;
    });
    renderLucy();
    try {
      // A card with no still starts with "No still yet", so match inside the name.
      expect(await screen.findByRole('button', { name: /Dora.*Launch week/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Knowledge Hub/ })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'c1' } });
      expect(screen.queryByRole('button', { name: /Knowledge Hub/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dora/ })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: '' } });
      expect(await screen.findByRole('button', { name: /Knowledge Hub/ })).toBeInTheDocument();
    } finally {
      if (original) vi.mocked(marketingAPI.listContent).mockImplementation(original);
    }
  });

  it('shows no campaign filter when no offer is in a campaign', async () => {
    sessionStorage.setItem('messign.contentTenant', 'messign');
    renderLucy();
    await screen.findByRole('button', { name: /^Dora/ });
    expect(screen.queryByLabelText('Campaign')).not.toBeInTheDocument();
  });
});
