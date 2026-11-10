/**
 * Journey results (WP-21) on real Postgres and the real HTTP stack. Acceptance: the numbers reconcile with the ledger:
 * an independent computation in this file (reading the enrollments, the orders and their timestamps one by one) gives
 * the same counts, conversions and revenue as the query, for several window lengths and for boundary timestamps.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import type { JourneyResults } from '../../engage/analytics/journeyAnalytics.js';

const HOUR = 3600_000;

describe.skipIf(!adminUrl)('journey results (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let P: typeof import('../../engage/profiles.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let A: typeof import('../../engage/analytics/journeyAnalytics.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    P = await import('../../engage/profiles.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    A = await import('../../engage/analytics/journeyAnalytics.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  /** A journey with a 50% holdout, and N customers who entered it at `enteredAt`, each with random orders around it. */
  async function setup(n: number, enteredAt: Date, orderRange: [number, number] = [-2, 80]) {
    const t = await f.provisionTenant(`Res ${u()}`);
    const org = t.organization.id;
    const key = `res-${u()}`;
    const { journey } = await J.createJourney(org, t.admin.userId, { key, name: 'Results', definition: {
      trigger: { type: 'api' }, holdout_percent: 50, steps: [{ id: 'wait', type: 'delay', minutes: 5 }] } });
    await J.approveJourneyVersion(org, t.admin.userId, journey.id, 1);
    await J.activateJourneyVersion(org, t.admin.userId, journey.id, 1);
    const profiles: Array<{ id: string; ext: string }> = [];
    for (let i = 0; i < n; i++) {
      const ext = `r-${u()}-${i}`;
      const p = await P.upsertProfile(org, { externalId: ext });
      profiles.push({ id: p.id, ext });
      await E.triggerApiJourney(org, key, { externalId: ext, idempotencyKey: `k-${i}`, payload: {} }, enteredAt);
    }
    // The 5-minute delay of the journey has run for everyone by an hour after entry, so some enrollments are completed.
    await E.runTenantTick(org, new Date(enteredAt.getTime() + HOUR));
    // Random orders around the entry moment, in hours; some totals are unreadable and count as 0 revenue.
    const totals = ['129.90', '50', '12.5', 'n/a', '1000000000000', '7.123456789'];
    const rows: Array<{ p: string; at: string; total: string }> = [];
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const p of profiles) {
      const count = Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const hours = orderRange[0] + rnd() * (orderRange[1] - orderRange[0]);
        rows.push({ p: p.id, at: new Date(enteredAt.getTime() + hours * HOUR).toISOString(), total: totals[Math.floor(rnd() * totals.length)]! });
      }
    }
    // Boundary orders for the first customers, exactly at the edges: before entry (not counted), at entry (counted),
    // exactly at the window's end (counted), one second after it (not counted).
    for (const p of profiles.slice(0, 4)) {
      const edges = [-0.5, 0, 24, 72, 72 + 1 / 3600];
      for (const h of edges) rows.push({ p: p.id, at: new Date(enteredAt.getTime() + h * HOUR).toISOString(), total: '10' });
    }
    if (rows.length) {
      await f.admin.query(
        `INSERT INTO engage.events (organization_id, profile_id, client_event_id, name, properties, occurred_at)
         SELECT $1, (x->>'p')::uuid, 'ord-' || gen_random_uuid(), 'order_completed', jsonb_build_object('order_id', gen_random_uuid()::text, 'total', x->>'total'), (x->>'at')::timestamptz
           FROM jsonb_array_elements($2::jsonb) x`, [org, JSON.stringify(rows)]);
    }
    return { t: { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(t.admin.authUserId, org) }, journeyId: journey.id, rows };
  }

  /** The numbers, computed one enrollment at a time from the raw rows (no SQL aggregation). */
  async function independent(org: string, journeyId: string, windowHours: number, asOf: Date) {
    const enr = (await f.admin.query(`SELECT id, profile_id, cohort, entered_at FROM engage.enrollments WHERE organization_id = $1 AND journey_id = $2`, [org, journeyId])).rows as
      Array<{ id: string; profile_id: string; cohort: string; entered_at: Date }>;
    const orders = (await f.admin.query(`SELECT profile_id, occurred_at, properties FROM engage.events WHERE organization_id = $1 AND name = 'order_completed'`, [org])).rows as
      Array<{ profile_id: string; occurred_at: Date; properties: Record<string, unknown> }>;
    const byProfile = new Map<string, typeof orders>();
    for (const o of orders) byProfile.set(o.profile_id, [...(byProfile.get(o.profile_id) ?? []), o]);
    const out = { treatment: { n: 0, converted: 0, revenue: 0 }, holdout: { n: 0, converted: 0, revenue: 0 } };
    for (const e of enr) {
      const end = new Date(e.entered_at).getTime() + windowHours * HOUR;
      if (end > asOf.getTime()) continue; // still inside its window
      const inWindow = (byProfile.get(e.profile_id) ?? []).filter((o) => {
        const at = new Date(o.occurred_at).getTime();
        return at >= new Date(e.entered_at).getTime() && at <= end && at <= asOf.getTime();
      });
      const g = out[e.cohort as 'treatment' | 'holdout'];
      g.n++;
      if (inWindow.length > 0) g.converted++;
      for (const o of inWindow) {
        const t = String(o.properties.total ?? '');
        if (/^[0-9]{1,12}(\.[0-9]{1,6})?$/.test(t)) g.revenue += Number(t);
      }
    }
    return out;
  }

  it('acceptance: the results reconcile with the raw rows, for 24, 72 and 168 hours', async () => {
    const entered = new Date(Date.now() - 10 * 24 * HOUR);
    const { t, journeyId } = await setup(60, entered);
    const asOf = new Date();
    for (const windowHours of [24, 72, 168]) {
      const got = await A.journeyResults(t.org, journeyId, { windowHours, now: asOf });
      const want = await independent(t.org, journeyId, windowHours, asOf);
      expect(got.conversion.treatment.n).toBe(want.treatment.n);
      expect(got.conversion.treatment.converted).toBe(want.treatment.converted);
      expect(got.conversion.holdout.n).toBe(want.holdout.n);
      expect(got.conversion.holdout.converted).toBe(want.holdout.converted);
      expect(got.conversion.treatment.revenue).toBeCloseTo(want.treatment.revenue, 2);
      expect(got.conversion.holdout.revenue).toBeCloseTo(want.holdout.revenue, 2);
      expect(got.enrollments.treatment.mature).toBe(want.treatment.n);
      expect(got.enrollments.holdout.mature).toBe(want.holdout.n);
      expect(got.conversion.uplift.treatmentRate).toBeCloseTo(want.treatment.converted / want.treatment.n, 10);
      expect(got.conversion.uplift.holdoutRate).toBeCloseTo(want.holdout.converted / want.holdout.n, 10);
      expect(got.conversion.revenueDifferencePerCustomer).toBeCloseTo(want.treatment.revenue / want.treatment.n - want.holdout.revenue / want.holdout.n, 2);
      // Statuses come from the ledger, not from anything computed here.
      const byStatus = (await f.admin.query(`SELECT cohort, status, count(*)::int AS n FROM engage.enrollments WHERE organization_id = $1 AND journey_id = $2 GROUP BY 1, 2`, [t.org, journeyId])).rows as Array<{ cohort: string; status: string; n: number }>;
      const n = (cohort: string, status: string) => byStatus.find((r) => r.cohort === cohort && r.status === status)?.n ?? 0;
      expect(got.enrollments.treatment.completed).toBe(n('treatment', 'completed'));
      expect(got.enrollments.holdout.completed).toBe(n('holdout', 'completed'));
      expect(got.enrollments.treatment.entered).toBe(n('treatment', 'active') + n('treatment', 'completed') + n('treatment', 'exited') + n('treatment', 'failed'));
    }
    // The window matters: a longer one converts at least as many customers.
    const short = await A.journeyResults(t.org, journeyId, { windowHours: 24, now: asOf });
    const long = await A.journeyResults(t.org, journeyId, { windowHours: 168, now: asOf });
    expect(long.conversion.treatment.converted).toBeGreaterThanOrEqual(short.conversion.treatment.converted);
    expect(long.conversion.treatment.converted).toBeGreaterThan(short.conversion.treatment.converted);
  }, 120_000);

  it('counts only mature customers: nobody still inside the window is in the rates', async () => {
    const recent = new Date(Date.now() - 2 * HOUR);
    const { t, journeyId } = await setup(30, recent, [0, 1]);
    const r = await A.journeyResults(t.org, journeyId, { windowHours: 72, now: new Date() });
    expect(r.enrollments.treatment.entered + r.enrollments.holdout.entered).toBe(30);
    expect(r.enrollments.treatment.mature + r.enrollments.holdout.mature).toBe(0);
    expect(r.conversion.treatment.n + r.conversion.holdout.n).toBe(0);
    expect(r.conversion.uplift.difference).toBeNull();
  });

  it('an order after the evaluation moment is not counted, and orders before entry are not either', async () => {
    const entered = new Date(Date.now() - 10 * 24 * HOUR);
    const { t, journeyId, rows } = await setup(20, entered, [-30, 90]);
    const asOf = new Date(entered.getTime() + 500 * HOUR); // every window has ended by then
    const got = await A.journeyResults(t.org, journeyId, { windowHours: 72, now: asOf });
    const want = await independent(t.org, journeyId, 72, asOf);
    expect(got.conversion.treatment.converted + got.conversion.holdout.converted).toBe(want.treatment.converted + want.holdout.converted);
    expect(rows.some((x) => new Date(x.at).getTime() < entered.getTime())).toBe(true);
    // An asOf in the middle of the data: orders after it are invisible to the results.
    const mid = new Date(entered.getTime() + 20 * HOUR);
    const early = await A.journeyResults(t.org, journeyId, { windowHours: 72, now: mid });
    const earlyWant = await independent(t.org, journeyId, 72, mid);
    expect(early.conversion.treatment.converted).toBe(earlyWant.treatment.converted);
  });

  it('a window outside 1 to 168 hours is refused, and an unknown journey is not found', async () => {
    const { t, journeyId } = await setup(2, new Date(Date.now() - 10 * 24 * HOUR));
    await expect(A.journeyResults(t.org, journeyId, { windowHours: 0 })).rejects.toThrow(/windowHours/);
    await expect(A.journeyResults(t.org, journeyId, { windowHours: 169 })).rejects.toThrow(/windowHours/);
    await expect(A.journeyResults(t.org, journeyId, { windowHours: 1.5 })).rejects.toThrow(/windowHours/);
    await expect(A.journeyResults(t.org, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/not found/i);
  });

  it('the HTTP results are the same numbers, and a tenant cannot read another tenant\'s journey', async () => {
    const entered = new Date(Date.now() - 10 * 24 * HOUR);
    const { t, journeyId } = await setup(12, entered);
    const r = await app.http(`/journeys/${journeyId}/analytics?windowHours=72`, { token: t.member });
    expect(r.status).toBe(200);
    const body = r.json as unknown as JourneyResults;
    const direct = await A.journeyResults(t.org, journeyId, { windowHours: 72 });
    expect(body.conversion.treatment.converted).toBe(direct.conversion.treatment.converted);
    expect(body.windowHours).toBe(72);
    expect((await app.http(`/journeys/${journeyId}/analytics?windowHours=500`, { token: t.member })).status).toBe(400);
    expect((await app.http(`/journeys/${journeyId}/analytics`, {})).status).toBe(401);
    const other = await setup(1, entered);
    expect((await app.http(`/journeys/${journeyId}/analytics`, { token: other.t.member })).status).toBe(404);
  }, 60_000);
});
