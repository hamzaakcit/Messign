/**
 * CSV import (WP-09) on real Postgres: importer, job, HTTP upload, isolation.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const queued: Array<{ name: string; data: Record<string, unknown> }> = [];
let queueUp = true;
vi.mock('../../services/jobQueue.js', () => ({
  JOB_NAMES: { ENGAGE_IMPORT: 'engage/import' },
  enqueueJob: async (name: string, data: Record<string, unknown>) => { if (!queueUp) return null; queued.push({ name, data }); return 'job-1'; },
  registerJobHandler: async () => 'w1',
}));

describe.skipIf(!adminUrl)('csv import (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let A: string;
  let B: string;
  let run: typeof import('../../engage/import/run.js');
  let tokA: string; let tokB: string; let tokEmployee: string;
  const logs: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const u = () => Math.random().toString(36).slice(2, 8);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
  const H = 'external_id,email,phone,city,consent_email,consent_sms,consent_recorded_at,consent_evidence_ref\n';
  const count = async (org: string, table: string) => (await sql(org, `SELECT count(*)::int AS n FROM engage.${table}`)).rows[0].n as number;
  const prof = async (org: string, ext: string) => (await sql(org, `SELECT id, attributes FROM engage.profiles WHERE external_id = $1`, [ext])).rows[0];

  beforeAll(async () => {
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    run = await import('../../engage/import/run.js');
    app = await startEngageApp();
    A = f.A.organization.id; B = f.B.organization.id;
    const emp = `employee-${f.suffix}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status)
       VALUES ($1, $1, $2, $3, 'Plain Employee', 'employee', 'active')`, [A, emp, `emp@alpha-${f.suffix}.example.com`]);
    tokA = token(f.A.admin.authUserId, A); tokB = token(f.B.admin.authUserId, B); tokEmployee = token(emp, A);
  }, 90_000);

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    if (f) { await f.admin.query('DELETE FROM reimbursement_users WHERE auth_user_id = $1', [`employee-${f.suffix}`]); await f.teardown(); }
  });

  describe('profiles', () => {
    it('creates profiles with normalized identifiers, attributes and consents with evidence', async () => {
      const x = u();
      const r = await run.runImport(A, 'profiles', `${H}p-${x}-1, Ada@Example.com ,0532 000 00 01,Izmir,granted,revoked,${day(30)},checkout-form-v3\n`);
      expect(r.counts).toMatchObject({ rows: 1, created: 1, consents_recorded: 2, identifiers_skipped: 0 });
      expect(r.errorsTotal).toBe(0);
      const p = await prof(A, `p-${x}-1`);
      expect(p.attributes).toEqual({ city: 'Izmir' });
      const ids = await sql(A, `SELECT type, value_normalized, is_active FROM engage.identifiers WHERE profile_id = $1 ORDER BY type`, [p.id]);
      expect(ids.rows).toEqual([
        { type: 'email', value_normalized: 'ada@example.com', is_active: true },
        { type: 'external', value_normalized: `p-${x}-1`, is_active: true },
        { type: 'phone', value_normalized: '+905320000001', is_active: true },
      ]);
      const cs = await sql(A, `SELECT channel, status FROM engage.consent_state WHERE profile_id = $1 ORDER BY channel`, [p.id]);
      expect(cs.rows).toEqual([{ channel: 'email', status: 'granted' }, { channel: 'sms', status: 'revoked' }]);
      const ev = await sql(A, `SELECT evidence, source FROM engage.consents WHERE profile_id = $1 AND channel = 'email'`, [p.id]);
      expect(ev.rows[0].source).toBe('import');
      expect(ev.rows[0].evidence).toMatchObject({ evidence_ref: 'checkout-form-v3' });
    });

    it('reports bad rows by line, column and code without echoing values; good rows still land', async () => {
      const x = u();
      const csv = `${H}ok-${x},,,Izmir,,,,\n,secret1@example.com,,,,,,\nbad-${x},not-an-email-zzz,12345,Ankara,granted,,,\ng-${x},g@example.com,,,granted,,${day(5)},\n`;
      const r = await run.runImport(A, 'profiles', csv);
      expect(r.counts).toMatchObject({ rows: 4, created: 3, rows_rejected: 1, consents_skipped: 0 });
      expect(r.errors.map((e) => [e.line, e.field, e.code])).toEqual([
        [3, 'external_id', 'invalid_external_id'],
        [4, 'email', 'invalid_email'],
        [4, 'phone', 'invalid_phone'],
        [4, 'consent_email', 'consent_evidence_missing'],
        [5, 'consent_email', 'consent_evidence_missing'],
      ]);
      const text = JSON.stringify(r);
      for (const v of ['secret1', 'not-an-email-zzz', '12345']) expect(text).not.toContain(v);
      expect(await prof(A, `bad-${x}`)).toBeTruthy();
      expect((await sql(A, `SELECT 1 FROM engage.consent_state cs JOIN engage.profiles p ON p.id = cs.profile_id WHERE p.external_id = $1`, [`bad-${x}`])).rowCount, 'no consent without evidence').toBe(0);
    });

    it('re-running the same file changes nothing: no new identifiers, no new ledger rows', async () => {
      const x = u();
      const csv = `${H}r-${x}-1,r1-${x}@example.com,,Izmir,granted,,${day(10)},form\nr-${x}-2,r2-${x}@example.com,,Ankara,revoked,,,\n`;
      await run.runImport(A, 'profiles', csv);
      const before = { ids: await count(A, 'identifiers'), ledger: await count(A, 'consents') };
      const again = await run.runImport(A, 'profiles', csv);
      expect(again.counts).toMatchObject({ created: 0, updated: 2, consents_recorded: 0, consents_unchanged: 2 });
      expect({ ids: await count(A, 'identifiers'), ledger: await count(A, 'consents') }).toEqual(before);
    });

    it('a changed email keeps the old one as inactive history; a changed consent is appended', async () => {
      const x = u(); const ext = `c-${x}`;
      await run.runImport(A, 'profiles', `${H}${ext},old-${x}@example.com,,,granted,,${day(40)},form\n`);
      await run.runImport(A, 'profiles', `${H}${ext},new-${x}@example.com,,,revoked,,${day(1)},\n`);
      const p = await prof(A, ext);
      const rows = await sql(A, `SELECT value_normalized, is_active FROM engage.identifiers WHERE profile_id = $1 AND type = 'email' ORDER BY first_seen_at`, [p.id]);
      expect(rows.rows).toEqual([{ value_normalized: `old-${x}@example.com`, is_active: false }, { value_normalized: `new-${x}@example.com`, is_active: true }]);
      expect((await sql(A, `SELECT status FROM engage.consent_state WHERE profile_id = $1 AND channel = 'email'`, [p.id])).rows[0].status).toBe('revoked');
      expect((await sql(A, `SELECT count(*)::int AS n FROM engage.consents WHERE profile_id = $1`, [p.id])).rows[0].n).toBe(2);
    });

    it('the same customer twice merges (within a chunk and across chunks); later values win', async () => {
      const x = u(); const ext = `d-${x}`;
      const filler = Array.from({ length: 520 }, (_, i) => `f-${x}-${i},,,,,,,`).join('\n');
      const csv = `${H}${ext},,,Izmir,,,,\n${filler}\n${ext},d-${x}@example.com,,Bursa,,,,\n${ext},,,Adana,,,,\n`;
      const r = await run.runImport(A, 'profiles', csv);
      expect(r.counts.created + r.counts.updated).toBeGreaterThan(520);
      const p = await prof(A, ext);
      expect(p.attributes).toEqual({ city: 'Adana' });
      expect((await sql(A, `SELECT value_normalized FROM engage.identifiers WHERE profile_id = $1 AND type = 'email' AND is_active`, [p.id])).rows[0].value_normalized).toBe(`d-${x}@example.com`);
      const same = await run.runImport(A, 'profiles', `${H}m-${x},,,One,,,,\nm-${x},,,Two,,,,\n`);
      expect(same.counts).toMatchObject({ created: 1, merged_duplicates: 1 });
    });

    it('an email that belongs to another profile is reported and skipped; the profile is still imported', async () => {
      const x = u();
      await run.runImport(A, 'profiles', `${H}owner-${x},shared-${x}@example.com,,,,,,\n`);
      const r = await run.runImport(A, 'profiles', `${H}other-${x},shared-${x}@example.com,,Izmir,,,,\n`);
      expect(r.counts).toMatchObject({ created: 1, identifiers_skipped: 1 });
      expect(r.errors[0]).toMatchObject({ field: 'email', code: 'identifier_conflict' });
      expect((await sql(A, `SELECT 1 FROM engage.identifiers i JOIN engage.profiles p ON p.id = i.profile_id WHERE p.external_id = $1 AND i.type = 'email'`, [`other-${x}`])).rowCount).toBe(0);
    });

    it('two rows in one file claiming the same email: the first wins, the second is reported', async () => {
      const x = u();
      const r = await run.runImport(A, 'profiles', `${H}a-${x},tie-${x}@example.com,,,,,,\nb-${x},tie-${x}@example.com,,,,,,\n`);
      expect(r.counts).toMatchObject({ created: 2, identifiers_skipped: 1 });
      expect(r.errors[0]).toMatchObject({ code: 'identifier_conflict' });
    });

    it('an erased profile is not imported into', async () => {
      const x = u(); const ext = `e-${x}`;
      await run.runImport(A, 'profiles', `${H}${ext},,,Izmir,,,,\n`);
      await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE organization_id = $1 AND external_id = $2`, [A, ext]);
      const r = await run.runImport(A, 'profiles', `${H}${ext},,,Hacked,,,,\n`);
      expect(r.errors[0]).toMatchObject({ code: 'profile_erased' });
      expect((await prof(A, ext)).attributes).toEqual({ city: 'Izmir' });
    });

    it('tenants stay separate: the same file into A and B makes two sets of profiles', async () => {
      const x = u();
      const csv = `${H}t-${x},tt-${x}@example.com,,,,,,\n`;
      await run.runImport(A, 'profiles', csv);
      const before = await count(B, 'profiles');
      await run.runImport(B, 'profiles', csv);
      expect(await count(B, 'profiles')).toBe(before + 1);
      expect((await prof(A, `t-${x}`)).id).not.toBe((await prof(B, `t-${x}`)).id);
    });

    it('a dry run reports exactly what would happen and writes nothing', async () => {
      const x = u();
      await run.runImport(A, 'profiles', `${H}owner-${x},dry-${x}@example.com,,,,,,\n`);
      const before = { p: await count(A, 'profiles'), i: await count(A, 'identifiers'), c: await count(A, 'consents') };
      const csv = `${H}new-${x},,,,granted,,${day(3)},form\nclash-${x},dry-${x}@example.com,,,,,,\nbad-${x},nope,,,,,,\n`;
      const dry = await run.runImport(A, 'profiles', csv, { dryRun: true });
      expect(dry.counts).toMatchObject({ created: 3, identifiers_skipped: 1, consents_recorded: 1 });
      expect(dry.errors.map((e) => e.code)).toEqual(['invalid_email', 'identifier_conflict']);
      expect({ p: await count(A, 'profiles'), i: await count(A, 'identifiers'), c: await count(A, 'consents') }).toEqual(before);
      const real = await run.runImport(A, 'profiles', csv);
      expect(real.counts).toMatchObject({ created: 3, identifiers_skipped: 1, consents_recorded: 1 });
    });
  });

  describe('orders', () => {
    const OH = 'order_id,external_id,ordered_at,total,currency,product_ids\n';
    it('imports orders as order_completed events without starting any journey, and is idempotent', async () => {
      const x = u();
      await run.runImport(A, 'profiles', `${H}o-${x},,,,,,,\n`);
      const outboxBefore = await count(A, 'trigger_outbox');
      const csv = `${OH}ord-${x}-1,o-${x},${day(10)},"129,90",TRY,b1|b2\nord-${x}-2,o-${x},${day(200)},50,TRY,b3\nord-${x}-3,ghost-${x},${day(3)},10,TRY,b1\nord-${x}-4,o-${x},${day(600)},10,TRY,b1\n`;
      const r = await run.runImport(A, 'orders', csv);
      expect(r.counts).toMatchObject({ events_created: 2, rows_rejected: 2 });
      expect(r.errors.map((e) => e.code).sort()).toEqual(['date_too_old', 'unknown_profile']);
      const ev = await sql(A, `SELECT name, properties FROM engage.events WHERE client_event_id = $1`, [`import-order-ord-${x}-1`]);
      expect(ev.rows[0].name).toBe('order_completed');
      expect(ev.rows[0].properties).toMatchObject({ order_id: `ord-${x}-1`, total: 129.9, currency: 'TRY', product_ids: ['b1', 'b2'], source: 'import' });
      expect(await count(A, 'trigger_outbox'), 'history must not start journeys').toBe(outboxBefore);
      const again = await run.runImport(A, 'orders', csv);
      expect(again.counts).toMatchObject({ events_created: 0, events_already_imported: 2 });
    });

    it('the same order id twice in one file imports once; another tenant\'s order id is independent', async () => {
      const x = u();
      await run.runImport(A, 'profiles', `${H}o-${x},,,,,,,\n`);
      await run.runImport(B, 'profiles', `${H}o-${x},,,,,,,\n`);
      const csv = `${OH}dup-${x},o-${x},${day(5)},10,TRY,b1\ndup-${x},o-${x},${day(5)},10,TRY,b1\n`;
      expect((await run.runImport(A, 'orders', csv)).counts).toMatchObject({ events_created: 1, events_already_imported: 1 });
      expect((await run.runImport(B, 'orders', csv)).counts).toMatchObject({ events_created: 1 });
    });

    it('a dry run of orders writes nothing', async () => {
      const x = u();
      await run.runImport(A, 'profiles', `${H}o-${x},,,,,,,\n`);
      const before = await count(A, 'events');
      const r = await run.runImport(A, 'orders', `${OH}dry-${x},o-${x},${day(5)},10,TRY,b1\n`, { dryRun: true });
      expect(r.counts.events_created).toBe(1);
      expect(await count(A, 'events')).toBe(before);
      expect((await sql(A, `SELECT 1 FROM engage.event_keys WHERE client_event_id = $1`, [`import-order-dry-${x}`])).rowCount).toBe(0);
    });
  });

  describe('job and records', () => {
    it('runs a queued import, stores a value-free report, and deletes the uploaded file from the database', async () => {
      const x = u();
      const csv = `${H}j-${x},j-${x}@example.com,,Izmir,granted,,${day(2)},form\nbad-${x},nope-zzz,,,,,,\n`;
      const id = await run.createImport(A, null, 'profiles', false, csv);
      expect((await run.getImport(A, id)).status).toBe('queued');
      await run.runImportJob({ importId: id, organizationId: A });
      const rec = await run.getImport(A, id);
      expect(rec).toMatchObject({ status: 'completed', rowsTotal: 2, rowsProcessed: 2 });
      expect(rec.counts).toMatchObject({ created: 2, consents_recorded: 1 });
      expect(rec.errors[0]).toMatchObject({ code: 'invalid_email', line: 3 });
      expect(JSON.stringify(rec)).not.toMatch(/nope-zzz|j-.*@example\.com/);
      expect((await sql(A, `SELECT content FROM engage.imports WHERE id = $1`, [id])).rows[0].content, 'file deleted').toBeNull();
      await run.runImportJob({ importId: id, organizationId: A }); // a retry of a finished job does nothing
      expect((await run.getImport(A, id)).status).toBe('completed');
    });

    it('a file with the wrong columns fails with a readable message and deletes the file', async () => {
      const id = await run.createImport(A, null, 'orders', false, 'order_id,external_id\no1,c1\n');
      await run.runImportJob({ importId: id, organizationId: A });
      const rec = await run.getImport(A, id);
      expect(rec.status).toBe('failed');
      expect(rec.errorMessage).toMatch(/ordered_at/);
      expect((await sql(A, `SELECT content FROM engage.imports WHERE id = $1`, [id])).rows[0].content).toBeNull();
    });

    it('rejects an unreadable upload before queueing it', async () => {
      await expect(run.createImport(A, null, 'profiles', false, '')).rejects.toThrow(run.ImportInputError);
      await expect(run.createImport(A, null, 'profiles', false, 'a,a\n1,2')).rejects.toThrow(/same name/);
      await expect(run.createImport(A, null, 'nonsense' as never, false, 'a\n1')).rejects.toThrow(run.ImportInputError);
    });

    it('a dry-run record never writes data', async () => {
      const x = u();
      const before = await count(A, 'profiles');
      const id = await run.createImport(A, null, 'profiles', true, `${H}dr-${x},,,,,,,\n`);
      await run.runImportJob({ importId: id, organizationId: A });
      expect((await run.getImport(A, id)).counts).toMatchObject({ created: 1 });
      expect(await count(A, 'profiles')).toBe(before);
    });

    it('import rows cannot be deleted and only progress columns can change', async () => {
      const id = await run.createImport(A, null, 'profiles', true, `${H}x-${u()},,,,,,,\n`);
      await expect(sql(A, `DELETE FROM engage.imports WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.imports SET kind = 'orders' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.imports SET created_by = gen_random_uuid() WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });
  });

  describe('HTTP', () => {
    const post = (path: string, tok: string | undefined, body: string, type = 'text/csv') =>
      fetch(`${app.baseUrl}${path}`, { method: 'POST', headers: { 'content-type': type, ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body });

    it('requires authentication and the admin role', async () => {
      expect((await post('/imports?kind=profiles', undefined, 'external_id\nx')).status).toBe(401);
      expect((await post('/imports?kind=profiles', tokEmployee, 'external_id\nx')).status).toBe(403);
      expect((await app.http('/imports', { token: tokEmployee })).status).toBe(403);
    });

    it('accepts a CSV with 202, queues a job for the caller\'s tenant, and the report is readable only by that tenant', async () => {
      queued.length = 0; queueUp = true;
      const x = u();
      const res = await post('/imports?kind=profiles', tokA, `${H}h-${x},,,Izmir,,,,\n`);
      expect(res.status).toBe(202);
      const { id } = (await res.json()) as { id: string };
      expect(queued).toEqual([{ name: 'engage/import', data: { importId: id, organizationId: A } }]);
      await run.runImportJob({ importId: id, organizationId: A });
      const mine = await app.http(`/imports/${id}`, { token: tokA });
      expect(mine.status).toBe(200);
      expect(mine.json).toMatchObject({ status: 'completed', kind: 'profiles' });
      expect((await app.http(`/imports/${id}`, { token: tokB })).status).toBe(404);
      expect((await app.http(`/imports/not-a-uuid`, { token: tokA })).status).toBe(404);
      const list = await app.http('/imports', { token: tokA });
      expect((list.json.imports as Array<{ id: string }>).some((i) => i.id === id)).toBe(true);
      expect(JSON.stringify(list.json)).not.toContain('"errors"');
      expect((await app.http('/imports', { token: tokB })).text).not.toContain(id);
    });

    it('rejects a bad kind, an empty body and a malformed file; answers 503 and marks the record failed if the queue is down', async () => {
      expect((await post('/imports?kind=nonsense', tokA, 'external_id\nx')).status).toBe(400);
      expect((await post('/imports?kind=profiles', tokA, '')).status).toBe(400);
      expect((await post('/imports?kind=profiles', tokA, 'a,a\n1,2')).status).toBe(400);
      queueUp = false;
      const res = await post('/imports?kind=profiles', tokA, `${H}q-${u()},,,,,,,\n`);
      expect(res.status).toBe(503);
      const { id } = (await res.json()) as { id: string };
      expect((await run.getImport(A, id)).status).toBe('failed');
      expect((await sql(A, `SELECT content FROM engage.imports WHERE id = $1`, [id])).rows[0].content).toBeNull();
      queueUp = true;
    });

    it('passes the dry_run flag through', async () => {
      queueUp = true;
      const res = await post('/imports?kind=profiles&dry_run=1', tokA, `${H}z-${u()},,,,,,,\n`);
      expect(((await res.json()) as { dryRun: boolean }).dryRun).toBe(true);
    });
  });

  it('personal data from the files never appears in logs', () => {
    const joined = logs.join('\n');
    expect(joined).not.toMatch(/@example\.com/);
    expect(joined).not.toMatch(/\+90532/);
  });
});
