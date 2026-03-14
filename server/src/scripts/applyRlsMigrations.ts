/**
 * Apply RLS migrations from db/migrations/
 * Run: npm run db:apply-rls (from server/)
 *
 * Applies in order:
 * 1. 001_add_tenant_id.sql - adds tenant_id to tables
 * 2. 002_enable_rls.sql - enables RLS and creates policies
 * 3. 004_rls_gap_fix.sql - adds RLS to finance/heart/time tables with org_id gaps
 *
 * IMPORTANT: Migrations require postgres/superuser (ALTER TABLE, CREATE POLICY).
 * Set DATABASE_ADMIN_URL to your postgres connection string. If unset, uses DATABASE_URL
 * (which may fail if using messign_app restricted role).
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

let adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error('DATABASE_URL, DATABASE_PUBLIC_URL, or DATABASE_ADMIN_URL required for RLS migrations.');
}
// Railway uses self-signed certs. Strip sslmode from URL — pg treats require/prefer as verify-full and rejects.
// We enable TLS via Pool's ssl option with rejectUnauthorized: false instead.
const isRailway = adminUrl.includes('rlwy.net') || adminUrl.includes('railway.app') || adminUrl.includes('railway.net');
if (isRailway) {
  adminUrl = adminUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}
const pool = new pg.Pool({
  connectionString: adminUrl,
  ...(isRailway ? { ssl: { rejectUnauthorized: false } } : {}),
});

// db/migrations is at workspace root; cwd may be workspace or server/
function findDbMigrations(): string {
  const candidates = [
    join(process.cwd(), 'db', 'migrations'),
    join(process.cwd(), '..', 'db', 'migrations'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, '001_add_tenant_id.sql'))) return p;
  }
  throw new Error('db/migrations not found. Run from workspace root.');
}
const DB_MIGRATIONS = findDbMigrations();

async function applyMigration(client: pg.PoolClient, name: string) {
  const path = join(DB_MIGRATIONS, name);
  if (!existsSync(path)) {
    throw new Error(`Migration not found: ${path}`);
  }
  const sql = readFileSync(path, 'utf-8');
  await client.query(sql);
  console.log(`  Applied: ${name}`);
}

async function main() {
  console.log('\n=== Applying RLS migrations ===\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Applying 001_add_tenant_id.sql...');
    await applyMigration(client, '001_add_tenant_id.sql');

    console.log('2. Applying 002_enable_rls.sql...');
    await applyMigration(client, '002_enable_rls.sql');

    if (existsSync(join(DB_MIGRATIONS, '004_rls_gap_fix.sql'))) {
      console.log('3. Applying 004_rls_gap_fix.sql...');
      await applyMigration(client, '004_rls_gap_fix.sql');
    }

    await client.query('COMMIT');
    console.log('\nRLS migrations applied successfully.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('RLS migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
