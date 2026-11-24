/**
 * Segments and the scheduled segment trigger (WP-36) on real Postgres and the real HTTP stack.
 * Acceptance: segment counts match independent SQL; a scheduled run enrolls once per customer per run.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import type { Condition } from '../../engage/journeys/definition.js';

const DAY = 86_400_000;

describe.skipIf(!adminUrl)('segments (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let S: typeof import('../../engage/segments/segments.js');
  let C: typeof import('../../engage/segments/compile.js');
  let R: typeof import('../../engage/segments/runs.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let JC: typeof import('../../engage/journeys/conditions.js');
  let T: typeof import('../../engage/templates/templates.js');
  let creds: typeof import('../../engage/credentials.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Seg ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }
  const ids = async (org: string, where: unknown, at: Date) => {
    const v = (await import('../../engage/segments/definition.js')).validateSegmentDefinition({ where });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    const out: string[] = [];
    for (let after: string | null = null; ;) {
      const q = C.buildSegmentQuery(v.definition, org, at, { mode: 'ids', afterId: after, limit: 5000 });
      const rows = (await sql(org, q.text, q.params)).rows as Array<{ id: string }>;
      if (!rows.length) break;
      out.push(...rows.map((r) => r.id));
      after = rows.at(-1)!.id;
    }
    return out;
  };
  const count = async (org: string, where: unknown, at: Date) => (await S.previewSegment(org, { where }, at)).count;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    S = await import('../../engage/segments/segments.js');
    C = await import('../../engage/segments/compile.js');
    R = await import('../../engage/segments/runs.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    JC = await import('../../engage/journeys/conditions.js');
    T = await import('../../engage/templates/templates.js');
    creds = await import('../../engage/credentials.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the SQL means what the journey condition evaluator means (attributes)', () => {
    const PROFILES: Array<Record<string, unknown>> = [
      {}, { tier: 'gold' }, { tier: 'Gold' }, { tier: 'silver' }, { tier: null }, { tier: 5 }, { tier: '5' }, { tier: true }, { tier: false },
      { age: 30 }, { age: 30.5 }, { age: -3 }, { age: '30' }, { age: 0 }, { age: 100000000000 },
      { tags: ['a', 'b'] }, { tags: ['b'] }, { tags: [] }, { tags: [1, 2] }, { tags: [true] }, { tags: 'abc' }, { tags: { a: 1 } },
      { city: 'İstanbul' }, { city: 'ankara' }, { city: 'Ankara' }, { city: '' }, { city: 'a%b_c' }, { city: "o'brien" },
      { tier: 'gold', age: 40, city: 'İstanbul', tags: ['a'] }, { tier: 'silver', age: 20, city: 'Ankara', vip: true },
      { nested: { x: 1 } }, { constructor: 'x', toString: 'y' },
    ];
    const cases: Condition[] = [];
    for (const [field, vals] of Object.entries({
      'attributes.tier': ['gold', 'Gold', 5, '5', true, false, ''], 'attributes.age': [30, 30.5, 0, -3, '30', 99999999999],
      'attributes.tags': ['a', 'b', 1, true, 'abc', 'x'], 'attributes.city': ['İstanbul', 'ankara', 'stan', '', 'a%b', "o'b", 'A'],
      'attributes.vip': [true, false], 'attributes.constructor': ['x'], 'attributes.nested': ['x'],
    })) {
      for (const value of vals as Array<string | number | boolean>) {
        for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const) cases.push({ field, op, value });
        cases.push({ field, op: 'in', value: [value, 'zzz'] });
      }
      for (const op of ['exists', 'not_exists'] as const) cases.push({ field, op });
    }
    cases.push(
      { all: [{ field: 'attributes.tier', op: 'eq', value: 'gold' }, { field: 'attributes.age', op: 'gt', value: 35 }] },
      { any: [{ field: 'attributes.tier', op: 'eq', value: 'silver' }, { field: 'attributes.vip', op: 'exists' }] },
      { not: { field: 'attributes.tier', op: 'eq', value: 'gold' } },
      { not: { field: 'attributes.missing', op: 'eq', value: 1 } },
      { not: { all: [{ field: 'attributes.age', op: 'lt', value: 100 }, { not: { field: 'attributes.city', op: 'contains', value: 'stan' } }] } },
    );

    it(`agrees on ${cases.length} conditions over ${PROFILES.length} customers`, async () => {
      const t = await tenant();
      const rows = PROFILES.map((attributes, i) => ({ ext: `a-${i}`, attributes }));
      await sql(t.org, `INSERT INTO engage.profiles (organization_id, external_id, attributes) SELECT $1, x->>'ext', x->'attributes' FROM jsonb_array_elements($2::jsonb) x`, [t.org, JSON.stringify(rows)]);
      const byId = new Map((await sql(t.org, `SELECT id, external_id, attributes FROM engage.profiles WHERE organization_id = $1`, [t.org])).rows.map((r) => [r.id as string, r.attributes as Record<string, unknown>]));
      const at = new Date();
      const diffs: string[] = [];
      let yes = 0; let no = 0;
      for (const cond of cases) {
        const sqlIds = new Set(await ids(t.org, cond, at));
        for (const [id, attributes] of byId) {
          const js = JC.evaluateCondition(cond, { attributes });
          if (js) yes++; else no++;
          if (js !== sqlIds.has(id)) diffs.push(`${JSON.stringify(cond)} on ${JSON.stringify(attributes)}: js ${js}, sql ${!js}`);
        }
      }
      expect(diffs.slice(0, 10)).toEqual([]);
      // The comparison is not vacuous: plenty of matches and plenty of non-matches.
      expect(yes).toBeGreaterThan(500);
      expect(no).toBeGreaterThan(5000);
    }, 120_000);
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('acceptance: counts match independent SQL (order history, consent, attributes)', () => {
    it('for a battery of definitions, the segment count equals a differently written query', async () => {
      const t = await tenant();
      const at = new Date();
      const N = 300;
      // Profile i: pattern i % 6. 0 never ordered, 1 one recent order, 2 one old order, 3 old then recent, 4 two old, 5 erased with an old order.
      const prof = Array.from({ length: N }, (_, i) => ({ ext: `o-${i}`, city: i % 3 === 0 ? 'İstanbul' : 'Ankara', tier: i % 4 === 0 ? 'gold' : 'basic' }));
      await f.admin.query(`INSERT INTO engage.profiles (organization_id, external_id, attributes) SELECT $1, x->>'ext', jsonb_build_object('city', x->>'city', 'tier', x->>'tier') FROM jsonb_array_elements($2::jsonb) x`, [t.org, JSON.stringify(prof)]);
      const idOf = new Map((await f.admin.query(`SELECT id, external_id FROM engage.profiles WHERE organization_id = $1`, [t.org])).rows.map((r) => [r.external_id as string, r.id as string]));
      const day = (n: number) => new Date(at.getTime() - n * DAY).toISOString();
      const orders: Array<{ p: string; at: string; total: unknown }> = [];
      prof.forEach((p, i) => {
        const pid = idOf.get(p.ext)!;
        const k = i % 6;
        // Fractional ages: 10.5 days is 10 whole days, 30.5 days is outside a 30-day window but inside 31.
        if (k === 1) orders.push({ p: pid, at: day(10.5), total: 50 }, { p: pid, at: day(30.5), total: 50 });
        if (k === 2) orders.push({ p: pid, at: day(150), total: 150 });
        if (k === 5) orders.push({ p: pid, at: day(150), total: 100 });
        if (k === 3) { orders.push({ p: pid, at: day(200), total: '75.50' }, { p: pid, at: day(20), total: 'not a number' }); }
        if (k === 4) orders.push({ p: pid, at: day(120), total: 10 }, { p: pid, at: day(400), total: 20 });
      });
      orders.push({ p: idOf.get('o-0')!, at: new Date(at.getTime() + 2 * DAY).toISOString(), total: 999 }); // after the evaluation time: not counted
      await f.admin.query(
        `INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
         SELECT $1, (x->>'p')::uuid, 'ord-' || gen_random_uuid(), 'order_completed', jsonb_build_object('order_id', gen_random_uuid()::text, 'total', x->'total'), (x->>'at')::timestamptz
           FROM jsonb_array_elements($2::jsonb) x`, [t.org, JSON.stringify(orders)]);
      await f.admin.query(`INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
                           SELECT $1, id, 'cart-' || id, 'cart_updated', '{"cart_id":"c","items":[]}'::jsonb, $2 FROM engage.profiles WHERE organization_id = $1`, [t.org, day(1)]);
      // Consent: granted for i % 5 != 0, revoked for i % 10 == 5 afterwards.
      await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence)
                           SELECT $1, p.id, 'email', 'granted', 'import', '{"f":"sim"}'::jsonb FROM engage.profiles p WHERE p.organization_id = $1 AND split_part(p.external_id, '-', 2)::int % 5 <> 0`, [t.org]);
      await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source)
                           SELECT $1, p.id, 'email', 'revoked', 'web' FROM engage.profiles p WHERE p.organization_id = $1 AND split_part(p.external_id, '-', 2)::int % 10 = 5`, [t.org]);
      await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE organization_id = $1 AND split_part(external_id, '-', 2)::int % 6 = 5`, [t.org]);

      const ev = (cond: string) => `
        SELECT count(*)::int AS n FROM engage.profiles p
         WHERE p.organization_id = $1 AND p.erased_at IS NULL AND $2::timestamptz IS NOT NULL AND (${cond})`;
      const ord = `(SELECT count(*) FROM engage.events e WHERE e.profile_id = p.id AND e.name = 'order_completed' AND e.occurred_at <= $2::timestamptz)`;
      const ordIn = (d: number) => `(SELECT count(*) FROM engage.events e WHERE e.profile_id = p.id AND e.name = 'order_completed' AND e.occurred_at <= $2::timestamptz AND e.occurred_at > $2::timestamptz - interval '${d} days')`;
      const spent = `(SELECT COALESCE(sum(CASE WHEN e.properties->>'total' ~ '^[0-9.]+$' THEN (e.properties->>'total')::numeric END), 0) FROM engage.events e WHERE e.profile_id = p.id AND e.name = 'order_completed' AND e.occurred_at <= $2::timestamptz)`;
      const since = `(SELECT floor(extract(epoch FROM ($2::timestamptz - max(e.occurred_at))) / 86400) FROM engage.events e WHERE e.profile_id = p.id AND e.name = 'order_completed' AND e.occurred_at <= $2::timestamptz)`;
      const status = `(SELECT s.status FROM engage.consent_state s WHERE s.profile_id = p.id AND s.channel = 'email')`;
      const battery: Array<[string, unknown, string]> = [
        ['ever ordered', { field: 'orders.count', op: 'gte', value: 1 }, `${ord} >= 1`],
        ['never ordered', { field: 'orders.count', op: 'eq', value: 0 }, `${ord} = 0`],
        ['two orders', { field: 'orders.count', op: 'gte', value: 2 }, `${ord} >= 2`],
        ['orders in 30 days', { field: 'orders.count_30d', op: 'gte', value: 1 }, `${ordIn(30)} >= 1`],
        ['exactly one order in 30 days (the 30.5-day-old one is outside)', { field: 'orders.count_30d', op: 'eq', value: 1 }, `${ordIn(30)} = 1`],
        ['last order exactly 10 whole days ago', { field: 'orders.days_since_last', op: 'eq', value: 10 }, `${since} = 10`],
        ['spent exactly 100 (two 50 orders)', { field: 'orders.total_spent', op: 'eq', value: 100 }, `${spent} = 100`],
        ['orders in 90 days', { field: 'orders.count_90d', op: 'gte', value: 1 }, `${ordIn(90)} >= 1`],
        ['orders in 365 days', { field: 'orders.count_365d', op: 'gte', value: 2 }, `${ordIn(365)} >= 2`],
        ['spent over 100', { field: 'orders.total_spent', op: 'gt', value: 100 }, `${spent} > 100`],
        ['spent in a year, at most 60', { field: 'orders.total_spent_365d', op: 'lte', value: 60 }, `${spent.replace("p.id AND", "p.id AND e.occurred_at > $2::timestamptz - interval '365 days' AND")} <= 60`],
        ['lapsed 90+ days', { field: 'orders.days_since_last', op: 'gte', value: 90 }, `${since} >= 90`],
        ['first order 300+ days ago', { field: 'orders.days_since_first', op: 'gt', value: 300 }, `(SELECT floor(extract(epoch FROM ($2::timestamptz - min(e.occurred_at))) / 86400) FROM engage.events e WHERE e.profile_id = p.id AND e.name = 'order_completed' AND e.occurred_at <= $2::timestamptz) > 300`],
        ['never ordered, by days_since_last', { field: 'orders.days_since_last', op: 'not_exists' }, `${since} IS NULL`],
        ['granted consent', { field: 'consent.email', op: 'eq', value: 'granted' }, `${status} = 'granted'`],
        ['no consent record', { field: 'consent.email', op: 'not_exists' }, `${status} IS NULL`],
        ['not granted (missing never matches neq)', { field: 'consent.email', op: 'neq', value: 'granted' }, `${status} <> 'granted'`],
        ['win-back: lapsed, consented, in Istanbul', { all: [
          { field: 'orders.count', op: 'gte', value: 1 }, { field: 'orders.days_since_last', op: 'gte', value: 90 },
          { field: 'consent.email', op: 'eq', value: 'granted' }, { field: 'attributes.city', op: 'eq', value: 'İstanbul' }] },
          `${ord} >= 1 AND ${since} >= 90 AND ${status} = 'granted' AND p.attributes->>'city' = 'İstanbul'`],
        ['any of gold or recent buyer', { any: [{ field: 'attributes.tier', op: 'eq', value: 'gold' }, { field: 'orders.count_30d', op: 'gte', value: 1 }] }, `p.attributes->>'tier' = 'gold' OR ${ordIn(30)} >= 1`],
        ['not a gold member', { not: { field: 'attributes.tier', op: 'eq', value: 'gold' } }, `p.attributes->>'tier' IS DISTINCT FROM 'gold'`],
        ['everyone', { field: 'orders.count', op: 'gte', value: 0 }, 'true'],
      ];
      const mismatches: string[] = [];
      let nonZero = 0;
      for (const [label, where, indep] of battery) {
        const want = (await sql(t.org, ev(indep), [t.org, at.toISOString()])).rows[0].n as number;
        const got = await count(t.org, where, at);
        if (want > 0) nonZero++;
        if (got !== want) mismatches.push(`${label}: segment ${got}, SQL ${want}`);
      }
      expect(mismatches).toEqual([]);
      expect(nonZero).toBeGreaterThanOrEqual(battery.length - 2); // the battery is not vacuous
      // Erased customers never count, even though they have orders and consent.
      expect(await count(t.org, { field: 'orders.count', op: 'gte', value: 0 }, at)).toBe(N - N / 6);
    }, 120_000);
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('API', () => {
    const def = { where: { field: 'attributes.tier', op: 'eq', value: 'gold' } };

    it('admins create segments and publish versions, members read and preview, versions are immutable', async () => {
      const t = await tenant();
      for (let i = 0; i < 5; i++) await sql(t.org, `INSERT INTO engage.profiles (organization_id, external_id, attributes) VALUES ($1, $2, $3::jsonb)`, [t.org, `s-${i}`, JSON.stringify({ tier: i < 3 ? 'gold' : 'basic' })]);
      const created = await app.http('/segments', { token: t.admin, body: { key: 'gold', name: 'Gold', definition: def } });
      expect(created.status).toBe(201);
      const id = (created.json.segment as { id: string }).id;
      expect((await app.http('/segments', { token: t.member, body: { key: 'x', name: 'X', definition: def } })).status).toBe(403);
      expect((await app.http('/segments', { token: t.admin, body: { key: 'gold', name: 'Again', definition: def } })).status).toBe(409);
      expect((await app.http('/segments', { token: t.admin, body: { key: 'Bad Key', name: 'X', definition: def } })).status).toBe(400);
      const bad = await app.http('/segments', { token: t.admin, body: { key: 'bad', name: 'Bad', definition: { where: { field: 'orders.revenue', op: 'gt', value: 1 } } } });
      expect(bad.status).toBe(400);
      expect(bad.json.issues).toBeInstanceOf(Array);
      const v2 = await app.http(`/segments/${id}/versions`, { token: t.admin, body: { definition: { where: { field: 'attributes.tier', op: 'eq', value: 'basic' } } } });
      expect(v2).toMatchObject({ status: 201, json: { version: { version: 2 } } });
      expect((await app.http(`/segments/${id}/versions`, { token: t.member, body: { definition: def } })).status).toBe(403);

      expect((await app.http('/segments', { token: t.member })).json.segments).toMatchObject([{ key: 'gold', latestVersion: 2 }]);
      expect((await app.http(`/segments/${id}`, { token: t.member })).json.versions).toHaveLength(2);
      expect((await app.http(`/segments/${id}/versions/1/count`, { token: t.member })).json).toMatchObject({ count: 3 });
      expect((await app.http(`/segments/${id}/versions/2/count`, { token: t.member })).json).toMatchObject({ count: 2 });
      expect((await app.http(`/segments/${id}/versions/9/count`, { token: t.member })).status).toBe(404);
      const prev = await app.http('/segments/preview', { token: t.member, body: { definition: def } });
      expect(prev.json).toMatchObject({ count: 3, sample: expect.any(Array) });
      expect((prev.json.sample as unknown[]).length).toBe(3);
      expect((await app.http('/segments/preview', { token: t.member, body: { definition: { nope: 1 } } })).status).toBe(400);
      expect((await app.http('/segments/not-a-uuid', { token: t.member })).status).toBe(404);

      await expect(sql(t.org, `UPDATE engage.segment_versions SET definition = '{}'::jsonb WHERE segment_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.segment_versions WHERE segment_id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('a tenant sees only its own segments, and counts only its own customers', async () => {
      const a = await tenant();
      const b = await tenant();
      await sql(a.org, `INSERT INTO engage.profiles (organization_id, external_id, attributes) VALUES ($1, 'only-a', '{"tier":"gold"}')`, [a.org]);
      const sa = await app.http('/segments', { token: a.admin, body: { key: 'gold', name: 'Gold', definition: def } });
      const id = (sa.json.segment as { id: string }).id;
      expect((await app.http('/segments', { token: b.admin })).json.segments).toEqual([]);
      expect((await app.http(`/segments/${id}`, { token: b.admin })).status).toBe(404);
      expect((await app.http(`/segments/${id}/versions/1/count`, { token: b.admin })).status).toBe(404);
      expect((await app.http('/segments/preview', { token: b.admin, body: { definition: def } })).json).toMatchObject({ count: 0, sample: [] });
      expect((await app.http('/segments', {})).status).toBe(401);
    });

    it('a journey can pin only a segment version that exists', async () => {
      const t = await tenant();
      await T.createTemplate(t.org, t.userId, { key: 'hello', name: 'Hello', subject: 'Hi', html: '<a href="{{unsubscribe_url}}">x</a>' });
      const journey = (segment: string, version: number) => ({
        trigger: { type: 'segment', segment, segment_version: version, every_days: 7, at_local_time: '10:00' },
        steps: [{ id: 'm', type: 'message', channel: 'email', template: 'hello', purpose: 'marketing' }],
      });
      const r1 = await app.http('/journeys', { token: t.admin, body: { key: 'wb', name: 'Win-back', definition: journey('lapsed', 1) } });
      expect(r1).toMatchObject({ status: 400, json: { issues: [{ path: 'trigger.segment', message: 'no segment "lapsed" version 1' }] } });
      await S.createSegment(t.org, t.userId, { key: 'lapsed', name: 'Lapsed', definition: def });
      expect((await app.http('/journeys', { token: t.admin, body: { key: 'wb', name: 'Win-back', definition: journey('lapsed', 2) } })).status).toBe(400);
      expect((await app.http('/journeys', { token: t.admin, body: { key: 'wb', name: 'Win-back', definition: journey('lapsed', 1) } })).status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('scheduled runs', () => {
    const lapsed = { where: { all: [
      { field: 'orders.count', op: 'gte', value: 1 }, { field: 'orders.days_since_last', op: 'gte', value: 90 },
      { field: 'consent.email', op: 'eq', value: 'granted' },
    ] } };
    const wb = (over: Record<string, unknown> = {}, trig: Record<string, unknown> = {}) => ({
      trigger: { type: 'segment', segment: 'lapsed', segment_version: 1, every_days: 1, at_local_time: '09:00', ...trig },
      holdout_percent: 0, re_entry: 'after_exit', steps: [{ id: 'wait', type: 'delay', minutes: 60 }], ...over,
    });

    /** 60 customers: 20 lapsed with consent (the members), 10 lapsed without consent, 15 recent buyers, 15 never ordered. */
    async function setup(over: Record<string, unknown> = {}, trig: Record<string, unknown> = {}, n = 60): Promise<{ t: Tn; journeyId: string; members: Set<string>; activatedAt: Date }> {
      const t = await tenant();
      const members = new Set<string>();
      const base = Date.now();
      const rows = Array.from({ length: n }, (_, i) => ({ ext: `r-${i}`, kind: i < 20 ? 'member' : i < 30 ? 'noconsent' : i < 45 ? 'recent' : 'never' }));
      await f.admin.query(`INSERT INTO engage.profiles (organization_id, external_id) SELECT $1, x->>'ext' FROM jsonb_array_elements($2::jsonb) x`, [t.org, JSON.stringify(rows)]);
      const pid = new Map((await f.admin.query(`SELECT id, external_id FROM engage.profiles WHERE organization_id = $1`, [t.org])).rows.map((r) => [r.external_id as string, r.id as string]));
      const orders = rows.filter((r) => r.kind !== 'never').map((r) => ({ p: pid.get(r.ext)!, at: new Date(base - (r.kind === 'recent' ? 10 : 150) * DAY).toISOString() }));
      await f.admin.query(`INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
                           SELECT $1, (x->>'p')::uuid, 'ord-' || gen_random_uuid(), 'order_completed', '{"order_id":"o","total":10}'::jsonb, (x->>'at')::timestamptz FROM jsonb_array_elements($2::jsonb) x`, [t.org, JSON.stringify(orders)]);
      const consenting = rows.filter((r) => r.kind !== 'noconsent' && r.kind !== 'never').map((r) => pid.get(r.ext)!);
      await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence) SELECT $1, x::uuid, 'email', 'granted', 'import', '{"f":"s"}'::jsonb FROM unnest($2::text[]) x`, [t.org, consenting]);
      for (const r of rows) if (r.kind === 'member') members.add(pid.get(r.ext)!);
      await S.createSegment(t.org, t.userId, { key: 'lapsed', name: 'Lapsed', definition: lapsed });
      const { journey } = await J.createJourney(t.org, t.userId, { key: `wb-${u()}`, name: 'Win-back', definition: wb(over, trig) });
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      const v = await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
      return { t, journeyId: journey.id, members, activatedAt: new Date(v.activatedAt!) };
    }
    const enrollments = async (t: Tn, journeyId: string) =>
      (await sql(t.org, `SELECT profile_id, status, trigger_kind, trigger_key, entered_at FROM engage.enrollments WHERE journey_id = $1 ORDER BY created_at`, [journeyId])).rows as
        Array<{ profile_id: string; status: string; trigger_kind: string; trigger_key: string; entered_at: Date }>;

    it('the first run is the first scheduled moment after activation, never at once, and only the latest due slot runs', async () => {
      const { t, journeyId, activatedAt } = await setup();
      expect(await R.runSegmentSchedule(t.org, journeyId, activatedAt)).toEqual({ status: 'not_due' });
      expect(await R.runSegmentSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 60_000))).toEqual({ status: 'not_due' });
      const later = new Date(activatedAt.getTime() + 4.5 * DAY);
      const slot = await f.engage.withEngageTenant(t.org, (c) => R.latestDueSlot(c, { everyDays: 1, atLocalTime: '09:00', timezone: 'Europe/Istanbul', activatedAt, now: later }));
      expect(slot).not.toBeNull();
      expect(slot!.getTime()).toBeGreaterThanOrEqual(activatedAt.getTime());
      expect(slot!.getTime()).toBeLessThanOrEqual(later.getTime());
      expect(later.getTime() - slot!.getTime()).toBeLessThan(DAY);
      // 09:00 in the tenant's time zone (Istanbul, UTC+3), whatever the server's own zone is.
      expect(slot!.toISOString().slice(11, 16)).toBe('06:00');
      const run = await R.runSegmentSchedule(t.org, journeyId, later);
      expect(run).toMatchObject({ status: 'done', slot: slot!.toISOString() });
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.segment_runs WHERE journey_id = $1`, [journeyId])).rows[0].n).toBe(1); // the missed days were not made up
    });

    it('the schedule is exact: never before activation, local time of the tenant, every N days from the activation day, DST included', async () => {
      const { t } = await setup();
      const slot = (o: { every: number; at: string; tz: string; act: string; now: string }) => f.engage.withEngageTenant(t.org, (c) =>
        R.latestDueSlot(c, { everyDays: o.every, atLocalTime: o.at, timezone: o.tz, activatedAt: new Date(o.act), now: new Date(o.now) })).then((d) => d?.toISOString() ?? null);
      const ist = { every: 1, at: '09:00', tz: 'Europe/Istanbul', act: '2026-03-10T12:00:00Z' }; // activated at 15:00 local, after that day's 09:00
      expect(await slot({ ...ist, now: '2026-03-10T13:00:00Z' })).toBeNull(); // today's 09:00 already passed before activation
      expect(await slot({ ...ist, now: '2026-03-11T05:59:00Z' })).toBeNull();
      expect(await slot({ ...ist, now: '2026-03-11T06:00:00Z' })).toBe('2026-03-11T06:00:00.000Z');
      expect(await slot({ ...ist, now: '2026-03-12T07:00:00Z' })).toBe('2026-03-12T06:00:00.000Z');
      const early = { ...ist, act: '2026-03-10T03:00:00Z' }; // activated at 06:00 local, before 09:00: the first run is the same day
      expect(await slot({ ...early, now: '2026-03-10T05:59:00Z' })).toBeNull();
      expect(await slot({ ...early, now: '2026-03-10T06:00:00Z' })).toBe('2026-03-10T06:00:00.000Z');
      const every3 = { ...ist, every: 3 };
      expect(await slot({ ...every3, now: '2026-03-12T23:00:00Z' })).toBeNull(); // 03-10's slot was before activation, the next is 03-13
      expect(await slot({ ...every3, now: '2026-03-13T06:00:00Z' })).toBe('2026-03-13T06:00:00.000Z');
      expect(await slot({ ...every3, now: '2026-03-15T06:00:00Z' })).toBe('2026-03-13T06:00:00.000Z');
      expect(await slot({ ...every3, now: '2026-03-16T06:00:00Z' })).toBe('2026-03-16T06:00:00.000Z');
      // New York changes to summer time on 2026-03-08 at 02:00: 09:00 local is 14:00Z before, 13:00Z after.
      const ny = { every: 1, at: '09:00', tz: 'America/New_York', act: '2026-03-07T20:00:00Z' };
      expect(await slot({ ...ny, now: '2026-03-08T12:59:00Z' })).toBeNull();
      expect(await slot({ ...ny, now: '2026-03-08T13:00:00Z' })).toBe('2026-03-08T13:00:00.000Z');
    });

    it('every_days spaces the runs from the activation day', async () => {
      const { t, journeyId, activatedAt } = await setup({}, { every_days: 3 });
      const slots = new Set<number>();
      for (let d = 0; d <= 10; d++) {
        const s = await f.engage.withEngageTenant(t.org, (c) => R.latestDueSlot(c, { everyDays: 3, atLocalTime: '09:00', timezone: 'Europe/Istanbul', activatedAt, now: new Date(activatedAt.getTime() + d * DAY) }));
        if (s) slots.add(s.getTime());
      }
      const sorted = [...slots].sort((a, b) => a - b);
      expect(sorted.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(3 * DAY - 3_600_000);
      expect(journeyId).toBeTruthy();
    });

    it('acceptance: a run enrolls each matching customer once, exactly the members, and the same run again changes nothing', async () => {
      const { t, journeyId, members, activatedAt } = await setup();
      const now = new Date(activatedAt.getTime() + 2 * DAY);
      const first = await R.runSegmentSchedule(t.org, journeyId, now, { chunk: 7 });
      expect(first).toMatchObject({ status: 'done', matched: 20, enrolled: 20, skipped: 0, truncated: false });
      const rows = await enrollments(t, journeyId);
      expect(new Set(rows.map((r) => r.profile_id))).toEqual(members);
      expect(rows).toHaveLength(20);
      const slot = (first as { slot: string }).slot;
      expect(new Set(rows.map((r) => r.trigger_key)).size).toBe(20);
      for (const r of rows) expect(r).toMatchObject({ trigger_kind: 'segment', trigger_key: `segment:${slot}:${r.profile_id}` });
      expect(new Date(rows[0]!.entered_at).toISOString()).toBe((first as { slot: string }).slot);
      // The count the run used is the count the segment gives for that slot.
      expect(await count(t.org, lapsed.where, new Date((first as { slot: string }).slot))).toBe(20);
      expect(await R.runSegmentSchedule(t.org, journeyId, now)).toEqual({ status: 'already_done' });
      expect(await enrollments(t, journeyId)).toHaveLength(20);
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.segment_runs WHERE journey_id = $1`, [journeyId])).rows[0].n).toBe(1);
    });

    it('acceptance: concurrent runs of the same slot act once', async () => {
      const { t, journeyId, members, activatedAt } = await setup();
      const now = new Date(activatedAt.getTime() + 2 * DAY);
      const results = await Promise.all(Array.from({ length: 6 }, () => R.runSegmentSchedule(t.org, journeyId, now, { chunk: 5 })));
      expect(results.filter((r) => r.status === 'done')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'in_progress' || r.status === 'already_done')).toHaveLength(5);
      expect(new Set((await enrollments(t, journeyId)).map((r) => r.profile_id))).toEqual(members);
      expect(await enrollments(t, journeyId)).toHaveLength(20);
    });

    it('an interrupted run resumes where it stopped, with exact counts and no duplicate', async () => {
      const { t, journeyId, members, activatedAt } = await setup();
      const now = new Date(activatedAt.getTime() + 2 * DAY);
      // Make enrolling fail for the 12th member (in id order): chunks of 5 enroll 10, then the third chunk fails.
      const order = (await ids(t.org, lapsed.where, new Date(now.getTime()))).sort();
      expect(order).toHaveLength(20);
      const fn = `engage.test_stop_${u()}`;
      await f.admin.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated crash'; END $$`);
      await f.admin.query(`CREATE TRIGGER test_stop BEFORE INSERT ON engage.enrollments FOR EACH ROW WHEN (NEW.profile_id = '${order[12]}') EXECUTE FUNCTION ${fn}()`);
      try {
        await expect(R.runSegmentSchedule(t.org, journeyId, now, { chunk: 5 })).rejects.toThrow(/simulated crash/);
      } finally {
        await f.admin.query('DROP TRIGGER test_stop ON engage.enrollments');
        await f.admin.query(`DROP FUNCTION ${fn}()`);
      }
      expect(await enrollments(t, journeyId)).toHaveLength(10);
      const half = (await sql(t.org, `SELECT status, matched, enrolled, last_profile_id FROM engage.segment_runs WHERE journey_id = $1`, [journeyId])).rows[0];
      expect(half).toMatchObject({ status: 'running', matched: 10, enrolled: 10, last_profile_id: order[9] });
      // A fresh claim is not taken over; a stale one is.
      expect(await R.runSegmentSchedule(t.org, journeyId, now, { chunk: 5 })).toEqual({ status: 'in_progress' });
      await f.admin.query(`UPDATE engage.segment_runs SET claimed_at = now() - interval '1 hour' WHERE journey_id = $1`, [journeyId]);
      expect(await R.runSegmentSchedule(t.org, journeyId, now, { chunk: 5 })).toMatchObject({ status: 'done', matched: 20, enrolled: 20, skipped: 0 });
      expect(new Set((await enrollments(t, journeyId)).map((r) => r.profile_id))).toEqual(members);
      expect(await enrollments(t, journeyId)).toHaveLength(20);
    });

    it('the next run enrolls again after the first ended (re-entry after_exit), but never twice while one is running, and not at all with re-entry never', async () => {
      const again = await setup();
      const t1 = new Date(again.activatedAt.getTime() + 2 * DAY);
      await R.runSegmentSchedule(again.t.org, again.journeyId, t1);
      // The next day's slot while the first enrollments are still running: nobody is enrolled twice.
      const t2 = new Date(t1.getTime() + 1 * DAY);
      expect(await R.runSegmentSchedule(again.t.org, again.journeyId, t2)).toMatchObject({ status: 'done', matched: 20, enrolled: 0, skipped: 20 });
      // Let the first enrollments finish, then the third day enrolls them again.
      await E.runTenantTick(again.t.org, new Date(t2.getTime() + 2 * 3600_000));
      expect((await enrollments(again.t, again.journeyId)).every((r) => r.status === 'completed')).toBe(true);
      const t3 = new Date(t2.getTime() + 1 * DAY);
      expect(await R.runSegmentSchedule(again.t.org, again.journeyId, t3)).toMatchObject({ status: 'done', matched: 20, enrolled: 20, skipped: 0 });
      expect(await enrollments(again.t, again.journeyId)).toHaveLength(40);
      expect((await sql(again.t.org, `SELECT count(DISTINCT entered_at)::int AS n FROM engage.enrollments WHERE journey_id = $1`, [again.journeyId])).rows[0].n).toBe(2); // two runs, two slots

      const never = await setup({ re_entry: 'never' });
      const n1 = new Date(never.activatedAt.getTime() + 2 * DAY);
      await R.runSegmentSchedule(never.t.org, never.journeyId, n1);
      await E.runTenantTick(never.t.org, new Date(n1.getTime() + 2 * 3600_000));
      expect(await R.runSegmentSchedule(never.t.org, never.journeyId, new Date(n1.getTime() + 2 * DAY))).toMatchObject({ status: 'done', matched: 20, enrolled: 0, skipped: 20 });
    }, 60_000);

    it('a journey stopped in the middle of a run ends the run where it is; nothing more is enrolled', async () => {
      const { t, journeyId, activatedAt } = await setup();
      let stopped = false;
      const out = await R.runSegmentSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 2 * DAY), {
        chunk: 5, onChunk: async () => { if (!stopped) { stopped = true; await J.deactivateJourney(t.org, t.userId, journeyId); } },
      });
      expect(out).toMatchObject({ status: 'failed', matched: 5, enrolled: 5, error: 'journey_version_changed' });
      expect(await enrollments(t, journeyId)).toHaveLength(5);
      expect((await sql(t.org, `SELECT status, error_code FROM engage.segment_runs WHERE journey_id = $1`, [journeyId])).rows[0]).toMatchObject({ status: 'failed', error_code: 'journey_version_changed' });
    });

    it('a run stops at the cap and says so only when more customers matched', async () => {
      const exact = await setup();
      expect(await R.runSegmentSchedule(exact.t.org, exact.journeyId, new Date(exact.activatedAt.getTime() + 2 * DAY), { chunk: 4, maxRun: 20 }))
        .toMatchObject({ status: 'done', matched: 20, enrolled: 20, truncated: false });
      const capped = await setup();
      expect(await R.runSegmentSchedule(capped.t.org, capped.journeyId, new Date(capped.activatedAt.getTime() + 2 * DAY), { chunk: 4, maxRun: 10 }))
        .toMatchObject({ status: 'done', matched: 10, enrolled: 10, truncated: true });
      expect(await enrollments(capped.t, capped.journeyId)).toHaveLength(10);
    });

    it('a retired or stopped journey runs nothing, and an event-triggered journey is not a segment run', async () => {
      const { t, journeyId, activatedAt } = await setup();
      await J.deactivateJourney(t.org, t.userId, journeyId);
      expect(await R.runSegmentSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 2 * DAY))).toEqual({ status: 'not_segment' });
      const ev = await J.createJourney(t.org, t.userId, { key: 'ev', name: 'Ev', definition: { trigger: { type: 'event', event: 'cart_updated' }, steps: [{ id: 'x', type: 'exit' }] } });
      await J.approveJourneyVersion(t.org, t.userId, ev.journey.id, 1);
      await J.activateJourneyVersion(t.org, t.userId, ev.journey.id, 1);
      expect(await R.runSegmentSchedule(t.org, ev.journey.id, new Date(Date.now() + 5 * DAY))).toEqual({ status: 'not_segment' });
    });

    it('the tick runs due segment runs for the tenants it is given, and no other', async () => {
      const a = await setup();
      const b = await setup();
      const now = new Date(a.activatedAt.getTime() + 2 * DAY);
      const out = await E.runJourneyTick({ now: () => now, onlyOrganizations: [a.t.org] });
      expect(out.segmentRuns).toBe(1);
      expect(await enrollments(a.t, a.journeyId)).toHaveLength(20);
      expect(await enrollments(b.t, b.journeyId)).toHaveLength(0);
      // The tenant tick (tools, demos) does the same for its own tenant.
      const tt = await E.runTenantTick(b.t.org, now);
      expect(tt.segmentRuns).toBe(1);
      expect(await enrollments(b.t, b.journeyId)).toHaveLength(20);
    });

    it('the runs are listed for the journey, newest first, to tenant users only', async () => {
      const { t, journeyId, activatedAt } = await setup();
      await R.runSegmentSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 2 * DAY));
      await R.runSegmentSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 3 * DAY));
      const r = await app.http(`/journeys/${journeyId}/segment-runs`, { token: t.member });
      expect(r.status).toBe(200);
      const runs = r.json.runs as Array<{ slot: string; status: string; matched: number }>;
      expect(runs).toHaveLength(2);
      expect(runs[0]!.slot > runs[1]!.slot).toBe(true);
      expect(runs[0]).toMatchObject({ status: 'done', matched: 20 });
      expect((await app.http(`/journeys/${journeyId}/segment-runs`, {})).status).toBe(401);
      expect((await app.http(`/journeys/${journeyId}/segment-runs`, { token: (await tenant()).member })).status).toBe(404);
    });

    it('the segment-triggered journey is a real journey: members get the message, others nothing', async () => {
      const t = await tenant();
      const org = t.org;
      await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
      await creds.createAccount(org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
      await T.createTemplate(org, t.userId, { key: 'winback', name: 'Win-back', subject: 'Sizi özledik', html: '<p>Merhaba</p><a href="{{unsubscribe_url}}">Abonelikten çık</a>' });
      const base = Date.now();
      await f.admin.query(`INSERT INTO engage.profiles (organization_id, external_id) SELECT $1, 'm-' || g FROM generate_series(1, 6) g`, [org]);
      const pids = (await f.admin.query(`SELECT id, external_id FROM engage.profiles WHERE organization_id = $1 ORDER BY external_id`, [org])).rows as Array<{ id: string; external_id: string }>;
      // m-1..m-3 lapsed with consent; m-4 lapsed without consent record; m-5 recent; m-6 never.
      await f.admin.query(`INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
                           SELECT $1, id, 'o-' || id, 'order_completed', '{"order_id":"x","total":5}'::jsonb, $2::timestamptz FROM engage.profiles WHERE organization_id = $1 AND external_id IN ('m-1','m-2','m-3','m-4')`, [org, new Date(base - 200 * DAY).toISOString()]);
      await f.admin.query(`INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
                           SELECT $1, id, 'o-' || id, 'order_completed', '{"order_id":"y","total":5}'::jsonb, $2::timestamptz FROM engage.profiles WHERE organization_id = $1 AND external_id = 'm-5'`, [org, new Date(base - 5 * DAY).toISOString()]);
      await f.admin.query(`INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence)
                           SELECT $1, id, 'email', 'granted', 'import', '{"f":"s"}'::jsonb FROM engage.profiles WHERE organization_id = $1 AND external_id IN ('m-1','m-2','m-3','m-5')`, [org]);
      await S.createSegment(org, t.userId, { key: 'lapsed', name: 'Lapsed', definition: lapsed });
      const { journey } = await J.createJourney(org, t.userId, { key: 'winback', name: 'Win-back', definition: {
        trigger: { type: 'segment', segment: 'lapsed', segment_version: 1, every_days: 7, at_local_time: '10:00' }, holdout_percent: 0,
        steps: [{ id: 'mail', type: 'message', channel: 'email', template: 'winback', purpose: 'marketing' }],
      } });
      await J.approveJourneyVersion(org, t.userId, journey.id, 1);
      const v = await J.activateJourneyVersion(org, t.userId, journey.id, 1);
      const now = new Date(new Date(v.activatedAt!).getTime() + 8 * DAY);
      const tick = await E.runTenantTick(org, now);
      expect(tick).toMatchObject({ segmentRuns: 1, enrolled: 3 });
      const msgs = (await sql(org, `SELECT p.external_id FROM engage.messages m JOIN engage.profiles p ON p.id = m.profile_id ORDER BY p.external_id`)).rows.map((r) => r.external_id);
      expect(msgs).toEqual(['m-1', 'm-2', 'm-3']);
      expect(pids).toHaveLength(6);
    });
  });

  describe('database guards', () => {
    it('a finished run cannot change, its counts add up, and nothing is deleted', async () => {
      const t = await tenant();
      await S.createSegment(t.org, t.userId, { key: 'x', name: 'X', definition: { where: { field: 'orders.count', op: 'gte', value: 0 } } });
      const { journey } = await J.createJourney(t.org, t.userId, { key: 'j', name: 'J', definition: {
        trigger: { type: 'segment', segment: 'x', segment_version: 1, every_days: 1, at_local_time: '09:00' }, steps: [{ id: 'e', type: 'exit' }] } });
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      const v = await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
      const run = await R.runSegmentSchedule(t.org, journey.id, new Date(new Date(v.activatedAt!).getTime() + 2 * DAY));
      expect(run.status).toBe('done');
      const id = (run as { runId: string }).runId;
      await expect(sql(t.org, `UPDATE engage.segment_runs SET matched = 5, enrolled = 5 WHERE id = $1`, [id])).rejects.toThrow(/finished segment run cannot change/);
      await expect(sql(t.org, `UPDATE engage.segment_runs SET slot_at = now() WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.segment_runs WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(f.admin.query(`UPDATE engage.segment_runs SET status = 'running', finished_at = NULL WHERE id = $1`, [id])).rejects.toThrow(/finished segment run cannot change/);
      await expect(f.admin.query(`INSERT INTO engage.segment_runs (organization_id, journey_id, journey_version_id, segment_version_id, slot_at, matched, enrolled, skipped)
                                  SELECT organization_id, journey_id, journey_version_id, segment_version_id, slot_at + interval '1 day', 3, 1, 1 FROM engage.segment_runs WHERE id = $1`, [id]))
        .rejects.toThrow(/segment_runs_check/);
    });

    it('the scheduler work list returns ids only, and only for active segment-triggered journeys', async () => {
      const t = await tenant();
      await S.createSegment(t.org, t.userId, { key: 'x', name: 'X', definition: { where: { field: 'orders.count', op: 'gte', value: 0 } } });
      const { journey } = await J.createJourney(t.org, t.userId, { key: 'j', name: 'J', definition: {
        trigger: { type: 'segment', segment: 'x', segment_version: 1, every_days: 1, at_local_time: '09:00' }, steps: [{ id: 'e', type: 'exit' }] } });
      const list = () => f.engage.withEngageScheduler(async (s) => (await s.query('SELECT * FROM engage.due_segment_work($1::uuid[])', [[t.org]])));
      expect((await list()).rows).toEqual([]); // a draft is not active
      await J.approveJourneyVersion(t.org, t.userId, journey.id, 1);
      await J.activateJourneyVersion(t.org, t.userId, journey.id, 1);
      const r = await list();
      expect(r.fields.map((x) => x.name)).toEqual(['organization_id', 'journey_id']);
      expect(r.rows).toEqual([{ organization_id: t.org, journey_id: journey.id }]);
      await J.deactivateJourney(t.org, t.userId, journey.id);
      expect((await list()).rows).toEqual([]);
    });
  });
});
