#!/usr/bin/env npx ts-node
/**
 * Check if Apache AGE extension is available on the PostgreSQL instance.
 * Run: npx ts-node src/scripts/checkAgeExtension.ts
 *
 * If AGE is not available (e.g. Railway managed Postgres), cross-module queries
 * use standard SQL JOINs instead — same business value, no graph dependency.
 */
import { pool } from '../db/index.js';

async function main() {
  try {
    const res = await pool.query(
      `SELECT * FROM pg_available_extensions WHERE name = 'age'`,
    );
    if (res.rows.length === 0) {
      console.log('Apache AGE is NOT available. Cross-module queries use SQL JOINs.');
      process.exit(0);
      return;
    }
    const row = res.rows[0];
    console.log('Apache AGE is available:', row);
    console.log('You can run migration 062_apache_age.sql to create messign_graph.');
  } catch (err) {
    console.error('Error checking AGE:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
