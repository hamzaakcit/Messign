import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { marketingAPI } from '@/lib/marketingApi';
import { useMarketingWorkspace } from '@/pages/marketing/hooks/useMarketingWorkspace';

vi.mock('@/lib/marketingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketingApi')>();
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
      getLeadFunnel: vi.fn(),
      listBrandProfiles: vi.fn().mockResolvedValue({ profiles: [], total: 0 }),
      getCommandCenter: vi.fn(),
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

  it('loads bootstrap and brands when userId and accessToken are set', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useMarketingWorkspace({ userId: 'u1', accessToken: 'tok' }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.metrics?.mqls).toBe(3);
    });
    expect(result.current.bootstrapError).toBeNull();
    expect(typeof result.current.refetchBrands).toBe('function');
  });

  it('does not load command-center or funnel data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useMarketingWorkspace({ userId: 'u1', accessToken: 'tok' }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.metrics?.mqls).toBe(3);
    });
    expect(marketingAPI.getCommandCenter).not.toHaveBeenCalled();
    expect(marketingAPI.getLeadFunnel).not.toHaveBeenCalled();
  });

  it('does not fetch when accessToken is missing', () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () => useMarketingWorkspace({ userId: 'u1', accessToken: null }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.metrics).toBeNull();
    expect(marketingAPI.getDashboardBootstrap).not.toHaveBeenCalled();
  });
});
