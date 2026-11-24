/**
 * Foreign keys that point at the big parents (customers, messages, enrollments, journey versions) have a full index on
 * the referencing columns. Without one, deleting a parent row scans the whole child table, so removing a tenant with
 * many customers took minutes once other tenants had enrollments (found by the WP-36 test runs).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('engage foreign-key indexes (real Postgres)', () => {
  let f: TenancyFixture;
  beforeAll(async () => { f = await setupTenancyFixture(); }, 90_000);
  afterAll(async () => { await f?.teardown(); });

  it('every foreign key to engage.profiles, engage.messages, engage.enrollments and engage.journey_versions is backed by a full index', async () => {
    const r = await f.admin.query<{ child: string; parent: string; def: string }>(
      `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'engage'
          AND c.confrelid IN ('engage.profiles'::regclass, 'engage.messages'::regclass, 'engage.enrollments'::regclass, 'engage.journey_versions'::regclass)
          AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indpred IS NULL
                            AND (i.indkey::int2[])[0:cardinality(c.conkey)-1] = c.conkey)`);
    expect(r.rows.map((x) => `${x.child} -> ${x.parent}: ${x.def}`)).toEqual([]);
  });
});
