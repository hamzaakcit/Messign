import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarketingWorkspace } from '@/pages/marketing/hooks/useMarketingWorkspace';

vi.mock('@/lib/marketingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketingApi')>();
  const minimalCc: import('@/lib/marketingApi').CommandCenterPayload = {
    generatedAt: new Date().toISOString(),
    days: 7,
    funnel7d: {
      new: 1,
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
          mqls: 3,
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

function wrapper(client: QueryClient) {
  return function W({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useMarketingWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads bootstrap and command center when userId and accessToken are set', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useMarketingWorkspace({
          userId: 'u1',
          accessToken: 'tok',
          ccDays: 7,
          brandFilter: null,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.metrics?.mqls).toBe(3);
    });
    await waitFor(() => {
      expect(result.current.ccData?.funnel7d.new).toBe(1);
    });
    expect(result.current.bootstrapError).toBeNull();
    expect(result.current.ccError).toBeNull();
    expect(typeof result.current.refetchFunnel).toBe('function');
    expect(typeof result.current.refetchBrands).toBe('function');
  });

  it('does not fetch when accessToken is missing', () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () =>
        useMarketingWorkspace({
          userId: 'u1',
          accessToken: null,
          ccDays: 7,
          brandFilter: null,
        }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.metrics).toBeNull();
    expect(result.current.ccData).toBeNull();
  });
});
