/**
 * Runs add_projects_tags.sql to add the tags column (TEXT[] DEFAULT '{}') to projects.
 * Safe to run multiple times (idempotent).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runTagsMigration(): Promise<void> {
  const path = join(__dirname, 'migrations', 'add_projects_tags.sql');
  const sql = readFileSync(path, 'utf-8');
  await pool.query(sql);
  console.log('✅ projects.tags column (TEXT[] DEFAULT \'{}\') applied.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTagsMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
