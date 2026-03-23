import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import * as tenantCtx from '../../../middleware/tenantContext.js';
import * as campaignDal from '../../../dal/marketing/campaigns.js';
import * as contentDal from '../../../dal/marketing/content.js';
import {
  scheduleContentOperation,
  campaignBudgetAllocateToolService,
  pauseCampaignToolService,
} from '../../../services/marketing/campaignManagerTools.js';

const WS = '22222222-2222-2222-2222-222222222222';
const USER = '11111111-1111-1111-1111-111111111111';
const CAMPAIGN = '33333333-3333-3333-3333-333333333333';
const CONTENT = '44444444-4444-4444-4444-444444444444';

const ctx = {
  userId: USER,
  role: 'manager' as const,
  organizationId: WS,
};

describe('Phase 4 — campaign operations matrix', () => {
  /** Re-created each test so `vi.restoreAllMocks()` in other hooks cannot detach a stale spy from `withTenantQuery`. */
  let wqSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    wqSpy = vi.spyOn(tenantCtx, 'withTenantQuery');
  });

  it('OP-01: scheduleContentOperation throws for draft content and does not open a transaction', async () => {
    vi.spyOn(contentDal, 'getContentById').mockResolvedValue({
      id: CONTENT,
      organization_id: WS,
      campaign_id: null,
      title: 'Draft post',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      body: 'x',
      body_html: null,
      body_design: null,
      scheduled_date: null,
      scheduled_time: null,
      published_at: null,
      author_id: null,
      reviewer_id: null,
      tags: [],
      views: 0,
      engagement: 0,
      click_throughs: 0,
      leads_attributed: 0,
      knowledge_doc_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(
      scheduleContentOperation(ctx, CONTENT, {
        scheduled_date: '2025-06-01',
        channel: 'linkedin',
      }),
    ).rejects.toThrow('Cannot schedule unapproved content.');

    expect(wqSpy).not.toHaveBeenCalled();
  });

  it('OP-02 & OP-03: campaign_budget_allocate writes allocation and finance journal in one transaction', async () => {
    vi.spyOn(campaignDal, 'getCampaignById').mockResolvedValue({
      id: CAMPAIGN,
      organization_id: WS,
      name: 'Q3',
      objective: null,
      description: null,
      channel: 'email',
      status: 'active',
      budget: 5000,
      actual_spend: 0,
      currency: 'EUR',
      budget_eur: 5000,
      actual_spend_eur: 0,
      start_date: null,
      end_date: null,
      target_audience: null,
      goals: null,
      owner_id: null,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      leads_generated: 0,
      cost_per_lead: null,
      roi: null,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const queries: string[] = [];
    const mockQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
      queries.push(sql);
      if (sql.includes('marketing_budget_allocations') && sql.includes('RETURNING')) {
        return {
          rows: [
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              workspace_id: WS,
              campaign_id: CAMPAIGN,
              channel: 'email',
              allocated_amount: '1000.00',
              spent_amount: '0.00',
              currency: 'EUR',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('finance_marketing_journal_stub')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const mockClient = {
      query: mockQuery,
    } as unknown as PoolClient;

    wqSpy.mockImplementation(async (_tenantId: string, fn: (c: PoolClient) => Promise<unknown>) => {
      return fn(mockClient);
    });

    const result = await campaignBudgetAllocateToolService(ctx, CAMPAIGN, {
      channel: 'email',
      amount: 1000,
      isPrepaid: true,
      currency: 'EUR',
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !('data' in result)) throw new Error('expected ok');
    expect(result.data.allocated_amount).toBe(1000);
    expect(queries.some((q) => q.includes('marketing_budget_allocations'))).toBe(true);
    expect(queries.some((q) => q.includes('finance_marketing_journal_stub'))).toBe(true);

    const financeCall = mockQuery.mock.calls.find((c: unknown[]) => String(c[0]).includes('finance_marketing_journal_stub'));
    expect(financeCall).toBeDefined();
    const params = financeCall?.[1] as unknown[];
    expect(params?.[2]).toBe(1000);
    expect(params?.[3]).toBe('EUR');
    expect(params?.[4]).toBe('Marketing Expense');
    expect(params?.[5]).toBe('Cash');
  });

  it('OP-02 rollback: finance journal failure rolls back (transaction throws)', async () => {
    vi.spyOn(campaignDal, 'getCampaignById').mockResolvedValue({
      id: CAMPAIGN,
      organization_id: WS,
      name: 'Q3',
      objective: null,
      description: null,
      channel: 'email',
      status: 'active',
      budget: 5000,
      actual_spend: 0,
      currency: 'EUR',
      budget_eur: 5000,
      actual_spend_eur: 0,
      start_date: null,
      end_date: null,
      target_audience: null,
      goals: null,
      owner_id: null,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      leads_generated: 0,
      cost_per_lead: null,
      roi: null,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    wqSpy.mockImplementation(async (_t: string, fn: (c: PoolClient) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('marketing_budget_allocations')) {
            return {
              rows: [
                {
                  id: 'b',
                  workspace_id: WS,
                  campaign_id: CAMPAIGN,
                  channel: 'email',
                  allocated_amount: '1000.00',
                  spent_amount: '0.00',
                  currency: 'EUR',
                  created_at: '',
                  updated_at: '',
                },
              ],
              rowCount: 1,
            };
          }
          if (sql.includes('finance_marketing_journal_stub')) {
            throw new Error('ledger down');
          }
          return { rows: [], rowCount: 0 };
        }),
      } as unknown as PoolClient;
      return fn(client);
    });

    const result = await campaignBudgetAllocateToolService(ctx, CAMPAIGN, {
      channel: 'email',
      amount: 1000,
      isPrepaid: true,
      confirmed: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toMatch(/ledger down/);
  });

  it('OP-04: pause_campaign sets campaign paused and cascades scheduled calendar rows', async () => {
    const campaignRow = {
      id: CAMPAIGN,
      organization_id: WS,
      name: 'X',
      objective: null,
      description: null,
      channel: 'email',
      status: 'paused',
      budget: 0,
      actual_spend: 0,
      currency: 'EUR',
      budget_eur: 0,
      actual_spend_eur: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      leads_generated: 0,
      cost_per_lead: null,
      roi: null,
      start_date: null,
      end_date: null,
      target_audience: null,
      goals: null,
      owner_id: null,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const calendarUpdates: string[] = [];
    wqSpy.mockImplementation(async (_t: string, fn: (c: PoolClient) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('UPDATE marketing_campaigns')) {
            return { rows: [campaignRow], rowCount: 1 };
          }
          if (sql.includes('marketing_content_calendar')) {
            calendarUpdates.push(sql);
            return { rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as unknown as PoolClient;
      return fn(client);
    });

    const out = await pauseCampaignToolService(ctx, CAMPAIGN, { confirmed: true, reason: 'freeze' });
    expect(out.ok).toBe(true);
    if (!out.ok || !('data' in out)) throw new Error('pause failed');
    expect(out.data.status).toBe('paused');
    expect(calendarUpdates.length).toBeGreaterThan(0);
    expect(calendarUpdates.some((s) => s.includes("status = 'paused'") && s.includes('scheduled'))).toBe(true);
  });
});
