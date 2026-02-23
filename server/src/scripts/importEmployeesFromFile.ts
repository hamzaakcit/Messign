import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getOrgIdBySlug, insertEmployees, type ImportRow } from '../db/bulkImportDb.js';

const DEFAULT_ORG_SLUG = 'messign';

function getFileFromArgs(): string {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  if (!arg) {
    console.error('Usage: npm run import-employees -- --file=data/employees-import.json');
    process.exit(1);
  }
  return arg.slice('--file='.length).trim();
}

async function main(): Promise<void> {
  const filePath = getFileFromArgs();
  const absolutePath = resolve(process.cwd(), filePath);

  let raw: unknown;
  try {
    const content = readFileSync(absolutePath, 'utf-8');
    raw = JSON.parse(content);
  } catch (e) {
    console.error('Failed to read or parse file:', e);
    process.exit(1);
  }

  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) {
    console.log('No rows to import.');
    process.exit(0);
  }

  const orgId = await getOrgIdBySlug(DEFAULT_ORG_SLUG);
  if (!orgId) {
    console.error('Organization not found. Run db:seed first or ensure organization exists.');
    process.exit(1);
  }

  const result = await insertEmployees(rows as ImportRow[], orgId, { createAuth: true });
  console.log(`Import complete: ${result.successful} successful, ${result.failed} failed, ${result.total} total.`);
  if (result.errors.length > 0) {
    result.errors.forEach((e) => console.error(`  Row ${e.row}: ${e.message}`));
  }
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
