/**
 * The timed kill-switch drill (WP-33, pilot gate 6). Two modes; the runbook is docs/runbooks/pilot-runbook.md.
 *
 *   npm run engage:kill-switch-drill -- --org <drill tenant uuid> --account <its mock email account id> [--ask-master-key] [--json]
 *     Flips SEND_MODE=off (in this process) and the tenant's send_enabled=false between messages of a running batch and times
 *     the hold. Sandbox only, mock account only, @example.com recipients: nothing real can be sent. Writes 16 profiles and
 *     messages to the drill tenant, so use a tenant made for drills, never a customer's. Exit code 1 if any check fails.
 *
 *   npm run engage:kill-switch-drill -- --stopwatch global|tenant
 *     A stopwatch for the part this script cannot do: the real server. Press Enter when you change the Railway variable (or press
 *     Turn sending off), press Enter again when Settings shows the effect; prints the elapsed time.
 *
 * Needs ENGAGE_DATABASE_URL (and the master key, in the environment or typed with --ask-master-key). Run it in your own
 * terminal; it is not run by CI against any real database.
 */
import 'dotenv/config';
import { createInterface } from 'readline/promises';
import { performance } from 'perf_hooks';
import { closeEngagePool } from '../engage/db.js';
import { DrillRefusedError, formatDrill, formatElapsed, runKillSwitchDrill } from '../engage/ops/killSwitchDrill.js';
import { promptHidden } from './hiddenPrompt.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const usage = (): never => {
  console.error('Usage: npm run engage:kill-switch-drill -- --org <uuid> --account <uuid> [--ask-master-key] [--json]\n       npm run engage:kill-switch-drill -- --stopwatch global|tenant');
  process.exit(2);
};

async function stopwatch(which: string): Promise<void> {
  if (which !== 'global' && which !== 'tenant') usage();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const what = which === 'global'
    ? ['Change SEND_MODE to off in Railway and press Deploy.', 'Then reload Settings in the app: "Server mode: off" shows when the new deployment answers.']
    : ['Press "Turn sending off" in Settings.', 'The Settings card then says "Sending is off for this organization."'];
  console.log(`${what[0]}\nPress Enter at the moment you do it.`);
  await rl.question('');
  const t0 = performance.now();
  console.log(`Timer running. ${what[1]}\nPress Enter the moment you see it.`);
  await rl.question('');
  const ms = performance.now() - t0;
  rl.close();
  console.log(`${which} switch: ${formatElapsed(ms)} from your action to the effect you saw (${new Date().toISOString()}). Write it in the drill record.`);
  console.log(which === 'global'
    ? 'Now put SEND_MODE back (sandbox, or live where it was live) and time that too: it is the time to resume.'
    : 'Now turn sending back on in Settings.');
}

async function main(): Promise<void> {
  const sw = arg('stopwatch');
  if (argv.includes('--stopwatch')) { await stopwatch(sw ?? ''); return; }
  const org = arg('org');
  const account = arg('account');
  if (!org || !account || !UUID_RE.test(org) || !UUID_RE.test(account)) usage();
  if (argv.includes('--ask-master-key')) {
    process.env.ENGAGE_MASTER_KEY = await promptHidden('ENGAGE_MASTER_KEY (hidden): ');
    process.env.ENGAGE_MASTER_KEY_ID = await promptHidden('ENGAGE_MASTER_KEY_ID (hidden): ');
  }
  const json = argv.includes('--json');
  try {
    const r = await runKillSwitchDrill({ orgId: org!, accountId: account!, log: json ? undefined : (l) => console.log(l) });
    console.log(json ? JSON.stringify(r, null, 2) : `\n${formatDrill(r)}`);
    await closeEngagePool();
    process.exit(r.ok ? 0 : 1);
  } catch (err) {
    if (err instanceof DrillRefusedError) { console.error(`[engage] drill refused: ${err.message}`); await closeEngagePool(); process.exit(2); }
    throw err;
  }
}

main().then(() => process.exit(0), (err) => { console.error('[engage] kill-switch drill failed:', err instanceof Error ? err.message : err); process.exit(1); });
