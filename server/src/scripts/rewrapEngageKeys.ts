/**
 * Re-wraps every tenant credential's data key under the current ENGAGE_MASTER_KEY (run after rotating the master key).
 * Needs ENGAGE_DATABASE_URL, DATABASE_URL (to list tenants), ENGAGE_MASTER_KEY, and the previous key in
 * ENGAGE_MASTER_KEYS_OLD ("id:hex"). Safe to run repeatedly. Remove the old key from the environment afterwards.
 */
import 'dotenv/config';
import { rewrapAllTenants } from '../engage/bootstrap/rewrapAllTenants.js';
import { closeEngagePool } from '../engage/db.js';

rewrapAllTenants()
  .then(async (r) => {
    console.log(`[engage] re-wrapped ${r.rewrapped} credential(s) across ${r.tenants} tenant(s)`);
    await closeEngagePool();
    const { pool } = await import('../db/index.js');
    await pool.end();
  })
  .catch((err) => {
    console.error('[engage] re-wrap failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
