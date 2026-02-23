import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const sql = readFileSync(join(__dirname, 'migrations', 'knowledge_hub_v12.sql'), 'utf-8');
  console.log('[knowledge-v12] Running migration...');
  try {
    await pool.query(sql);
    console.log('[knowledge-v12] Migration completed successfully.');
  } catch (e) {
    console.error('[knowledge-v12] Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
