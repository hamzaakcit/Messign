import '../env.js';
import { pool } from './index.js';
import { seedMarketingData } from './seeds/marketingSeed.js';

async function run() {
  try {
    const result = await seedMarketingData();
    console.log('[marketing-seed]', JSON.stringify(result, null, 2));
    if (!result.seeded && result.reason === 'already_present') {
      console.log('[marketing-seed] Sentinel campaign exists — no changes.');
    }
  } catch (err) {
    console.error('[marketing-seed] Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
