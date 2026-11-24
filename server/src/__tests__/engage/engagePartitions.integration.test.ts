/** The partition job (WP-19 follow-up): the coming days' event partitions exist after it runs, through the engage role. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('event partition job (real Postgres, engage role)', () => {
  let f: TenancyFixture;
  beforeAll(async () => { f = await setupTenancyFixture(); }, 90_000);
  afterAll(async () => { await f?.teardown(); });

  it('creates the partitions of the next two days (a no-op when they exist), running as the non-bypass engage role', async () => {
    const { ensureUpcomingEventPartitions } = await import('../../engage/partitions.js');
    await ensureUpcomingEventPartitions();
    await ensureUpcomingEventPartitions();
    const r = await f.admin.query<{ day: string; part: string | null }>(
      `SELECT d::text AS day, to_regclass(format('engage.events_%s', to_char(d AT TIME ZONE 'UTC', 'YYYYMM')))::text AS part
         FROM (VALUES (now() + interval '1 day'), (now() + interval '2 days' - interval '1 minute')) AS v(d)`);
    for (const row of r.rows) expect(row.part, row.day).toMatch(/^engage\.events_\d{6}$/);
  });
});
