import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

interface MemoryRow {
  [key: string]: unknown;
}

const store: MemoryRow[] = [];

vi.mock('../../../middleware/tenantContext.js', () => ({
  withTenantQuery: async (_tenantId: string, fn: (client: PoolClient) => Promise<unknown>) =>
    fn({ query: memoryQuery } as unknown as PoolClient),
}));

const { createContent, getContentById, listContent } = await import('../../../dal/marketing/content.js');

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('offer org isolation', () => {
  beforeEach(() => {
    store.length = 0;
  });

  it('returns an offer id, an empty child list, and hides that offer from another org', async () => {
    const offer = await createContent(caller(ORG_A), {
      title: 'Window drop',
      content_type: 'offer',
      channel: 'internal',
      status: 'draft',
      user_brief: 'Window drop',
    });

    expect(offer.id).toMatch(/[0-9a-f-]{36}/i);
    expect(offer.organization_id).toBe(ORG_A);
    expect(store[0]?.tenant_id).toBe(ORG_A);

    const children = await listContent(caller(ORG_A), { parentContentId: offer.id });
    expect(children.data).toEqual([]);

    expect(await getContentById(caller(ORG_B), offer.id)).toBeNull();
    const foreignOffers = await listContent(caller(ORG_B), { contentType: 'offer' });
    expect(foreignOffers.data).toEqual([]);

    const ownOffers = await listContent(caller(ORG_A), { contentType: 'offer' });
    expect(ownOffers.data.map((row) => row.id)).toEqual([offer.id]);
  });
});

function caller(organizationId: string) {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    userUuid: '11111111-1111-4111-8111-111111111111',
    role: 'employee' as const,
    organizationId,
  };
}

async function memoryQuery(sql: string, params: unknown[] = []): Promise<{ rows: MemoryRow[] }> {
  const text = sql.replace(/\s+/g, ' ');
  if (text.includes('INSERT INTO marketing_content')) {
    const row: MemoryRow = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organization_id: params[0],
      campaign_id: params[1],
      title: params[2],
      content_type: params[3],
      channel: params[4],
      status: params[5],
      body: params[6],
      user_brief: params[18],
      parent_content_id: params[26],
      tenant_id: params[0],
      tags: [],
      created_at: '2026-11-12T00:00:00.000Z',
      updated_at: '2026-11-12T00:00:00.000Z',
    };
    store.push(row);
    return { rows: [row] };
  }

  const matched = store.filter((row) => matchesTenantQuery(text, params, row));
  if (text.includes('COUNT(*)')) {
    return { rows: [{ count: matched.length }] };
  }
  return { rows: matched };
}

function matchesTenantQuery(sql: string, params: unknown[], row: MemoryRow): boolean {
  for (const match of sql.matchAll(/mc\.([a-z_]+)\s*=\s*\$(\d+)/gi)) {
    const column = match[1];
    const value = params[Number(match[2]) - 1];
    if (row[column] !== value) return false;
  }
  return true;
}
