/**
 * Acceptance for WP-09: the synthetic generator's CSVs round-trip through the importer at 100,000 profiles, and the
 * importer ends up with exactly what the generator says a correct importer must have.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('synthetic tenant round trip at 100k (real Postgres)', () => {
  let f: TenancyFixture;
  let run: typeof import('../../engage/import/run.js');
  let gen: typeof import('../../engage/import/synthetic.js');
  let org: string;

  beforeAll(async () => {
    f = await setupTenancyFixture();
    run = await import('../../engage/import/run.js');
    gen = await import('../../engage/import/synthetic.js');
    org = (await f.provisionTenant(`Synthetic ${f.suffix}`)).organization.id;
  }, 90_000);
  afterAll(async () => { await f?.teardown(); });

  const count = async (table: string) => (await f.engage.withEngageTenant(org, (c) => c.query(`SELECT count(*)::int AS n FROM engage.${table}`))).rows[0].n as number;

  it('imports 100,000 synthetic profiles and their orders, with exactly the expected result, and a re-run changes nothing', async () => {
    const t = gen.generateSyntheticTenant({ kind: 'bookstore', profiles: 100_000, seed: 20261108 });
    expect(t.expected.distinctProfiles).toBeGreaterThan(99_000);

    const started = Date.now();
    const r = await run.runImport(org, 'profiles', t.profilesCsv);
    const seconds = (Date.now() - started) / 1000;
    expect(r.rowsTotal).toBe(t.expected.profileRows);
    expect(r.counts.created).toBe(t.expected.distinctProfiles);
    expect(await count('profiles')).toBe(t.expected.distinctProfiles);
    expect(r.counts.consents_recorded).toBeGreaterThan(30_000);
    expect(r.counts.identifiers_skipped, 'shared emails are reported, not imported').toBeGreaterThan(0);
    expect(r.errors.length).toBeLessThanOrEqual(200);
    expect(r.errorsTotal).toBeGreaterThan(r.errors.length);
    // The database holds at most one active owner per value no matter what the file said.
    const dup = await f.engage.withEngageTenant(org, (c) => c.query(
      `SELECT count(*)::int AS n FROM (SELECT type, value_normalized FROM engage.identifiers WHERE is_active GROUP BY 1, 2 HAVING count(*) > 1) d`));
    expect(dup.rows[0].n).toBe(0);

    const o = await run.runImport(org, 'orders', t.ordersCsv);
    expect(o.counts.events_created).toBe(t.expected.distinctValidOrders);
    expect(await count('events')).toBe(t.expected.distinctValidOrders);
    expect(await count('trigger_outbox'), 'imported history starts no journeys').toBe(0);

    const ledger = await count('consents');
    const again = await run.runImport(org, 'profiles', t.profilesCsv);
    expect(again.counts).toMatchObject({ created: 0, consents_recorded: 0 });
    expect(await count('consents')).toBe(ledger);
    expect(await count('profiles')).toBe(t.expected.distinctProfiles);
    console.info(`[100k] first profile import took ${seconds.toFixed(1)}s`);
  }, 420_000);
});
