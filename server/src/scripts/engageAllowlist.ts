/**
 * The sandbox allow-list from an operator's terminal (WP-33 follow-up). In SEND_MODE=sandbox the send gate delivers only to addresses
 * and numbers on this list (`not_allowlisted` otherwise), so the staff rehearsal of a pilot (Phase A) and any sandbox demo start here.
 * Live mode does not use it. Values are normalized the way the gate normalizes them; an invalid one is reported and nothing is
 * added for it. Adding a value that is already listed is a no-op. Needs ENGAGE_DATABASE_URL.
 *
 *   npm run engage:allowlist -- list   --org <uuid>
 *   npm run engage:allowlist -- add    --org <uuid> --channel email --value staff1@example.com --value staff2@example.com --label "staff"
 *   npm run engage:allowlist -- remove --org <uuid> --id <entry uuid>
 */
import 'dotenv/config';
import { closeEngagePool } from '../engage/db.js';
import { addAllowlistEntry, GateConfigError, listAllowlist, removeAllowlistEntry } from '../engage/messaging/gateConfig.js';
import { ALLOWLIST_USAGE, parseAllowlistArgs } from './engageAllowlistArgs.js';
import { setOperatorActor } from '../engage/actor.js';

async function main(): Promise<void> {
  setOperatorActor('allowlist'); // the audit log names this script as the actor
  let cmd;
  try { cmd = parseAllowlistArgs(process.argv.slice(2)); } catch (err) { console.error(err instanceof Error ? err.message : err); process.exit(2); }
  if (cmd.action === 'list') {
    const rows = await listAllowlist(cmd.org);
    console.log(`[engage] ${rows.length} allow-list entr${rows.length === 1 ? 'y' : 'ies'}`);
    for (const r of rows) console.log(`  ${r.id}  ${r.channel.padEnd(8)} ${r.value}${r.label ? `  (${r.label})` : ''}`);
  } else if (cmd.action === 'remove') {
    console.log((await removeAllowlistEntry(cmd.org, cmd.id)) ? '[engage] removed' : '[engage] no active entry with that id for this organization');
  } else {
    let added = 0, bad = 0;
    for (const value of cmd.values) {
      try { await addAllowlistEntry(cmd.org, cmd.channel, value, { label: cmd.label }); added++; } catch (err) {
        if (!(err instanceof GateConfigError)) throw err;
        bad++; console.error(`[engage] not added (${err.message}): value number ${cmd.values.indexOf(value) + 1}`);
      }
    }
    console.log(`[engage] ${added} on the ${cmd.channel} allow-list (already listed ones unchanged), ${bad} refused`);
    if (bad) process.exitCode = 1;
  }
  await closeEngagePool();
}

main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('[engage] allowlist failed:', err instanceof Error ? err.message : err); process.exit(1); });
