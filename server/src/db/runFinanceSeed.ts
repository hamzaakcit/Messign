import 'dotenv/config';
import { pool } from './index.js';
import { seedFinanceData } from './seeds/financeSeed.js';

async function run() {
  console.log('[finance-seed] Starting finance seed (schema comes from `npm run db:migrate`)...');
  console.log('[finance-seed] Database:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@'));

  try {
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
