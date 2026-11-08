/**
 * Writes a synthetic tenant's CSVs (profiles.csv, orders.csv) to a directory.
 *   npm run engage:synthetic -- --kind bookstore --profiles 100000 --seed 1 --out ./synthetic/bookstore
 * Only test contact data is ever emitted (see engage/import/synthetic.ts).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateSyntheticTenant, type SyntheticKind } from '../engage/import/synthetic.js';

const arg = (name: string, fallback?: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (v === undefined) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
};
const kind = arg('kind') as SyntheticKind;
if (kind !== 'bookstore' && kind !== 'florist') { console.error('--kind must be bookstore or florist'); process.exit(2); }
const out = arg('out');
const t = generateSyntheticTenant({ kind, profiles: Number(arg('profiles', '1000')), seed: Number(arg('seed', '1')), mess: process.argv.includes('--clean') ? false : true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'profiles.csv'), t.profilesCsv);
writeFileSync(join(out, 'orders.csv'), t.ordersCsv);
console.log(`[engage] wrote ${t.expected.profileRows} profile rows and ${t.expected.orderRows} order rows to ${out}`);
