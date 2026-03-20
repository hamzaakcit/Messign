/**
 * One-shot: create `marketing_approval_queue` using the same DB connection as the API.
 * Use when `db:migrate-runner` cannot complete on local (older/partial DB) but the app
 * already connects successfully.
 *
 * Run from `server/`: npm run db:ensure-marketing-approval-queue
 */
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const sqlPath = join(__dirname, '../migrations/073_marketing_approval_queue.sql');

async function main(): Promise<void> {
  const { pool } = await import('../db/index.js');
  const sql = readFileSync(sqlPath, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[ensureMarketingApprovalQueueTable] OK — marketing_approval_queue ready.');
  } catch (e) {
    await client.query('ROLLBACK');
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ensureMarketingApprovalQueueTable] Failed:', msg);
    if (msg.includes('permission denied') || msg.includes('must be owner')) {
      console.error(
        'Hint: the app role (messign_app) cannot CREATE TABLE. Run with DATABASE_ADMIN_URL (postgres/superuser) or paste server/src/migrations/073_marketing_approval_queue.sql in your DB admin UI.',
      );
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
