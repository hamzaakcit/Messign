import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketingHub } from '@/pages/marketing/MarketingHub';

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

vi.mock('@/lib/marketingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketingApi')>();
  const minimalCc: import('@/lib/marketingApi').CommandCenterPayload = {
    generatedAt: new Date().toISOString(),
    days: 7,
    funnel7d: {
      new: 0,
      contacted: 0,
      nurturing: 0,
      qualified: 0,
      converted: 0,
      disqualified: 0,
    },
    funnelSeries7d: [],
    cacRoi: {
      cac: 0,
      cpl: 0,
      roi: 0,
      ltvDisplay: null,
      signupVelocity: 0,
      landingConversionProxy: null,
    },
    activeCampaigns: 0,
    experiments: [],
    socialPulse: {
      connected: false,
      lastSyncIso: null,
      errorCode: null,
      vibeScore: 0,
      accounts: [],
    },
    plays: [],
  };
  return {
    ...actual,
    marketingAPI: {
      ...actual.marketingAPI,
      getDashboardBootstrap: vi.fn().mockResolvedValue({
        metrics: {
          mqls: 0,
          cpl: 0,
          roi: 0,
          emailOpenRate: 0,
          monthlyTrend: [],
        },
        campaigns: { data: [] },
        content: { data: [] },
        emailCampaigns: { data: [] },
        hotLeads: [],
      }),
      getLeadFunnel: vi.fn().mockResolvedValue({ stages: [] }),
      listBrandProfiles: vi.fn().mockResolvedValue({ profiles: [], total: 0 }),
      getCommandCenter: vi.fn().mockResolvedValue(minimalCc),
    },
  };
});

vi.mock('@/pages/marketing/components/DoraRail', () => ({
  DoraRail: () => <div data-testid="dora-rail-mock" />,
  MARKETING_DORA_RAIL_OUTSET_RIGHT: 'right-6',
}));

function wrap(ui: ReactElement): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe('MarketingHub pipeline page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders content pipeline Kanban region', async () => {
    render(
      wrap(
        <MemoryRouter initialEntries={['/marketing/pipeline']}>
          <Routes>
            <Route path="/marketing/*" element={<MarketingHub />} />
          </Routes>
        </MemoryRouter>,
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /content pipeline/i })).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: /content pipeline/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pipeline$/i })).toBeTruthy();
  });
});
