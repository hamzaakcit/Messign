/**
 * Simulates cart abandonment on ONE tenant through the real pipeline (WP-18), for demos and load checks:
 *
 *   npm run engage:simulate-carts -- --org <org uuid> --install            creates the templates and a draft journey
 *   npm run engage:simulate-carts -- --org <org uuid> --carts 200 [--seed 7] [--dispatch]
 *
 * The journey must have been approved and activated by a tenant admin before a simulation (installing never does
 * that). Customers are synthetic (sim-<run>-<n>@example.com). With --dispatch the messages are sent in SEND_MODE
 * sandbox (forced here, never live), and only if every active email account of the tenant uses the mock provider, so
 * a simulation can never reach a real mailbox. Prints counts only.
 *
 * Needs ENGAGE_DATABASE_URL; with --dispatch also ENGAGE_MASTER_KEY and the https ENGAGE_PUBLIC_APP_URL / _API_URL.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { closeEngagePool, withEngageTenant } from '../engage/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const fail = (msg: string): never => { console.error(msg); process.exit(2); };

async function main(): Promise<void> {
  const org = opt('org') ?? fail('Missing --org <organization uuid>');
  if (!UUID_RE.test(org)) fail('--org must be a UUID');
  const CA = await import('../engage/journeys/cartAbandonment.js');

  if (flag('install')) {
    const out = await CA.installCartAbandonment(org, null);
    console.log(`Installed journey ${out.journeyId} (version ${out.version}, draft); templates created: ${out.templatesCreated.join(', ') || 'none (already there)'}.`);
    console.log('A tenant admin must approve and activate version 1 before a simulation starts anything:');
    console.log(`  POST /api/engage/journeys/${out.journeyId}/versions/1/approve, then .../versions/1/activate`);
    return;
  }

  const carts = Number(opt('carts') ?? 200);
  if (!Number.isInteger(carts) || carts < 1 || carts > 100_000) fail('--carts must be 1 to 100000');
  const seed = Number(opt('seed') ?? Math.floor(Math.random() * 1e9));
  const J = await import('../engage/journeys/journeys.js');
  if (!(await J.getActiveJourneyVersion(org, CA.CART_JOURNEY_KEY))) fail(`No active "${CA.CART_JOURNEY_KEY}" journey for this tenant (run with --install, then approve and activate it).`);

  const dispatch = flag('dispatch');
  if (dispatch) {
    process.env.SEND_MODE = 'sandbox'; // never live from this script
    const providers = (await withEngageTenant(org, (c) => c.query<{ provider: string }>(
      `SELECT DISTINCT provider FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'email' AND status = 'active'`, [org]))).rows.map((r) => r.provider);
    if (providers.length !== 1 || providers[0] !== 'mock') fail('--dispatch needs the tenant\'s active email accounts to be mock accounts only; refusing to send simulated mail anywhere real.');
  }

  const S = await import('../engage/simulator/cartSimulator.js');
  const R = await import('../engage/simulator/runCartSimulation.js');
  const plan = S.planCartSimulation({ carts, seed, runId: randomBytes(4).toString('hex') });
  console.log(`Simulating ${carts} carts (seed ${seed}, run ${plan.options.runId}) over ${(plan.endMinute / 60).toFixed(1)} simulated hours...`);
  const started = Date.now();
  let lastPct = -1;
  const run = await R.runCartSimulation(org, plan, {
    dispatch,
    onTick: (m, total) => { const pct = Math.floor((m / total) * 10) * 10; if (pct !== lastPct) { lastPct = pct; process.stdout.write(`  ${pct}%\n`); } },
  });
  const v = S.verifyCartSimulation(plan, await R.observeCartSimulation(org, plan), { dispatched: dispatch });
  console.log(JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), events: { accepted: run.accepted, duplicates: run.duplicates, rejected: run.rejected }, ...v.totals, dispatch: run.dispatch }, null, 2));
  if (v.mismatches.length) {
    console.error(`${v.mismatches.length} customer(s) differ from the expected outcome; first ones:`);
    for (const m of v.mismatches.slice(0, 10)) console.error(`  ${m}`);
    process.exitCode = 1;
  } else {
    console.log('Every customer matched the expected outcome.');
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; }).finally(() => closeEngagePool());
