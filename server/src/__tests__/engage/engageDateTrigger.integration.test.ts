/**
 * The date-attribute trigger (migration 133, WP-25, ADR-021) on real Postgres and the real HTTP stack.
 * Acceptance: a journey on a date attribute fires once per occurrence. Over a whole year of daily runs every customer
 * with a valid date is enrolled exactly once, on the right day; garbage values, erased customers and customers without
 * the attribute never are; the same day run twice or by two workers enrolls no one twice; the next year's occasion
 * enrolls again; 29 February is celebrated on 28 February in a year without one; a missed day is not made up.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageDateTrigger.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const DAY = 86_400_000;
/** A moment in Istanbul (UTC+3 all year, the tenants' default zone), from a local date and time. */
const istanbul = (date: string, time = '10:00') => new Date(`${date}T${time}:00+03:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

describe.skipIf(!adminUrl)('date-attribute trigger (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let D: typeof import('../../engage/journeys/dateTrigger.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let E: typeof import('../../engage/journeys/engine.js');
  let O: typeof import('../../engage/journeys/occasionReminder.js');
  let creds: typeof import('../../engage/credentials.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Date ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }
  /** Customers with a value for the attribute (a string, a number, null ...) as given; `erased` marks them erased. */
  async function customers(t: Tn, rows: Array<{ ext: string; value?: unknown; attr?: string; erased?: boolean }>) {
    await f.admin.query(
      `INSERT INTO engage.profiles (organization_id, external_id, attributes) SELECT $1, x->>'ext', CASE WHEN x ? 'value' THEN jsonb_build_object(COALESCE(x->>'attr', 'anniversary_date'), x->'value') ELSE '{}'::jsonb END FROM jsonb_array_elements($2::jsonb) x`,
      [t.org, JSON.stringify(rows)]);
    const erased = rows.filter((r) => r.erased).map((r) => r.ext);
    if (erased.length) await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE organization_id = $1 AND external_id = ANY ($2)`, [t.org, erased]);
  }
  async function journey(t: Tn, o: { attribute?: string; offset?: number; time?: string; steps?: unknown[]; holdout?: number; reEntry?: string } = {}) {
    const { journey: j } = await J.createJourney(t.org, t.userId, {
      key: `d-${u()}`, name: 'Date',
      definition: {
        trigger: { type: 'date_attribute', attribute: o.attribute ?? 'anniversary_date', offset_days: o.offset ?? 0, at_local_time: o.time ?? '09:30' },
        re_entry: o.reEntry ?? 'after_exit', holdout_percent: o.holdout ?? 0, steps: o.steps ?? [{ id: 'done', type: 'exit' }],
      },
    });
    await J.approveJourneyVersion(t.org, t.userId, j.id, 1);
    const v = await J.activateJourneyVersion(t.org, t.userId, j.id, 1);
    return { journeyId: j.id, activatedAt: new Date(v.activatedAt!) };
  }
  const enrollments = async (t: Tn, journeyId: string) =>
    (await sql(t.org, `SELECT p.external_id AS ext, e.trigger_kind, e.trigger_key, e.payload, e.status FROM engage.enrollments e JOIN engage.profiles p ON p.id = e.profile_id
                        WHERE e.journey_id = $1 ORDER BY p.external_id, e.entered_at`, [journeyId])).rows as Array<{ ext: string; trigger_kind: string; trigger_key: string; payload: Record<string, string>; status: string }>;
  const exts = async (t: Tn, journeyId: string) => (await enrollments(t, journeyId)).map((e) => e.ext).sort();

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    D = await import('../../engage/journeys/dateTrigger.js');
    J = await import('../../engage/journeys/journeys.js');
    E = await import('../../engage/journeys/engine.js');
    O = await import('../../engage/journeys/occasionReminder.js');
    creds = await import('../../engage/credentials.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('fires once per occurrence', () => {
    it('over a whole year of daily runs every customer with a date is enrolled exactly once, on the right day, and next year again', async () => {
      const t = await tenant();
      // 60 customers whose dates are spread over 2001, with different recorded years; none is on 29 February.
      const spread = Array.from({ length: 60 }, (_, i) => {
        const day = isoDay(Date.UTC(2001, 0, 1) + i * 6 * DAY);
        return { ext: `s-${pad(i)}`, value: `${1940 + i}${day.slice(4)}`, month_day: day.slice(5) };
      });
      const specials = [
        { ext: 'leap-plain', value: '1996-02-29' },
        { ext: 'leap-iso', value: '2000-02-29T08:00:00Z' },
        { ext: 'feb28', value: '1990-02-28' },
        { ext: 'jan15', value: '1995-01-15' },
      ];
      const ignored = [
        { ext: 'x-empty', value: '' }, { ext: 'x-text', value: 'not a date' }, { ext: 'x-month13', value: '2023-13-45' }, { ext: 'x-slashes', value: '12/03/2020' },
        { ext: 'x-compact', value: '20231203' }, { ext: 'x-number', value: 20231203 }, { ext: 'x-null', value: null }, { ext: 'x-array', value: ['2023-12-03'] },
        { ext: 'x-padded', value: ' 2020-05-05' }, { ext: 'x-short', value: '2020-5-5' }, { ext: 'x-object', value: { d: '2020-05-05' } },
        { ext: 'x-none' }, { ext: 'x-other-attr', value: '2020-05-05', attr: 'birth_date' },
        { ext: 'x-erased', value: '2020-05-05', erased: true },
      ];
      await customers(t, [...spread.map(({ ext, value }) => ({ ext, value })), ...specials, ...ignored]);
      const { journeyId } = await journey(t);

      for (let day = Date.UTC(2027, 0, 1); day <= Date.UTC(2027, 11, 31); day += DAY) await E.runTenantTick(t.org, istanbul(isoDay(day)));

      const all = await enrollments(t, journeyId);
      const byExt = new Map<string, typeof all>();
      for (const e of all) byExt.set(e.ext, [...(byExt.get(e.ext) ?? []), e]);
      for (const s of spread) {
        const mine = byExt.get(s.ext) ?? [];
        expect(mine, s.ext).toHaveLength(1);
        expect(mine[0]!.payload.occasion_date, s.ext).toBe(`2027-${s.month_day}`);
        expect(mine[0]).toMatchObject({ trigger_kind: 'date', status: 'completed' });
        expect(mine[0]!.trigger_key).toBe(`date:2027-${s.month_day}:${(await sql(t.org, `SELECT id FROM engage.profiles WHERE external_id = $1`, [s.ext])).rows[0]!.id}`);
      }
      // 29 February is celebrated on 28 February in 2027, by both spellings of the date.
      expect(byExt.get('leap-plain')!.map((e) => e.payload.occasion_date)).toEqual(['2027-02-28']);
      expect(byExt.get('leap-iso')!.map((e) => e.payload.occasion_date)).toEqual(['2027-02-28']);
      expect(byExt.get('feb28')!.map((e) => e.payload.occasion_date)).toEqual(['2027-02-28']);
      expect(byExt.get('jan15')!.map((e) => e.payload.occasion_date)).toEqual(['2027-01-15']);
      // Nothing else: garbage, other attributes, no attribute, erased.
      expect([...byExt.keys()].filter((k) => k.startsWith('x-'))).toEqual([]);
      expect(all).toHaveLength(spread.length + specials.length);
      // 365 days, 365 runs, each done, and the counts add up.
      const runs = (await sql(t.org, `SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'done')::int AS done, sum(enrolled)::int AS enrolled, sum(skipped)::int AS skipped FROM engage.date_runs WHERE journey_id = $1`, [journeyId])).rows[0];
      expect(runs).toEqual({ n: 365, done: 365, enrolled: spread.length + specials.length, skipped: 0 });

      // The next year's occasion is a new occurrence: the same customers enter again, and the leap day waits for 29 February 2028.
      await E.runTenantTick(t.org, istanbul('2028-01-15'));
      await E.runTenantTick(t.org, istanbul('2028-02-28'));
      const afterFeb28 = await enrollments(t, journeyId);
      const dates = (ext: string) => afterFeb28.filter((e) => e.ext === ext).map((e) => e.payload.occasion_date);
      expect(dates('jan15')).toEqual(['2027-01-15', '2028-01-15']);
      expect(dates('feb28')).toEqual(['2027-02-28', '2028-02-28']);
      expect(dates('leap-plain')).toEqual(['2027-02-28']); // 2028 has a 29 February: not on the 28th
      await E.runTenantTick(t.org, istanbul('2028-02-29'));
      const afterLeap = await enrollments(t, journeyId);
      expect(afterLeap.filter((e) => e.ext === 'leap-plain').map((e) => e.payload.occasion_date)).toEqual(['2027-02-28', '2028-02-29']);
      expect(afterLeap.filter((e) => e.ext === 'leap-iso').map((e) => e.payload.occasion_date)).toEqual(['2027-02-28', '2028-02-29']);
      expect(afterLeap.filter((e) => e.ext === 'feb28')).toHaveLength(2);
    }, 180_000);

    it('the same day run again, or by two workers at once, enrolls no one twice', async () => {
      const t = await tenant();
      await customers(t, Array.from({ length: 12 }, (_, i) => ({ ext: `c-${pad(i)}`, value: `198${i % 10}-03-10` })));
      const { journeyId } = await journey(t);
      const now = istanbul('2027-03-10');
      const [a, b] = await Promise.all([D.runDateSchedule(t.org, journeyId, now, { chunk: 3 }), D.runDateSchedule(t.org, journeyId, now, { chunk: 3 })]);
      expect([a.status, b.status].sort()).toEqual(expect.arrayContaining(['done']));
      expect([a.status, b.status].filter((s) => s === 'done')).toHaveLength(1);
      expect(await D.runDateSchedule(t.org, journeyId, now)).toEqual({ status: 'already_done' });
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10', '23:00'))).toEqual({ status: 'already_done' }); // same local day
      const all = await enrollments(t, journeyId);
      expect(all).toHaveLength(12);
      expect(new Set(all.map((e) => e.trigger_key)).size).toBe(12);
      expect((await sql(t.org, `SELECT matched, enrolled, skipped FROM engage.date_runs WHERE journey_id = $1`, [journeyId])).rows).toEqual([{ matched: 12, enrolled: 12, skipped: 0 }]);
    });

    it('a run that stopped is taken over after the lease, and a fresh claim is left alone', async () => {
      const t = await tenant();
      await customers(t, Array.from({ length: 6 }, (_, i) => ({ ext: `c-${i}`, value: '1980-03-10' })));
      const { journeyId } = await journey(t);
      const now = istanbul('2027-03-10');
      // A worker claimed the day and died before enrolling anyone.
      await sql(t.org, `INSERT INTO engage.date_runs (organization_id, journey_id, journey_version_id, slot_date, slot_at, occurrence_date)
                        SELECT $1, $2, v.id, '2027-03-10', $3, '2027-03-10' FROM engage.journey_versions v WHERE v.journey_id = $2`, [t.org, journeyId, istanbul('2027-03-10', '09:30')]);
      expect(await D.runDateSchedule(t.org, journeyId, now)).toEqual({ status: 'in_progress' });
      await f.admin.query(`UPDATE engage.date_runs SET claimed_at = now() - interval '11 minutes' WHERE journey_id = $1`, [journeyId]);
      expect(await D.runDateSchedule(t.org, journeyId, now, { chunk: 2 })).toMatchObject({ status: 'done', matched: 6, enrolled: 6 });
      expect(await enrollments(t, journeyId)).toHaveLength(6);
    });

    it('a customer still in the journey is skipped, not enrolled twice', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'slow', value: '1980-03-10' }]);
      const { journeyId } = await journey(t, { steps: [{ id: 'wait', type: 'delay', minutes: 525_600 }, { id: 'done', type: 'exit' }] });
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10'))).toMatchObject({ status: 'done', enrolled: 1, skipped: 0 });
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2028-03-10'))).toMatchObject({ status: 'done', matched: 1, enrolled: 0, skipped: 1 });
      expect(await enrollments(t, journeyId)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('when it fires', () => {
    it('a negative offset fires before the occasion, zero on it, a positive one after it', async () => {
      const t = await tenant();
      await customers(t, [
        { ext: 'on-17', value: '1980-03-17' }, { ext: 'on-10', value: '1980-03-10' }, { ext: 'on-07', value: '1980-03-07' }, { ext: 'on-11', value: '1980-03-11' },
      ]);
      const before = await journey(t, { offset: -7 });
      const same = await journey(t, { offset: 0 });
      const after = await journey(t, { offset: 3 });
      const now = istanbul('2027-03-10');
      expect(await D.runDateSchedule(t.org, before.journeyId, now)).toMatchObject({ occasionDay: '2027-03-17', enrolled: 1 });
      expect(await D.runDateSchedule(t.org, same.journeyId, now)).toMatchObject({ occasionDay: '2027-03-10', enrolled: 1 });
      expect(await D.runDateSchedule(t.org, after.journeyId, now)).toMatchObject({ occasionDay: '2027-03-07', enrolled: 1 });
      expect(await exts(t, before.journeyId)).toEqual(['on-17']);
      expect(await exts(t, same.journeyId)).toEqual(['on-10']);
      expect(await exts(t, after.journeyId)).toEqual(['on-07']);
    });

    it('runs at the local time of the tenant: before it the previous day is the latest, after it the day is', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'd9', value: '1980-03-09' }, { ext: 'd10', value: '1980-03-10' }]);
      const { journeyId, activatedAt } = await journey(t);
      expect(activatedAt.getTime()).toBeLessThan(istanbul('2027-03-09').getTime());
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10', '09:29'))).toMatchObject({ status: 'done', slotDate: '2027-03-09', occasionDay: '2027-03-09' });
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10', '09:30'))).toMatchObject({ status: 'done', slotDate: '2027-03-10', occasionDay: '2027-03-10' });
      expect(await exts(t, journeyId)).toEqual(['d10', 'd9']);
    });

    it('uses the tenant\'s time zone: the same instant is a different local day in Auckland', async () => {
      const t = await tenant();
      await sql(t.org, `UPDATE engage.tenant_settings SET timezone = 'Pacific/Auckland' WHERE organization_id = $1`, [t.org]);
      const { journeyId } = await journey(t);
      // 22:00 UTC on 10 March is 01:00 on the 11th in Istanbul (the 10th's run is the latest) but 11:00 on the 11th in Auckland.
      expect(await D.runDateSchedule(t.org, journeyId, new Date('2027-03-10T22:00:00Z'))).toMatchObject({ status: 'done', slotDate: '2027-03-11' });
    });

    it('never runs before the first scheduled moment after activation', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'c', value: `1980-${isoDay(Date.now()).slice(5)}` }]);
      const { journeyId, activatedAt } = await journey(t);
      expect(await D.runDateSchedule(t.org, journeyId, new Date(activatedAt.getTime() + 1000))).toEqual({ status: 'not_due' });
      expect(await enrollments(t, journeyId)).toHaveLength(0);
    });

    it('does not make up missed days: only the latest due day runs', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'missed-a', value: '1980-03-07' }, { ext: 'missed-b', value: '1980-03-08' }, { ext: 'today', value: '1980-03-10' }]);
      const { journeyId } = await journey(t);
      // Nothing ran on the 7th, 8th and 9th; the next run is on the 10th.
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10'))).toMatchObject({ status: 'done', matched: 1 });
      expect(await exts(t, journeyId)).toEqual(['today']);
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.date_runs WHERE journey_id = $1`, [journeyId])).rows[0]!.n).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('boundaries and isolation', () => {
    it('stops at the cap and says so only when more customers matched', async () => {
      const mk = async () => {
        const t = await tenant();
        await customers(t, Array.from({ length: 20 }, (_, i) => ({ ext: `c-${pad(i)}`, value: '1980-03-10' })));
        return { t, ...(await journey(t)) };
      };
      const exact = await mk();
      expect(await D.runDateSchedule(exact.t.org, exact.journeyId, istanbul('2027-03-10'), { chunk: 4, maxRun: 20 })).toMatchObject({ status: 'done', matched: 20, enrolled: 20, truncated: false });
      const capped = await mk();
      expect(await D.runDateSchedule(capped.t.org, capped.journeyId, istanbul('2027-03-10'), { chunk: 4, maxRun: 10 })).toMatchObject({ status: 'done', matched: 10, enrolled: 10, truncated: true });
      expect(await enrollments(capped.t, capped.journeyId)).toHaveLength(10);
    });

    it('a stopped or retired journey runs nothing, and an event-triggered one is not a date run', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'c', value: '1980-03-10' }]);
      const { journeyId } = await journey(t);
      await J.deactivateJourney(t.org, t.userId, journeyId);
      expect(await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10'))).toEqual({ status: 'not_date' });
      const ev = await J.createJourney(t.org, t.userId, { key: 'ev', name: 'Ev', definition: { trigger: { type: 'event', event: 'cart_updated' }, steps: [{ id: 'x', type: 'exit' }] } });
      await J.approveJourneyVersion(t.org, t.userId, ev.journey.id, 1);
      await J.activateJourneyVersion(t.org, t.userId, ev.journey.id, 1);
      expect(await D.runDateSchedule(t.org, ev.journey.id, istanbul('2027-03-10'))).toEqual({ status: 'not_date' });
    });

    it('the tick runs due date journeys for the tenants it is given, and no other', async () => {
      const a = await tenant();
      const b = await tenant();
      for (const t of [a, b]) await customers(t, [{ ext: 'c', value: '1980-03-10' }]);
      const ja = await journey(a);
      const jb = await journey(b);
      const out = await E.runJourneyTick({ now: () => istanbul('2027-03-10'), onlyOrganizations: [a.org] });
      expect(out.dateRuns).toBe(1);
      expect(await enrollments(a, ja.journeyId)).toHaveLength(1);
      expect(await enrollments(b, jb.journeyId)).toHaveLength(0);
      expect((await E.runTenantTick(b.org, istanbul('2027-03-10'))).dateRuns).toBe(1);
      expect(await enrollments(b, jb.journeyId)).toHaveLength(1);
    });

    it('one tenant\'s customers are never enrolled in another tenant\'s journey', async () => {
      const a = await tenant();
      const b = await tenant();
      await customers(a, [{ ext: 'only-a', value: '1980-03-10' }]);
      await customers(b, [{ ext: 'only-b', value: '1980-03-10' }]);
      const jb = await journey(b);
      await D.runDateSchedule(b.org, jb.journeyId, istanbul('2027-03-10'));
      expect(await exts(b, jb.journeyId)).toEqual(['only-b']);
      expect((await sql(a.org, `SELECT count(*)::int AS n FROM engage.enrollments`)).rows[0]!.n).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('the florist occasion reminder', () => {
    it('is installed as a draft with its template, once, and never approved or activated by the installer', async () => {
      const t = await tenant();
      const out = await O.installOccasionReminder(t.org, t.userId, { attribute: 'anniversary_date' });
      expect(out).toMatchObject({ journeyKey: 'occasion-anniversary-date', version: 1, templateCreated: true });
      await expect(O.installOccasionReminder(t.org, t.userId, { attribute: 'anniversary_date' })).rejects.toThrow(/already has a journey/);
      // A second attribute shares the template.
      expect(await O.installOccasionReminder(t.org, t.userId, { attribute: 'birth_date', offsetDays: -3 })).toMatchObject({ journeyKey: 'occasion-birth-date', templateCreated: false });
      const v = (await sql(t.org, `SELECT approved_at, activated_at, definition FROM engage.journey_versions WHERE journey_id = $1`, [out.journeyId])).rows[0]!;
      expect(v.approved_at).toBeNull();
      expect(v.activated_at).toBeNull();
      expect(v.definition.trigger).toEqual({ type: 'date_attribute', attribute: 'anniversary_date', offset_days: -7, at_local_time: '09:30' });
      await expect(O.installOccasionReminder(t.org, t.userId, { attribute: 'bad name' })).rejects.toThrow(/attribute name/);
    });

    it('reminds the customers whose anniversary is a week away, once, with a message made from the template', async () => {
      const t = await tenant();
      await sql(t.org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [t.org]);
      await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: { from_address: 'info@shop.example' }, secrets: { webhook_secret: `whsec_${u()}` } });
      await customers(t, [
        { ext: 'in-a-week-1', value: '2015-03-17' }, { ext: 'in-a-week-2', value: '2009-03-17' }, { ext: 'tomorrow', value: '2015-03-11' },
        { ext: 'a-week-ago', value: '2015-03-03' }, { ext: 'birthday-only', value: '1985-03-17', attr: 'birth_date' }, { ext: 'erased', value: '2015-03-17', erased: true },
      ]);
      const out = await O.installOccasionReminder(t.org, t.userId, { attribute: 'anniversary_date', holdoutPercent: 0 });
      await J.approveJourneyVersion(t.org, t.userId, out.journeyId, 1);
      await J.activateJourneyVersion(t.org, t.userId, out.journeyId, 1);

      const tick = await E.runTenantTick(t.org, istanbul('2027-03-10'));
      expect(tick).toMatchObject({ dateRuns: 1, enrolled: 2 });
      const msgs = (await sql(t.org, `SELECT p.external_id, m.content->>'subject' AS subject, m.content->'render_error' AS render_error, m.purpose FROM engage.messages m JOIN engage.profiles p ON p.id = m.profile_id ORDER BY p.external_id`)).rows;
      expect(msgs).toEqual([
        { external_id: 'in-a-week-1', subject: 'Özel gününüz yaklaşıyor', render_error: null, purpose: 'marketing' },
        { external_id: 'in-a-week-2', subject: 'Özel gününüz yaklaşıyor', render_error: null, purpose: 'marketing' },
      ]);
      // The same day again changes nothing.
      await E.runTenantTick(t.org, istanbul('2027-03-10', '18:00'));
      expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0]!.n).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('API and database guards', () => {
    it('the runs are listed for the journey, newest first, to tenant users only', async () => {
      const t = await tenant();
      await customers(t, [{ ext: 'c', value: '1980-03-10' }]);
      const { journeyId } = await journey(t);
      await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10'));
      await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-11'));
      const r = await app.http(`/journeys/${journeyId}/date-runs`, { token: t.member });
      expect(r.status).toBe(200);
      const runs = r.json.runs as Array<{ slotDate: string; occasionDay: string; status: string; matched: number }>;
      expect(runs.map((x) => x.slotDate)).toEqual(['2027-03-11', '2027-03-10']);
      expect(runs[1]).toMatchObject({ status: 'done', matched: 1, occasionDay: '2027-03-10' });
      expect((await app.http(`/journeys/${journeyId}/date-runs`, {})).status).toBe(401);
      expect((await app.http(`/journeys/${journeyId}/date-runs`, { token: (await tenant()).member })).status).toBe(404);
    });

    it('the engage role cannot change a finished run, make counts that do not add up, or delete one; the work list shows ids only', async () => {
      const t = await tenant();
      const { journeyId } = await journey(t);
      await D.runDateSchedule(t.org, journeyId, istanbul('2027-03-10'));
      await expect(sql(t.org, `UPDATE engage.date_runs SET matched = 5 WHERE journey_id = $1`, [journeyId])).rejects.toThrow(/finished date run|matched/);
      await expect(sql(t.org, `UPDATE engage.date_runs SET slot_date = '2030-01-01' WHERE journey_id = $1`, [journeyId])).rejects.toThrow();
      await expect(sql(t.org, `DELETE FROM engage.date_runs WHERE journey_id = $1`, [journeyId])).rejects.toThrow(/permission denied/);
      const direct = await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.date_runs'));
      expect(direct.rows).toEqual([]);
      const listed = await f.engage.withEngageScheduler((c) => c.query('SELECT * FROM engage.due_date_work($1::uuid[])', [[t.org]]));
      expect(listed.fields.map((x) => x.name)).toEqual(['organization_id', 'journey_id']);
      expect(listed.rows).toEqual([{ organization_id: t.org, journey_id: journeyId }]);
    });
  });
});
