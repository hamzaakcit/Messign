import { describe, expect, it, vi } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('../../../middleware/tenantContext.js', () => ({
  withTenantQuery: async (_tenantId: string, fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [{ id: 'camp-1', name: 'Teachers Day', channel: 'other', status: 'draft', tags: [] }], rowCount: 1 };
      },
    }),
}));
vi.mock('../../../events/index.js', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('../../../services/analytics/materializedViews.js', () => ({
  ANALYTICS_VIEWS: {},
  refreshMaterializedViews: vi.fn(),
}));

import { createCampaign } from '../../../dal/marketing/campaigns.js';

describe('createCampaign', () => {
  it('writes the tenant id, which the table requires and its row policy checks', async () => {
    queries.length = 0;
    await createCampaign(
      { organizationId: '00000000-0000-0000-0000-000000000001', userId: 'u1' } as never,
      { name: 'Teachers Day', channel: 'other' },
    );
    const insert = queries.find((q) => /INSERT INTO marketing_campaigns/.test(q.sql));
    expect(insert).toBeDefined();
    expect(insert?.sql).toMatch(/tags,\s*tenant_id/);
    // organization_id and tenant_id are both the caller's organization ($1).
    expect(insert?.sql).toMatch(/\$15,\$1\)/);
    expect(insert?.params[0]).toBe('00000000-0000-0000-0000-000000000001');
  });
});
