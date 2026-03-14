/**
 * RLS Diagnostic Script
 *
 * Runs diagnostic queries to identify why RLS may not be enforcing.
 * Run: npm run db:diagnose-rls (from server/) or npx tsx server/src/scripts/diagnoseRls.ts
 *
 * Requires: DATABASE_URL or PGBOUNCER_URL in environment
 */

import 'dotenv/config';
import { pool } from '../db/index.js';

const KEY_TABLES = ['crm_deals', 'support_tickets', 'reimbursement_requests', 'invoices'];

async function runQuery<T = unknown>(label: string, sql: string, params?: unknown[]): Promise<T[]> {
  console.log(`\n--- ${label} ---\n`);
  const result = await pool.query(sql, params);
  console.log(JSON.stringify(result.rows, null, 2));
  return result.rows as T[];
}

async function main() {
  console.log('\n=== RLS Diagnostic ===\n');
  console.log('Database:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') ?? '(unknown)');

  try {
    // 1. Check if RLS is enabled on key tables (pg_tables)
    await runQuery(
      '1. RLS enabled (pg_tables)',
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
       AND tablename IN ($1, $2, $3, $4)
       ORDER BY tablename`,
      KEY_TABLES,
    );

    // 2. Check FORCE ROW LEVEL SECURITY and relrowsecurity
    await runQuery(
      '2. FORCE RLS and relrowsecurity (pg_class)',
      `SELECT relname, relforcerowsecurity, relrowsecurity
       FROM pg_class
       WHERE relname IN ($1, $2, $3, $4)
       ORDER BY relname`,
      KEY_TABLES,
    );

    // 3. Check if app role has BYPASSRLS
    await runQuery(
      '3. Current user BYPASSRLS/SUPERUSER',
      `SELECT rolname, rolbypassrls, rolsuper
       FROM pg_roles
       WHERE rolname = current_user`,
    );

    // 4. List existing RLS policies
    await runQuery(
      '4. RLS policies (first 50)',
      `SELECT tablename, policyname, permissive, roles, cmd, qual
       FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname
       LIMIT 50`,
    );

    // 5. Test current_tenant_id()
    await runQuery('5. current_tenant_id() (no tenant set)', 'SELECT current_tenant_id()');

    // 6. Test set_app_tenant exists
    await runQuery(
      '6. set_app_tenant function',
      `SELECT proname, pg_get_function_arguments(oid) as args
       FROM pg_proc
       WHERE proname = 'set_app_tenant'`,
    );

    await runQuery(
      '7. current_tenant_id function',
      `SELECT proname FROM pg_proc WHERE proname = 'current_tenant_id'`,
    );

    // 7b. Check if tenant_id exists on key tables
    await runQuery(
      '7b. tenant_id column on key tables',
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ($1, $2, $3, $4)
         AND column_name = 'tenant_id'
       ORDER BY table_name`,
      KEY_TABLES,
    );

    // 8. Test: query without tenant - should return 0 if RLS works
    console.log('\n--- 8. Test: COUNT without set_app_tenant ---\n');
    for (const table of KEY_TABLES) {
      try {
        const r = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(r.rows[0]?.count ?? '0', 10);
        console.log(`${table}: ${count} rows`);
      } catch (e) {
        console.log(`${table}: ERROR -`, e instanceof Error ? e.message : e);
      }
    }

    console.log('\n=== Diagnostic complete ===\n');
  } catch (err) {
    console.error('Diagnostic failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
