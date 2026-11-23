import 'dotenv/config';
import { pool } from './index.js';
import { seedCrmOkrData } from './seeds/crmOkrSeed.js';

/** Terminal replacement for the removed POST /api/seed/crm-okr (WP-31). Idempotent: skips what already exists. */
async function run() {
  console.log('[crm-okr-seed] Seeding default CRM pipeline and sample OKR data (schema comes from `npm run db:migrate`)...');
  try {
    const result = await seedCrmOkrData();
    console.log('[crm-okr-seed] Done:', JSON.stringify(result));
  } catch (err) {
    console.error('[crm-okr-seed] Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
