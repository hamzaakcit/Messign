import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

vi.mock('@/pages/marketing/command-center/useMarketingCommandCenterData', () => ({
  useMarketingCommandCenterData: () => ({
    data: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/marketingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketingApi')>();
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
    },
  };
});

vi.mock('@/pages/marketing/components/DoraRail', () => ({
  DoraRail: () => <div data-testid="dora-rail-mock" />,
  MARKETING_DORA_RAIL_OUTSET_RIGHT: 'right-6',
}));

describe('MarketingHub board mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders command center compact strip and main content pipeline Kanban region', async () => {
    render(
      <MemoryRouter initialEntries={['/marketing']}>
        <Routes>
          <Route path="/marketing/*" element={<MarketingHub />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /content pipeline/i })).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: /content pipeline/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pipeline$/i })).toBeTruthy();
  });
});
