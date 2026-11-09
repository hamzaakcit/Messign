/**
 * Ingestion API v1 (WP-08) on real Postgres, through the real HTTP stack and the non-bypass engage role.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('ingestion API v1 (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let A: string;
  let B: string;
  let keyA: string;
  let keyB: string;
  let keyTriggerA: string;
  let keyIngestOnlyA: string;
  const logs: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
  const DAY = 24 * 3600_000;
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const upsert = (key: string, body: unknown) => app.http('/v1/profiles:upsert', { key, body });
  const track = (key: string, events: unknown[]) => app.http('/v1/events:track', { key, body: { events } });
  const ev = (external_id: string, over: Record<string, unknown> = {}) => ({
    client_event_id: `ev-${u()}`, external_id, name: 'cart_updated', occurred_at: iso(1000), properties: { cart_id: 'c1', items: [{ sku: 'x', qty: 1 }] }, ...over,
  });
  const eventCount = async (org: string, clientEventId: string) =>
    (await sql(org, `SELECT count(*)::int AS n FROM engage.events WHERE client_event_id = $1`, [clientEventId])).rows[0].n as number;
  const outboxCount = async (org: string, clientEventId: string) =>
    (await sql(org, `SELECT count(*)::int AS n FROM engage.trigger_outbox o JOIN engage.event_keys k ON k.event_id = o.event_id AND k.organization_id = o.organization_id
                     WHERE k.client_event_id = $1`, [clientEventId])).rows[0].n as number;

  async function makeKey(org: string, scopes: string[]): Promise<string> {
    const k = f.keys.generateApiKey();
    await f.admin.query(`INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'ingest-test', $2, $3, $4)`, [org, k.prefix, k.hash, scopes]);
    return k.plaintext;
  }

  beforeAll(async () => {
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    app = await startEngageApp();
    A = f.A.organization.id;
    B = f.B.organization.id;
    keyA = await makeKey(A, ['ingest']);
    keyIngestOnlyA = await makeKey(A, ['ingest']);
    keyTriggerA = await makeKey(A, ['journeys:trigger']);
    keyB = await makeKey(B, ['ingest']);
  }, 90_000);

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('authentication and scope', () => {
    it('401 without a key or with a bad one, on every route', async () => {
      for (const [path, method] of [['/v1/profiles:upsert', 'POST'], ['/v1/events:track', 'POST'], ['/v1/journeys/x/trigger', 'POST'], ['/v1/openapi.json', 'GET']] as const) {
        expect((await app.http(path, { method, body: method === 'POST' ? {} : undefined })).status, `${path} no key`).toBe(401);
        expect((await app.http(path, { method, key: 'mke_aaaaaaaa_' + 'b'.repeat(43), body: method === 'POST' ? {} : undefined })).status, `${path} bad key`).toBe(401);
      }
    });
    it('403 when the key lacks the scope', async () => {
      expect((await upsert(keyTriggerA, { external_id: 'x' })).status).toBe(403);
      expect((await track(keyTriggerA, [ev('x')])).status).toBe(403);
      expect((await app.http('/v1/journeys/k/trigger', { key: keyIngestOnlyA, body: { external_id: 'x', idempotency_key: 'k' } })).status).toBe(403);
    });
    it('a revoked key is refused', async () => {
      const k = await makeKey(A, ['ingest']);
      expect((await upsert(k, { external_id: `r-${u()}` })).status).toBe(200);
      await f.admin.query(`UPDATE engage.api_keys SET revoked_at = now() WHERE key_hash = $1`, [f.keys.hashApiKey(k)]);
      expect((await upsert(k, { external_id: `r-${u()}` })).status).toBe(401);
    });
    it('serves the OpenAPI document to a key holder', async () => {
      const r = await app.http('/v1/openapi.json', { key: keyA });
      expect(r.status).toBe(200);
      expect(r.json.openapi).toBe('3.0.3');
      expect(Object.keys(r.json.paths as object)).toContain('/events:track');
    });
  });

  describe('profiles:upsert', () => {
    it('creates a profile for the key\'s tenant, normalizing identifiers', async () => {
      const ext = `p-${u()}`;
      const r = await upsert(keyA, { external_id: ext, identifiers: { email: ' Ada@Example.com ', phone: '0532 111 22 33' }, attributes: { city: 'Izmir' } });
      expect(r.status).toBe(200);
      expect(r.json.identifiers).toEqual({ email: 'ada@example.com', phone: '+905321112233' });
      expect((await sql(A, `SELECT 1 FROM engage.profiles WHERE external_id = $1`, [ext])).rowCount).toBe(1);
      expect((await sql(B, `SELECT 1 FROM engage.profiles WHERE external_id = $1`, [ext])).rowCount).toBe(0);
    });
    it('rejects a body organization_id instead of trusting it', async () => {
      const ext = `p-${u()}`;
      const r = await upsert(keyA, { external_id: ext, organization_id: B });
      expect(r.status).toBe(400);
      expect((await sql(B, `SELECT 1 FROM engage.profiles WHERE external_id = $1`, [ext])).rowCount).toBe(0);
    });
    it('changing an email keeps history; a repeat is a no-op', async () => {
      const ext = `p-${u()}`;
      const first = `a-${u()}@example.com`;
      await upsert(keyA, { external_id: ext, identifiers: { email: first } });
      await upsert(keyA, { external_id: ext, identifiers: { email: `b-${u()}@example.com` } });
      const rows = await sql(A, `SELECT is_active FROM engage.identifiers i JOIN engage.profiles p ON p.id = i.profile_id WHERE p.external_id = $1 AND i.type = 'email' ORDER BY i.first_seen_at`, [ext]);
      expect(rows.rows.map((r) => r.is_active)).toEqual([false, true]);
    });
    it('409 when the email belongs to another profile; nothing changes', async () => {
      const taken = `t-${u()}@example.com`;
      await upsert(keyA, { external_id: `o-${u()}`, identifiers: { email: taken } });
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext, identifiers: { email: `m-${u()}@example.com` } });
      const r = await upsert(keyA, { external_id: ext, identifiers: { email: taken }, attributes: { x: 1 } });
      expect(r.status).toBe(409);
      expect((await sql(A, `SELECT attributes FROM engage.profiles WHERE external_id = $1`, [ext])).rows[0].attributes).toEqual({});
    });
    it('records consents with evidence, refuses a grant without it, and the whole request is atomic', async () => {
      const ext = `p-${u()}`;
      const ok = await upsert(keyA, { external_id: ext, identifiers: { email: `c-${u()}@example.com` }, consents: [{ channel: 'email', status: 'granted', source: 'web', evidence: { text_version: 'v2', ip: '203.0.113.5' } }] });
      expect(ok.status).toBe(200);
      expect(ok.json.consents).toEqual({ email: 'granted' });
      const ext2 = `p-${u()}`;
      const bad = await upsert(keyA, { external_id: ext2, consents: [{ channel: 'email', status: 'granted' }] });
      expect(bad.status).toBe(400);
      expect((await sql(A, `SELECT 1 FROM engage.profiles WHERE external_id = $1`, [ext2])).rowCount, 'profile rolled back with the refused consent').toBe(0);
    });
    it('a claimed IYS source is refused', async () => {
      expect((await upsert(keyA, { external_id: `p-${u()}`, consents: [{ channel: 'sms', status: 'granted', source: 'iys' }] })).status).toBe(400);
    });
    it('an invalid email is a 400 that does not echo the value', async () => {
      const r = await upsert(keyA, { external_id: `p-${u()}`, identifiers: { email: 'not-an-email-zzz' } });
      expect(r.status).toBe(400);
      expect(r.text).not.toContain('not-an-email-zzz');
    });
  });

  describe('events:track', () => {
    it('stores an accepted event with one outbox row, in the key\'s tenant only', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const e = ev(ext, { name: 'order_completed', properties: { order_id: 'o-1', total: 99.5 } });
      const r = await track(keyA, [e]);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ accepted: 1, duplicates: 0, rejected: 0 });
      expect(await eventCount(A, e.client_event_id)).toBe(1);
      expect(await outboxCount(A, e.client_event_id)).toBe(1);
      expect(await eventCount(B, e.client_event_id)).toBe(0);
    });

    it('a duplicate event produces one row, one outbox row, and duplicate: true', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const e = ev(ext);
      expect((await track(keyA, [e])).json).toMatchObject({ accepted: 1 });
      const again = await track(keyA, [e]);
      expect(again.status).toBe(200);
      expect(again.json).toMatchObject({ accepted: 0, duplicates: 1 });
      expect((again.json.results as Array<{ duplicate?: boolean }>)[0]!.duplicate).toBe(true);
      expect(await eventCount(A, e.client_event_id)).toBe(1);
      expect(await outboxCount(A, e.client_event_id)).toBe(1);
    });

    it('a replay with a different timestamp is still a duplicate', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const e = ev(ext, { occurred_at: iso(2 * DAY) });
      await track(keyA, [e]);
      const again = await track(keyA, [{ ...e, occurred_at: iso(40 * DAY) }]);
      expect(again.json).toMatchObject({ accepted: 0, duplicates: 1 });
      expect(await eventCount(A, e.client_event_id)).toBe(1);
    });

    it('the same client_event_id is a separate event in another tenant', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      await upsert(keyB, { external_id: ext });
      const e = ev(ext);
      expect((await track(keyA, [e])).json).toMatchObject({ accepted: 1 });
      expect((await track(keyB, [e])).json).toMatchObject({ accepted: 1 });
    });

    it('the same id twice in one batch stores one row', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const e = ev(ext);
      const r = await track(keyA, [e, e]);
      expect(r.json).toMatchObject({ accepted: 1, duplicates: 1 });
      expect(await eventCount(A, e.client_event_id)).toBe(1);
    });

    it('rejects bad events individually and leaves no trace of them, keeping the good ones', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const good1 = ev(ext);
      const unknown = ev(`nobody-${u()}`);
      const future = ev(ext, { occurred_at: new Date(Date.now() + DAY).toISOString() });
      const ancient = ev(ext, { occurred_at: iso(500 * DAY) });
      const badReserved = ev(ext, { name: 'order_completed', properties: {} });
      const good2 = ev(ext);
      const r = await track(keyA, [good1, unknown, future, ancient, badReserved, good2]);
      expect(r.status).toBe(200);
      expect((r.json.results as Array<{ status: string }>).map((x) => x.status)).toEqual(['accepted', 'rejected', 'rejected', 'rejected', 'rejected', 'accepted']);
      for (const e of [unknown, future, ancient, badReserved]) {
        expect(await eventCount(A, e.client_event_id), e.client_event_id).toBe(0);
        expect(await outboxCount(A, e.client_event_id)).toBe(0);
      }
      expect(await eventCount(A, good1.client_event_id)).toBe(1);
      expect(await eventCount(A, good2.client_event_id)).toBe(1);
      // A rejected id was never claimed, so the corrected event can be sent again.
      expect((await track(keyA, [{ ...badReserved, properties: { order_id: 'fixed' } }])).json).toMatchObject({ accepted: 1 });
    });

    it('cannot record an event for a profile that exists only in another tenant', async () => {
      const ext = `only-b-${u()}`;
      await upsert(keyB, { external_id: ext });
      const e = ev(ext);
      expect((await track(keyA, [e])).json).toMatchObject({ rejected: 1 });
      expect(await eventCount(A, e.client_event_id)).toBe(0);
      expect(await eventCount(B, e.client_event_id)).toBe(0);
    });

    it('rejects events for an erased profile', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE organization_id = $1 AND external_id = $2`, [A, ext]);
      expect((await track(keyA, [ev(ext)])).json).toMatchObject({ rejected: 1 });
    });

    it('400 for an oversized batch, an empty batch and a body organization_id', async () => {
      const ext = `p-${u()}`;
      expect((await track(keyA, Array.from({ length: 501 }, () => ev(ext)))).status).toBe(400);
      expect((await track(keyA, [])).status).toBe(400);
      expect((await app.http('/v1/events:track', { key: keyA, body: { organization_id: B, events: [ev(ext)] } })).status).toBe(400);
    });

    it('creates the monthly partition on demand and keeps rows out of reach except through the parent', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const at = new Date(Date.now() - 200 * DAY);
      const part = `events_${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
      const e = ev(ext, { occurred_at: at.toISOString() });
      expect((await track(keyA, [e])).json).toMatchObject({ accepted: 1 });
      expect((await f.admin.query(`SELECT to_regclass('engage.${part}')::text AS r`)).rows[0].r).toBe(`engage.${part}`);
      expect(await eventCount(A, e.client_event_id)).toBe(1);
      await expect(sql(A, `SELECT * FROM engage.${part}`)).rejects.toThrow(/permission denied/);
      await expect(sql(A, `INSERT INTO engage.${part} (organization_id, profile_id, client_event_id, name, occurred_at) VALUES ($1, gen_random_uuid(), 'x', 'x', $2)`, [A, at.toISOString()])).rejects.toThrow(/permission denied/);
    });

    it('a batch creates its missing partitions before writing anything, so it cannot deadlock with another partition creation', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const old = new Date(Date.now() - 330 * DAY);
      const part = `events_${old.getUTCFullYear()}${String(old.getUTCMonth() + 1).padStart(2, '0')}`;
      await f.admin.query(`DROP TABLE IF EXISTS engage.${part}`);
      const holder = await f.admin.connect();
      try {
        // Hold the lock ensure_event_partition takes (migration 114) so the batch has to wait for it mid-way.
        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock(7040802)');
        const batch = track(keyA, [ev(ext), ev(ext, { occurred_at: old.toISOString() })]); // this month first, then the missing one
        await new Promise((r) => setTimeout(r, 400));
        // While it waits, the batch must hold nothing on engage.events: if it did, a partition creation here would deadlock.
        await holder.query("SET LOCAL lock_timeout = '2s'");
        await holder.query('LOCK TABLE engage.events IN ACCESS EXCLUSIVE MODE');
        await holder.query('COMMIT');
        expect((await batch).json).toMatchObject({ accepted: 2 });
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined);
        holder.release();
      }
    });

    it('two transactions creating the same new month at once both succeed (no partition-creation race)', async () => {
      const pool = f.engage.getEngagePool();
      const ts = new Date(Date.now() - 270 * DAY).toISOString();
      const c1 = await pool.connect();
      const c2 = await pool.connect();
      try {
        await c1.query('BEGIN');
        await c1.query('SELECT engage.ensure_event_partition($1)', [ts]); // creates the partition, uncommitted
        await c2.query('BEGIN');
        const second = c2.query('SELECT engage.ensure_event_partition($1)', [ts]); // must wait, not fail
        await new Promise((r) => setTimeout(r, 400));
        await c1.query('COMMIT');
        await expect(second).resolves.toBeDefined();
        await c2.query('COMMIT');
      } finally {
        await c1.query('ROLLBACK').catch(() => undefined);
        await c2.query('ROLLBACK').catch(() => undefined);
        c1.release(); c2.release();
      }
    });

    it('the partition function refuses timestamps outside the window, so it cannot be abused to create tables', async () => {
      await expect(sql(A, `SELECT engage.ensure_event_partition(now() - interval '800 days')`)).rejects.toThrow(/outside the accepted window/);
      await expect(sql(A, `SELECT engage.ensure_event_partition(now() + interval '60 days')`)).rejects.toThrow(/outside the accepted window/);
    });

    it('events and their dedup keys are immutable; the outbox can only be marked processed', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const e = ev(ext);
      await track(keyA, [e]);
      await expect(sql(A, `UPDATE engage.events SET name = 'other' WHERE client_event_id = $1`, [e.client_event_id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.events WHERE client_event_id = $1`, [e.client_event_id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.event_keys WHERE client_event_id = $1`, [e.client_event_id])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `UPDATE engage.trigger_outbox SET event_id = gen_random_uuid() WHERE organization_id = $1`, [A])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.trigger_outbox WHERE organization_id = $1`, [A])).rejects.toThrow(/permission denied/);
      expect((await sql(A, `UPDATE engage.trigger_outbox SET status = 'done', processed_at = now() WHERE status = 'pending' AND event_id = (SELECT event_id FROM engage.event_keys WHERE client_event_id = $1)`, [e.client_event_id])).rowCount).toBe(1);
    });

    it('the database itself refuses an event for another tenant\'s profile, a bad name, or non-object properties', async () => {
      const own = (await upsert(keyA, { external_id: `p-${u()}` })).json.id as string;
      const foreign = (await upsert(keyB, { external_id: `p-${u()}` })).json.id as string;
      const ins = (profile: string, name: string, props: string) => sql(A,
        `INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at) VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
        [A, profile, `sql-${u()}`, name, props]);
      await ins(own, 'fine_name', '{}');
      await expect(ins(foreign, 'fine_name', '{}')).rejects.toThrow(/foreign key/);
      await expect(ins(own, 'Bad-Name', '{}')).rejects.toThrow(/violates check constraint/);
      await expect(ins(own, 'fine_name', '[1]')).rejects.toThrow(/violates check constraint/);
    });

    it('a batch of 500 is accepted in one request', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const batch = Array.from({ length: 500 }, () => ev(ext));
      const r = await track(keyA, batch);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ accepted: 500 });
      expect((await track(keyA, batch)).json).toMatchObject({ accepted: 0, duplicates: 500 });
    }, 30_000);
  });

  describe('journeys/:key/trigger (the engine itself is tested in engageJourneyEngine.integration.test.ts)', () => {
    it('validates the body, and answers 404 for a journey that is not active', async () => {
      const ext = `p-${u()}`;
      await upsert(keyA, { external_id: ext });
      const path = '/v1/journeys/cart-abandonment/trigger';
      expect((await app.http(path, { key: keyTriggerA, body: { external_id: ext, idempotency_key: 'k1' } })).status).toBe(404);
      expect((await app.http(path, { key: keyTriggerA, body: { external_id: ext } })).status).toBe(400);
      expect((await app.http(path, { key: keyTriggerA, body: { external_id: ext, idempotency_key: 'k1', organization_id: B } })).status).toBe(400);
    });
  });

  it('personal data and API keys never appear in logs', () => {
    const joined = logs.join('\n');
    expect(joined).not.toMatch(/@example\.com/);
    expect(joined).not.toMatch(/\+90532/);
    expect(joined).not.toMatch(/mke_[A-Za-z0-9_-]{8}_/);
  });
});
