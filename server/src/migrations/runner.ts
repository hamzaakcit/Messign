/**
 * The only migration runner. Applies SQL files in this folder in name order and records each in schema_migrations.
 * Run via: npm run db:migrate
 *
 * 000_baseline.sql is the production schema as of 2026-11-08 (ADR-010). On an empty database it is applied. On an
 * existing database it is recorded as applied without running, but only after every table it defines is confirmed
 * present, so a database that is behind is rejected instead of silently adopted.
 *
 * Migrations need an admin role (CREATE TABLE, CREATE EXTENSION, CREATE ROLE). URL resolution:
 *   DATABASE_MIGRATE_URL → DATABASE_ADMIN_URL → DATABASE_PUBLIC_URL → DATABASE_URL
 *   → local fallback `postgresql://$USER@localhost:5432/messign` when NODE_ENV !== 'production'
 * PgBouncer is deliberately not used: DDL needs a direct connection.
 */
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import os from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BASELINE = '000_baseline.sql';
const LOCK_KEY = 7040301;

export interface RunOptions {
  connectionString: string;
  migrationsDir?: string;
  ssl?: boolean;
  log?: (message: string) => void;
}

export interface RunResult {
  applied: string[];
  adoptedBaseline: boolean;
}

export function listMigrationFiles(dir: string = __dirname): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/** Tables created in public by the baseline, read from the file itself so it can never drift from it. */
export function baselineTables(sql: string): string[] {
  return [...sql.matchAll(/^CREATE TABLE public\.([a-z0-9_]+) \(/gm)].map((m) => m[1]!);
}

export async function runMigrations(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((m: string) => console.log(`[Migration Runner] ${m}`));
  const dir = opts.migrationsDir ?? __dirname;
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: 1,
    ...(opts.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  const client = await pool.connect();
  const result: RunResult = { applied: [], adoptedBaseline: false };

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`);
    const done = new Set((await client.query<{ filename: string }>('SELECT filename FROM public.schema_migrations')).rows.map((r) => r.filename));
    const files = listMigrationFiles(dir);

    if (files.includes(BASELINE) && !done.has(BASELINE)) {
      const existing = await client.query<{ present: string | null }>(`SELECT to_regclass('public.organizations')::text AS present`);
      if (existing.rows[0]?.present) {
        const expected = baselineTables(readFileSync(join(dir, BASELINE), 'utf-8'));
        const have = new Set((await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.tablename));
        const missing = expected.filter((t) => !have.has(t));
        if (missing.length > 0) {
          throw new Error(
            `This database has tables but is behind the baseline (${missing.length} of ${expected.length} missing, e.g. ${missing.slice(0, 5).join(', ')}). ` +
              'Recreate it from an empty database; the baseline is not applied over an existing schema.',
          );
        }
        await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [BASELINE]);
        done.add(BASELINE);
        result.adoptedBaseline = true;
        log(`Existing database matches the baseline (${expected.length} tables). Recorded ${BASELINE} as applied without running it.`);
      }
    }

    const pending = files.filter((f) => !done.has(f));
    if (pending.length === 0) {
      log('All migrations already applied.');
      return result;
    }
    log(`${pending.length} migration(s) to apply.`);

    for (const filename of pending) {
      const sql = readFileSync(join(dir, filename), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        result.applied.push(filename);
        log(`Applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log(`Failed: ${filename}`);
        throw err;
      }
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

function resolveCliOptions(): RunOptions {
  dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });
  dotenv.config({ path: join(__dirname, '..', '..', '.env') });

  const localUser = process.env.USER || os.userInfo().username || 'postgres';
  let url =
    process.env.DATABASE_MIGRATE_URL ||
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV !== 'production' ? `postgresql://${localUser}@localhost:5432/messign` : undefined);
  if (!url) {
    throw new Error(
      'Set DATABASE_URL (or DATABASE_PUBLIC_URL / DATABASE_ADMIN_URL / DATABASE_MIGRATE_URL) for migrations. ' +
        `For local Postgres use your OS login as the role, e.g. postgresql://${localUser}@localhost:5432/messign`,
    );
  }

  let host = '';
  try {
    host = new URL(url.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    /* unparsed */
  }
  if (host.endsWith('railway.internal')) {
    throw new Error(
      '`*.railway.internal` only resolves inside Railway. From your laptop use the public URL: ' +
        'export DATABASE_ADMIN_URL="$DATABASE_PUBLIC_URL" && npm run db:migrate',
    );
  }
  console.log('[Migration Runner] Using database host:', host || '(unparsed)');

  const ssl = /rlwy\.net|railway\.app|railway\.net/.test(url);
  if (ssl) url = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  return { connectionString: url, ssl };
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('migrations/runner.ts') ?? false;
if (isMain) {
  Promise.resolve()
    .then(() => runMigrations(resolveCliOptions()))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
