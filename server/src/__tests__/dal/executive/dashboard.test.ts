import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../middleware/tenantContext.js', () => ({
  withTenantQuery: vi.fn(async (_tenantId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) => {
    return fn({ query: mockQuery });
  }),
}));

import {
  getCultureMetrics,
  getPendingItems,
  getChartData,
  type PendingItems,
  type ExecutiveChartData,
} from '../../../dal/executive/dashboard.js';
import type { CallerContext } from '../../../dal/types.js';

function qr<T extends Record<string, unknown>>(rows: T[]) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

const CTX: CallerContext = {
  userId: '00000000-0000-0000-0000-000000000001',
  role: 'admin',
  organizationId: '00000000-0000-0000-0000-000000000099',
};

describe('getCultureMetrics', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns healthScore, engagementTrend, and sentimentAvg from Heart tables', async () => {
    mockQuery
      .mockResolvedValueOnce(qr([{ avg_health: 78 }]))
      .mockResolvedValueOnce(qr([{ sentiment_avg: 4.2, recent: 4.5, previous: 4.0 }]));

    const result = await getCultureMetrics(CTX);
    expect(result).not.toBeNull();
    expect(result!.healthScore).toBe(78);
    expect(result!.sentimentAvg).toBe(4.2);
    expect(result!.engagementTrend).toBe('improving');
  });

  it('returns stable when no previous data', async () => {
    mockQuery
      .mockResolvedValueOnce(qr([{ avg_health: 0 }]))
      .mockResolvedValueOnce(qr([{ sentiment_avg: 0, recent: 0, previous: 0 }]));

    const result = await getCultureMetrics(CTX);
    expect(result!.engagementTrend).toBe('stable');
  });

  it('returns declining when sentiment drops', async () => {
    mockQuery
      .mockResolvedValueOnce(qr([{ avg_health: 60 }]))
      .mockResolvedValueOnce(qr([{ sentiment_avg: 3.0, recent: 3.0, previous: 4.0 }]));

    const result = await getCultureMetrics(CTX);
    expect(result!.engagementTrend).toBe('declining');
  });
});

describe('getPendingItems', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns correct shape with all categories', async () => {
    mockQuery
      .mockResolvedValueOnce(qr([{ id: 'e1', title: 'Lunch', amount: 25, currency: 'EUR', submitter: 'Alice', submitted_at: '2026-01-01T00:00:00Z' }]))
      .mockResolvedValueOnce(qr([{ id: 't1', user_name: 'Bob', period: '2026-01-06', total_hours: 40, submitted_at: '2026-01-07T00:00:00Z' }]))
      .mockResolvedValueOnce(qr([{ id: 'tk1', subject: 'Login broken', priority: 'critical', status: 'open', assignee: null, created_at: '2026-01-01T00:00:00Z' }]))
      .mockResolvedValueOnce(qr([{ id: 'a1', candidate_name: 'Charlie', job_title: 'Engineer', stage: 'screening', applied_at: '2026-01-01T00:00:00Z' }]))
      .mockResolvedValueOnce(qr([{ id: 'm1', content_title: 'Blog Post', type: 'blog', requested_by: 'Diana', requested_at: '2026-01-01T00:00:00Z' }]))
      .mockResolvedValueOnce(qr([{ id: 'i1', client_name: 'Acme', amount: 1000, due_date: '2025-12-01', days_past_due: 30 }]));

    const result: PendingItems = await getPendingItems(CTX);

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].title).toBe('Lunch');
    expect(result.expenses[0].amount).toBe(25);

    expect(result.timesheets).toHaveLength(1);
    expect(result.timesheets[0].userName).toBe('Bob');

    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0].priority).toBe('critical');

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0].candidateName).toBe('Charlie');

    expect(result.marketingApprovals).toHaveLength(1);
    expect(result.marketingApprovals[0].contentTitle).toBe('Blog Post');

    expect(result.overdueInvoices).toHaveLength(1);
    expect(result.overdueInvoices[0].daysPastDue).toBe(30);
  });

  it('returns empty arrays when no pending items', async () => {
    for (let i = 0; i < 6; i++) {
      mockQuery.mockResolvedValueOnce(qr([]));
    }

    const result: PendingItems = await getPendingItems(CTX);

    expect(result.expenses).toHaveLength(0);
    expect(result.timesheets).toHaveLength(0);
    expect(result.tickets).toHaveLength(0);
    expect(result.applications).toHaveLength(0);
    expect(result.marketingApprovals).toHaveLength(0);
    expect(result.overdueInvoices).toHaveLength(0);
  });
});

describe('getChartData', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns 30-day trends for all categories', async () => {
    const dayRows = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      value: i * 100,
    }));

    const ticketRows = dayRows.map((d) => ({ ...d, opened: 5, resolved: 3 }));

    mockQuery
      .mockResolvedValueOnce(qr(dayRows))
      .mockResolvedValueOnce(qr(dayRows))
      .mockResolvedValueOnce(qr(ticketRows))
      .mockResolvedValueOnce(qr(dayRows))
      .mockResolvedValueOnce(qr(dayRows));

    const result: ExecutiveChartData = await getChartData(CTX);

    expect(result.revenueTrend).toHaveLength(30);
    expect(result.expenseTrend).toHaveLength(30);
    expect(result.ticketTrend).toHaveLength(30);
    expect(result.ticketTrend[0]).toHaveProperty('opened');
    expect(result.ticketTrend[0]).toHaveProperty('resolved');
    expect(result.leadsTrend).toHaveLength(30);
    expect(result.utilizationTrend).toHaveLength(30);
  });

  it('returns empty arrays when no data', async () => {
    for (let i = 0; i < 5; i++) {
      mockQuery.mockResolvedValueOnce(qr([]));
    }

    const result: ExecutiveChartData = await getChartData(CTX);

    expect(result.revenueTrend).toHaveLength(0);
    expect(result.expenseTrend).toHaveLength(0);
    expect(result.ticketTrend).toHaveLength(0);
    expect(result.leadsTrend).toHaveLength(0);
    expect(result.utilizationTrend).toHaveLength(0);
  });
});
