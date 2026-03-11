/**
 * Launch checklist — verifies the system is ready for production.
 * Run: npx tsx src/scripts/launchChecklist.ts
 * Exit 1 if any check fails.
 */

import 'dotenv/config';
import { pool } from '../db/index.js';
import { redisConnection } from '../queue/connection.js';
import { doraSchedulerQueue } from '../queue/index.js';

const checks: Array<{ name: string; fn: () => Promise<boolean> }> = [];

function add(name: string, fn: () => Promise<boolean>) {
  checks.push({ name, fn });
}

// ── Database ──
add('Database connected', async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
});

add('schema_migrations exists', async () => {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
  );
  return r.rowCount !== null && r.rowCount > 0;
});

const CORE_TABLES = [
  'reimbursement_users',
  'crm_pipelines',
  'support_tickets',
  'marketing_campaigns',
  'recruitment_jobs',
  'time_entries',
  'okr_goals',
  'heart_sentiment_scores',
  'dora_insights',
  'dora_automation_policies',
];

add('Core tables exist', async () => {
  for (const table of CORE_TABLES) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (!r.rows.length) return false;
  }
  return true;
});

add('Materialized views (>= 8)', async () => {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM pg_matviews WHERE schemaname = 'public'`
  );
  const n = (r.rows[0] as { n: number })?.n ?? 0;
  return n >= 8;
});

// ── Redis ──
add('Redis connected', async () => {
  try {
    await redisConnection.ping();
    return true;
  } catch {
    return false;
  }
});

add('Dora scheduler repeatable jobs (>= 8)', async () => {
  try {
    const jobs = await doraSchedulerQueue.getRepeatableJobs();
    return jobs.length >= 8;
  } catch {
    return false;
  }
});

// ── Env ──
add('GROQ_API_KEY set', async () => !!process.env.GROQ_API_KEY);
add('REDIS_URL set', async () => !!process.env.REDIS_URL);
add('DATABASE_URL set', async () => !!process.env.DATABASE_URL);
add('JWT_SECRET set', async () => !!(process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET));
add('ENCRYPTION_KEY set', async () => !!process.env.ENCRYPTION_KEY);

// ── Data ──
add('Admin user exists', async () => {
  const r = await pool.query(
    `SELECT 1 FROM reimbursement_users WHERE role IN ('admin', 'system_admin') LIMIT 1`
  );
  return r.rowCount !== null && r.rowCount > 0;
});

add('Default pipeline exists', async () => {
  const r = await pool.query(`SELECT 1 FROM crm_pipelines LIMIT 1`);
  return r.rowCount !== null && r.rowCount > 0;
});

add('SLA policies (>= 4)', async () => {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM support_sla_policies`
  ).catch(() => ({ rows: [{ n: 0 }] }));
  const n = (r.rows[0] as { n: number })?.n ?? 0;
  return n >= 4;
});

add('Time categories (>= 5)', async () => {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM time_categories`
  ).catch(() => ({ rows: [{ n: 0 }] }));
  const n = (r.rows[0] as { n: number })?.n ?? 0;
  return n >= 5;
});

async function main() {
  console.log('Launch checklist\n');
  let failed = 0;
  for (const { name, fn } of checks) {
    try {
      const ok = await fn();
      console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}`);
      if (!ok) failed++;
    } catch (e) {
      console.log(`  ✗ ${name} (error: ${e instanceof Error ? e.message : String(e)})`);
      failed++;
    }
  }
  console.log('');
  if (failed > 0) {
    console.log(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
