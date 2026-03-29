import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketingCommandCenter } from '@/pages/marketing/MarketingCommandCenter';
import type { CommandCenterPayload } from '@/lib/marketingApi';

const samplePayload: CommandCenterPayload = {
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
  funnelSeries7d: [{ date: '2026-03-20', value: 1 }],
  cacRoi: {
    cac: 0,
    cpl: 0,
    roi: 0,
    ltvDisplay: null,
    signupVelocity: 0.5,
    landingConversionProxy: null,
  },
  activeCampaigns: 2,
  experiments: [],
  socialPulse: {
    connected: false,
    lastSyncIso: null,
    errorCode: null,
    vibeScore: 50,
    accounts: [
      {
        platform: 'linkedin',
        label: 'Linkedin',
        contentPieces: 0,
        series7d: [{ date: '2026-03-20', value: 0 }],
      },
      {
        platform: 'twitter',
        label: 'X / Twitter',
        contentPieces: 0,
        series7d: [{ date: '2026-03-20', value: 0 }],
      },
      {
        platform: 'instagram',
        label: 'Instagram',
        contentPieces: 0,
        series7d: [{ date: '2026-03-20', value: 0 }],
      },
    ],
  },
  plays: [
    {
      id: 'p1',
      title: 'Test play',
      snippet: 'Do something',
      priority: 'high',
      contextJson: {},
    },
  ],
};

describe('MarketingCommandCenter', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList);
  });

  it('renders four column headers and toolbar actions', () => {
    render(
      <MarketingCommandCenter
        data={samplePayload}
        loading={false}
        error={null}
        days={7}
        onDaysChange={vi.fn()}
        brandList={[]}
        brandFilter={null}
        onBrandFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onExecuteWithDora={vi.fn()}
        onOpenCampaign={vi.fn()}
        onOpenEmail={vi.fn()}
        onOpenPipeline={vi.fn()}
        onOpenBuilder={vi.fn()}
        onOpenIntelligence={vi.fn()}
      />,
    );

    expect(screen.getByText('Brand & Social')).toBeTruthy();
    expect(screen.getByText('The Funnel')).toBeTruthy();
    expect(screen.getByText('Campaigns & Lab')).toBeTruthy();
    expect(screen.getByText('Lucy Sandbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pipeline$/i })).toBeTruthy();
  });

  it('compact variant shows grid toggle and bounded intelligence region', () => {
    render(
      <MarketingCommandCenter
        variant="compact"
        data={samplePayload}
        loading={false}
        error={null}
        days={7}
        onDaysChange={vi.fn()}
        brandList={[]}
        brandFilter={null}
        onBrandFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onExecuteWithDora={vi.fn()}
        onOpenCampaign={vi.fn()}
        onOpenEmail={vi.fn()}
        onOpenPipeline={vi.fn()}
        onOpenBuilder={vi.fn()}
        onOpenIntelligence={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^Grid$/i })).toBeTruthy();
    expect(screen.getByText('Brand & Social')).toBeTruthy();
  });
});
