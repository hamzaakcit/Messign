/** The partition job asks for the partitions of the next two days, inside the two-day window the function accepts. */
import { describe, expect, it, vi } from 'vitest';

const queries: string[] = [];
vi.mock('../../engage/db.js', () => ({
  withEngageScheduler: async (fn: (c: { query: (q: string) => Promise<unknown> }) => Promise<unknown>) =>
    fn({ query: async (q: string) => { queries.push(q); return { rows: [] }; } }),
}));

describe('event partition job (WP-19 follow-up)', () => {
  it('ensures tomorrow and the day after, without a tenant', async () => {
    const { ensureUpcomingEventPartitions } = await import('../../engage/partitions.js');
    await ensureUpcomingEventPartitions();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/ensure_event_partition\(now\(\) \+ interval '1 day'\)/);
    expect(queries[0]).toMatch(/ensure_event_partition\(now\(\) \+ interval '2 days' - interval '1 minute'\)/);
  });
});
