/**
 * What the ops check sees right now, for every tenant that can be sending (WP-29, docs/runbooks/ops-monitoring.md). Read-only:
 * nothing is stored and nobody is notified. Counts, codes and ids only.
 *
 *   npm run engage:ops-report [-- --org <org uuid>] [--json]
 *
 * Needs ENGAGE_DATABASE_URL. The dead-letter part also needs DATABASE_URL (the server's own pool) and says so if it is missing.
 */
import 'dotenv/config';
import { closeEngagePool } from '../engage/db.js';
import { describeCondition } from '../engage/ops/describe.js';
import { errorGroups } from '../engage/ops/errors.js';
import { runOpsCheck } from '../engage/ops/monitor.js';
import { failedEngageJobs, platformConditions } from '../engage/ops/platform.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const org = args.includes('--org') ? args[args.indexOf('--org') + 1] : undefined;
  const asJson = args.includes('--json');
  const summary = await runOpsCheck({ persist: false, onlyOrganizations: org ? [org] : undefined });
  const platform = platformConditions(await failedEngageJobs());
  if (asJson) {
    console.log(JSON.stringify({ tenants: summary.tenants, found: summary.found, platform, errors: errorGroups().map((g) => ({ source: g.source, count: g.count, description: g.description })) }, null, 2));
    return;
  }
  console.log(`Tenants looked at: ${summary.tenants}. Tenants with problems: ${summary.found.length}.`);
  for (const f of summary.found) {
    console.log(`\n${f.organizationId}`);
    for (const c of f.conditions) console.log(`  [${c.severity}] ${c.rule}${c.subject ? ` (${c.subject})` : ''}: ${describeCondition(c)}`);
  }
  for (const p of platform) console.log(`\nplatform [${p.severity}] ${p.key}: ${p.text}`);
  if (summary.found.length === 0 && platform.length === 0) console.log('Nothing is wrong.');
  if (summary.errors) console.log(`\n${summary.errors} tenants could not be measured (see the log lines above).`);
}

main().then(() => closeEngagePool().then(() => process.exit(0)), (err) => { console.error('[engage] ops report failed:', err instanceof Error ? err.name : 'error'); process.exit(1); });
