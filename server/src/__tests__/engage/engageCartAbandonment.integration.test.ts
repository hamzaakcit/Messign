/**
 * Cart abandonment end to end (WP-18), on real Postgres and the mock channel: the ready-made journey, installed and
 * approved like a tenant would, then a simulated stream of carts, orders, repeats and duplicate deliveries through the
 * real ingestion API path, the executor on a simulation clock, and the dispatcher through the send gate.
 * Acceptance: simulated 10,000 carts -> correct enrollments, exits and messages, zero duplicates.
 * The regular suite simulates 1,000 carts (about 20 s); the 10,000-cart acceptance run is ENGAGE_SIM_CARTS=10000 (about 4 min).
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

const CARTS = Number(process.env.ENGAGE_SIM_CARTS ?? 1_000);

describe.skipIf(!adminUrl)('cart abandonment end to end (real Postgres, mock channel)', () => {
  let f: TenancyFixture;
  let CA: typeof import('../../engage/journeys/cartAbandonment.js');
  let J: typeof import('../../engage/journeys/journeys.js');
  let M: typeof import('../../engage/messaging/index.js');
  let S: typeof import('../../engage/simulator/cartSimulator.js');
  let R: typeof import('../../engage/simulator/runCartSimulation.js');
  let creds: typeof import('../../engage/credentials.js');
  let mock: typeof import('../../engage/messaging/mockAdapter.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  /** A tenant ready to send in sandbox: send_enabled, rate card, budget, one mock email account. */
  async function tenant(): Promise<{ org: string; userId: string }> {
    const t = await f.provisionTenant(`Cart ${u()}`);
    const org = t.organization.id;
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [org]);
    await M.addRateCard(org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(org, 'email', 1_000_000_000, 'TRY');
    await creds.createAccount(org, t.admin.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `mock-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    return { org, userId: t.admin.userId };
  }

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    CA = await import('../../engage/journeys/cartAbandonment.js');
    J = await import('../../engage/journeys/journeys.js');
    M = await import('../../engage/messaging/index.js');
    S = await import('../../engage/simulator/cartSimulator.js');
    R = await import('../../engage/simulator/runCartSimulation.js');
    creds = await import('../../engage/credentials.js');
    mock = await import('../../engage/messaging/mockAdapter.js');
  }, 90_000);
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  it('installs the templates and the journey as a draft, which starts nothing until approved and activated', async () => {
    const t = await tenant();
    const out = await CA.installCartAbandonment(t.org, t.userId);
    expect(out).toMatchObject({ version: 1, templatesCreated: ['cart-reminder-1', 'cart-reminder-2'] });
    await expect(CA.installCartAbandonment(t.org, t.userId)).rejects.toThrow(/already has a journey/);
    expect(await J.getActiveJourneyVersion(t.org, CA.CART_JOURNEY_KEY)).toBeNull();
    const plan = S.planCartSimulation({ carts: 20, seed: 1, runId: u().replace(/[^a-z0-9]/g, '') });
    await R.runCartSimulation(t.org, plan);
    expect((await sql(t.org, 'SELECT count(*)::int AS n FROM engage.enrollments')).rows[0].n).toBe(0);
  });

  it(`acceptance: ${CARTS.toLocaleString('en')} simulated carts give exactly the expected enrollments, exits and messages, with no duplicate`, async () => {
    const t = await tenant();
    const { journeyId } = await CA.installCartAbandonment(t.org, t.userId);
    await J.approveJourneyVersion(t.org, t.userId, journeyId, 1);
    await J.activateJourneyVersion(t.org, t.userId, journeyId, 1);
    const plan = S.planCartSimulation({ carts: CARTS, seed: 20261109, runId: 'acc' });
    const send = vi.spyOn(mock.mockAdapter, 'send');
    process.env.SEND_MODE = 'sandbox';
    const started = Date.now();
    let run: Awaited<ReturnType<typeof R.runCartSimulation>>;
    try {
      run = await R.runCartSimulation(t.org, plan, { dispatch: true, concurrency: 6 });
    } finally { delete process.env.SEND_MODE; }
    const seconds = (Date.now() - started) / 1000;

    const v = S.verifyCartSimulation(plan, await R.observeCartSimulation(t.org, plan), { dispatched: true });
    expect(v.mismatches).toEqual([]);
    const deliveries = [...plan.deliveriesByTick.values()].flat();
    expect(run.rejected).toBe(0);
    expect(run.duplicates).toBe(deliveries.filter((d) => d.duplicate).length);
    expect(run.accepted).toBe(deliveries.length - run.duplicates);
    expect(v.totals.enrolled).toBe(CARTS);
    // Every send reached the adapter exactly once, and no message was sent twice.
    expect(send).toHaveBeenCalledTimes(v.totals.sent);
    expect(new Set(send.mock.calls.map(([req]) => req.idempotencyKey)).size).toBe(v.totals.sent);
    const twice = await sql(t.org, `SELECT message_id FROM engage.message_events WHERE type = 'sent' GROUP BY message_id HAVING count(*) > 1`);
    expect(twice.rowCount).toBe(0);
    // Holdout around 10% (D-11), blocked only for the customers without consent.
    expect(v.totals.holdout / CARTS).toBeGreaterThan(CARTS >= 10_000 ? 0.08 : 0.05);
    expect(v.totals.holdout / CARTS).toBeLessThan(CARTS >= 10_000 ? 0.12 : 0.15);
    expect(v.totals.blocked).toBeGreaterThan(0);
    send.mockRestore();
    process.stdout.write(`cart simulation: ${CARTS} carts in ${seconds.toFixed(1)}s ${JSON.stringify({ ...v.totals, dispatch: run.dispatch })}\n`);
  }, 900_000);
});
