import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LucyMarketingPage } from '@/pages/marketing/LucyMarketingPage';
import { ROUTES } from '@/lib/routes';

vi.mock('@/pages/marketing/components/DoraRail', () => ({
  DoraRail: () => <div data-testid="dora-rail" />,
}));

vi.mock('@/pages/marketing/components/MarketingMetricChips', () => ({
  MarketingMetricChips: () => <div data-testid="metric-chips" />,
}));

const metrics = {
  mqls: 12,
  cpl: 40,
  roi: 2.5,
  emailOpenRate: 22.5,
  monthlyTrend: [
    { leads: 1, spend: 10 },
    { leads: 2, spend: 12 },
  ],
};

function renderLucy(props: Partial<ComponentProps<typeof LucyMarketingPage>> = {}) {
  return render(
    <MemoryRouter initialEntries={[ROUTES.MARKETING]}>
      <Routes>
        <Route
          path="/marketing"
          element={(
            <LucyMarketingPage
              metrics={null}
              metricsLoading={false}
              onOpenCampaign={vi.fn()}
              onOpenContent={vi.fn()}
              onOpenInstagramContent={vi.fn()}
              {...props}
            />
          )}
        />
        <Route path="/marketing/pipeline" element={<div data-testid="pipeline-page">Pipeline</div>} />
        <Route path="/marketing/builder" element={<div data-testid="builder-page">Builder</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LucyMarketingPage', () => {
  it('renders Lucy rail and bento regions', () => {
    renderLucy({ metrics, approvalQueueCount: 42 });
    expect(screen.getByTestId('dora-rail')).toBeInTheDocument();
    expect(screen.getByText('Live stats')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Go to')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /login/i })).toHaveAttribute('href', '/login');
  });

  it('navigates to pipeline from Pipeline button', () => {
    renderLucy();
    fireEvent.click(screen.getByRole('button', { name: /pipeline/i }));
    expect(screen.getByTestId('pipeline-page')).toBeInTheDocument();
  });

  it('navigates to builder from Open builder', () => {
    renderLucy();
    fireEvent.click(screen.getByRole('button', { name: /open builder/i }));
    expect(screen.getByTestId('builder-page')).toBeInTheDocument();
  });
});
