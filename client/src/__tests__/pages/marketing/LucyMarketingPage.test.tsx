import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/pages/marketing/components/MarketingMetricChips', () => ({
  MarketingMetricChips: () => <div data-testid="metric-chips" />,
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
      getCommandCenter: vi.fn().mockResolvedValue(minimalCc),
    },
  };
});

function wrap(ui: ReactElement): JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function renderLucy() {
  return render(
    wrap(
      <MemoryRouter initialEntries={['/marketing']}>
        <Routes>
          <Route path="/*" element={<MarketingLayout />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

describe('LucyMarketingPage', () => {
  it('renders Lucy rail and bento regions', async () => {
    renderLucy();
    await waitFor(() => {
      expect(screen.getByTestId('dora-rail')).toBeInTheDocument();
    });
    expect(screen.getByText('Live stats')).toBeInTheDocument();
    expect(screen.getByText('Go to')).toBeInTheDocument();
  });

  it('navigates to pipeline from Pipeline button', async () => {
    renderLucy();
    await waitFor(() => {
      expect(screen.getByTestId('dora-rail')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Pipeline$/i }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /content pipeline/i })).toBeInTheDocument();
    });
  });
});
