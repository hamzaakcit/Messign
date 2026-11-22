/**
 * Checks a restored database (WP-29, docs/runbooks/ops-monitoring.md, "Restore drill"). Reads only; prints names, counts and
 * timestamps, never customer data. The connection string is taken from RESTORE_CHECK_DATABASE_URL (never an argument, so it is
 * not left in shell history or the process list), and must be a role that sees every row: the owner or a superuser.
 *
 *   RESTORE_CHECK_DATABASE_URL=<live database> npm run engage:restore-check -- --manifest-out live.json
 *       on the LIVE database, before or while you take the backup: records row counts and newest timestamps.
 *   RESTORE_CHECK_DATABASE_URL=<restored scratch database> npm run engage:restore-check -- [--manifest live.json]
 *       on the RESTORED database: runs every check and, with the manifest, compares with live. Exit 0 only if all pass.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { buildManifest, runRestoreCheck, type Manifest } from '../engage/ops/restoreCheck.js';

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');

async function main(): Promise<void> {
  const url = process.env.RESTORE_CHECK_DATABASE_URL;
  if (!url) { console.error('Set RESTORE_CHECK_DATABASE_URL to the database to check (see the usage in this file).'); process.exit(2); }
  const args = process.argv.slice(2);
  const arg = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const out = arg('--manifest-out');
    if (out) {
      const m = await buildManifest(pool);
      writeFileSync(out, JSON.stringify(m, null, 2));
      console.log(`Manifest of ${Object.keys(m.tables).length} tables written to ${out}.`);
      return;
    }
    const manifestPath = arg('--manifest');
    const manifest = manifestPath ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest) : undefined;
    const report = await runRestoreCheck(pool, { migrationsDir: MIGRATIONS, manifest });
    for (const c of report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(11)} ${c.detail}`);
    console.log(report.ok ? '\nThe restore is whole and consistent.' : '\nThe restore has problems (see FAIL above).');
    if (!report.ok) process.exitCode = 1;
  } finally { await pool.end(); }
}
main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('[engage] restore check failed:', err instanceof Error ? err.name : 'error'); process.exit(1); });
