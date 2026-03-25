import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { WorkspaceOverviewGrid } from '@/components/command-center/WorkspaceOverviewGrid';
import type { WorkspaceModuleSnapshots } from '@/types/command-center';

function mockWorkspace(): WorkspaceModuleSnapshots {
  const ok = <T,>(data: T): { ok: true; data: T } => ({ ok: true, data });
  return {
    crm: ok({ dealsWon: 2, dealsLost: 1, winRate: 66.7, avgCycleTimeDays: 12 }),
    hr: ok({
      openPositions: 3,
      activeApplicants: 10,
      offerAcceptanceRate: 0.5,
      avgTimeToHireDays: 20,
      funnel: { applied: 1, screening: 1, interviewing: 1, offer: 1, hired: 1 },
      upcomingInterviewCount: 2,
    }),
    support: ok({
      openTickets: 4,
      avgResolutionHours: 8,
      csatScore: 4.2,
      slaCompliancePercent: 90,
      ticketTrend: [{ date: '2026-03-20', openCount: 2, resolvedCount: 1 }],
    }),
    marketing: ok({
      activeCampaigns: 1,
      totalLeads: 5,
      contentPublished: 2,
      emailOpenRate: 0.25,
      monthlyLeadsTrend: [{ month: '2026-01', leads: 3 }],
    }),
    assets: ok({ totalAssets: 10, assigned: 6, available: 4, warrantyExpiring: 1 }),
    contracts: ok({ totalActive: 4, expiringThisMonth: 1, renewalsNeeded: 0, complianceDue: 0 }),
    okr: ok({ totalGoals: 5, onTrack: 3, atRisk: 1, behind: 0, completed: 1, avgProgress: 42 }),
    chat: ok({
      channelsJoined: 2,
      messagesLast7Days: 30,
      messagesByDay: [{ date: '2026-03-24', count: 5 }],
    }),
  };
}

describe('WorkspaceOverviewGrid', () => {
  it('renders workspace performance region', () => {
    const { getByRole } = render(
      <MemoryRouter>
        <WorkspaceOverviewGrid workspace={mockWorkspace()} />
      </MemoryRouter>,
    );
    expect(getByRole('region', { name: /workspace performance overview/i })).toBeTruthy();
  });
});
