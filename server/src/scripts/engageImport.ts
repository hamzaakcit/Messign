/**
 * Runs an import directly (no queue), the same code the upload job runs. Needs ENGAGE_DATABASE_URL.
 *   npm run engage:import -- --org <organization uuid> --kind profiles --file profiles.csv [--dry-run]
 * Prints the counts and the first problems (line, column, code; never cell values).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { closeEngagePool } from '../engage/db.js';
import { IMPORT_KINDS, runImport, type ImportKind } from '../engage/import/run.js';

const arg = (name: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
};
const kind = arg('kind') as ImportKind;
if (!IMPORT_KINDS.includes(kind)) { console.error('--kind must be profiles or orders'); process.exit(2); }
const dryRun = process.argv.includes('--dry-run');

runImport(arg('org'), kind, readFileSync(arg('file'), 'utf8'), { dryRun })
  .then(async (r) => {
    console.log(`[engage] ${dryRun ? 'DRY RUN (nothing written) ' : ''}${kind}: ${r.rowsTotal} rows`);
    console.log(r.counts);
    for (const e of r.errors.slice(0, 20)) console.log(`  line ${e.line} ${e.field} ${e.code}: ${e.message}`);
    if (r.errorsTotal > 20) console.log(`  ... ${r.errorsTotal - 20} more problems`);
    await closeEngagePool();
  })
  .catch((err) => { console.error('[engage] import failed:', err instanceof Error ? err.message : err); process.exit(1); });
