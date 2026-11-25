import { describe, expect, it, vi } from 'vitest';

// A server east of UTC, where the date bugs showed: pg builds a DATE as local midnight, and local midnight is the day
// before in UTC.
vi.hoisted(() => {
  process.env.TZ = 'Europe/Istanbul';
});

const queries: Array<{ sql: string; params: unknown[] }> = [];
let rows: Array<Record<string, unknown>> = [];

vi.mock('../../../middleware/tenantContext.js', () => ({
  withTenantQuery: async (_tenantId: string, fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: String(rows.length) }], rowCount: 1 };
        return { rows, rowCount: rows.length };
      },
    }),
}));
vi.mock('../../../events/index.js', () => ({ eventBus: { emit: vi.fn() } }));

import { getCalendarView, getContentById, toDateOnly } from '../../../dal/marketing/content.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const ctx = { organizationId: ORG, userId: 'u1' } as never;

function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'c1', organization_id: ORG, title: 'Daisy', content_type: 'social', channel: 'instagram',
    status: 'scheduled', tags: [], scheduled_date: null, scheduled_time: null, ...over,
  };
}

describe('toDateOnly', () => {
  it('reads a pg DATE (a Date at local midnight) as the date that was stored', () => {
    expect(toDateOnly(new Date(2026, 10, 27))).toBe('2026-11-27');
    expect(toDateOnly(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toDateOnly(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('keeps the date part of a string, and passes through nothing and nonsense', () => {
    expect(toDateOnly('2026-11-27')).toBe('2026-11-27');
    expect(toDateOnly('2026-11-27T00:00:00.000Z')).toBe('2026-11-27');
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly('')).toBeNull();
    expect(toDateOnly(new Date('nope'))).toBeNull();
  });
});

describe('a scheduled post as the calendar reads it', () => {
  it('has a YYYY-MM-DD date, not a long locale string', async () => {
    rows = [row({ scheduled_date: new Date(2026, 10, 27) })];
    const content = await getContentById(ctx, 'c1');
    expect(content?.scheduled_date).toBe('2026-11-27');
  });

  it('is grouped under that day, which is the key the calendar grid looks up', async () => {
    queries.length = 0;
    rows = [row({ id: 'a', scheduled_date: new Date(2026, 10, 27) }), row({ id: 'b', scheduled_date: new Date(2026, 10, 27) }), row({ id: 'c', scheduled_date: new Date(2026, 10, 30) })];
    const days = await getCalendarView(ctx, 11, 2026);
    expect(days.map((d) => d.date)).toEqual(['2026-11-27', '2026-11-30']);
    expect(days[0]?.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('asks for the whole month, including its last day', async () => {
    queries.length = 0;
    rows = [];
    await getCalendarView(ctx, 11, 2026);
    const list = queries.find((q) => /SELECT\s+mc\.\*/.test(q.sql));
    expect(list?.params).toEqual(expect.arrayContaining(['2026-11-01', '2026-11-30']));
    expect(list?.params).not.toContain('2026-11-29');
    queries.length = 0;
    await getCalendarView(ctx, 2, 2028); // a leap year
    expect(queries.find((q) => /SELECT\s+mc\.\*/.test(q.sql))?.params).toEqual(expect.arrayContaining(['2028-02-01', '2028-02-29']));
  });
});
