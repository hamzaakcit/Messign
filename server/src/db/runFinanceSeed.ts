import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './index.js';
import { seedFinanceData } from './seeds/financeSeed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('[finance-seed] Starting finance v1.2 migration + seed...');
  console.log('[finance-seed] Database:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@'));

  try {
    // Step 1: Run migrations
    const migrations = [
      'finance_v12_schema.sql',
      'finance_v2_sprint1.sql',
      'finance_v2_sprint2.sql',
      'finance_v2_sprint3.sql',
    ];
    for (const file of migrations) {
      const migrationPath = path.join(__dirname, 'migrations', file);
      if (fs.existsSync(migrationPath)) {
        console.log(`[finance-seed] Running ${file}...`);
        const sql = fs.readFileSync(migrationPath, 'utf-8');
        await query(sql);
      }
    }
    console.log('[finance-seed] All migrations complete.');

    // Step 2: Run seed
    console.log('[finance-seed] Seeding finance data...');
    await seedFinanceData();
    console.log('[finance-seed] Seed complete!');
  } catch (err) {
    console.error('[finance-seed] Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
