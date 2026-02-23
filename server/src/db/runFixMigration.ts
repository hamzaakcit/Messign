import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs ALL fix migrations to add missing columns, tables, and indexes.
 * Safe to run multiple times (all statements are idempotent).
 */
export async function runFixMigration(): Promise<void> {
  const migrations = [
    'fix_all_missing.sql',
    'add_missing_channel.sql',
    'add_projects_tags.sql',
    'add_performance_teams_updated_at.sql',
    'add_invoice_system.sql',
    'add_invoice_signing.sql',
    'add_opportunity_hub_columns.sql',
    'fix_all_missing_columns_and_tables.sql',
    'add_knowledge_hub.sql',
  ];

  for (const file of migrations) {
    const filePath = join(__dirname, 'migrations', file);
    try {
      await pool.query(readFileSync(filePath, 'utf-8'));
      console.log(`✅ ${file} applied.`);
    } catch (e) {
      console.warn(`⚠️  ${file}:`, (e as Error).message);
    }
  }
  console.log('✅ Database fix migration completed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFixMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
