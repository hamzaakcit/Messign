/**
 * Runs add_opportunity_hub_columns.sql (opportunity_type, is_mspd, reward_currency, estimated_minutes).
 * Safe to run multiple times (idempotent).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runOpportunityHubMigration(): Promise<void> {
  const sqlPath = join(__dirname, 'migrations', 'add_opportunity_hub_columns.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  await pool.query(sql);
  console.log('✅ projects: opportunity_type, is_mspd, reward_currency, estimated_minutes applied.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOpportunityHubMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
