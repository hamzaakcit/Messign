/**
 * Migration runner — applies unapplied SQL migrations in alphabetical order.
 * Uses schema_migrations table to track which migrations have been applied.
 * Run via: npx tsx server/src/migrations/runner.ts
 *
 * IMPORTANT: Migrations require postgres/superuser (CREATE TABLE, etc.).
 * URL resolution (align with `db/index.ts` for local dev):
 *   DATABASE_MIGRATE_URL (override) → DATABASE_ADMIN_URL → DATABASE_PUBLIC_URL → DATABASE_URL
 *   → local fallback `postgresql://$USER@localhost:5432/messign` when NODE_ENV !== 'production'
 * We intentionally do NOT use PgBouncer here — use a direct Postgres URL for DDL.
 * The messign_app role typically cannot CREATE TABLE — use DATABASE_ADMIN_URL on Railway when needed.
 */
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import os from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root .env then server/.env (later wins) — same as many dev setups
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
const MIGRATIONS_DIR = join(__dirname);

const localUser = process.env.USER || os.userInfo().username || 'postgres';
const localFallback = `postgresql://${localUser}@localhost:5432/messign`;

let adminUrl =
  process.env.DATABASE_MIGRATE_URL ||
  process.env.DATABASE_ADMIN_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== 'production' ? localFallback : undefined);
if (!adminUrl) {
  throw new Error(
    'Set DATABASE_URL (or DATABASE_PUBLIC_URL / DATABASE_ADMIN_URL / DATABASE_MIGRATE_URL) for migrations. ' +
      'For local Postgres use your OS login as the role (Homebrew often has no `postgres` user), e.g. ' +
      'postgresql://' +
      (process.env.USER || os.userInfo().username || 'yourname') +
      '@localhost:5432/messign',
  );
}

let migrationHost = '';
try {
  migrationHost = new URL(adminUrl.replace(/^postgresql:/, 'http:')).hostname;
} catch {
  /* ignore */
}
if (migrationHost.endsWith('railway.internal')) {
  console.error(
    '[Migration Runner] `*.railway.internal` only resolves inside Railway’s private network (deployed services).',
  );
  console.error(
    'From your laptop, use the public Postgres URL: Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`, or the TCP proxy host (e.g. `*.proxy.rlwy.net`).',
  );
  console.error('Example: export DATABASE_ADMIN_URL="$DATABASE_PUBLIC_URL" && npm run db:migrate-runner');
  process.exit(1);
}

console.log('[Migration Runner] Using database host:', migrationHost || '(unparsed)');
const isRailway =
  adminUrl.includes('rlwy.net') ||
  adminUrl.includes('railway.app') ||
  adminUrl.includes('railway.net');
if (isRailway) {
  adminUrl = adminUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}
const pool = new pg.Pool({
  connectionString: adminUrl,
  ...(isRailway ? { ssl: { rejectUnauthorized: false } } : {}),
});

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

async function ensureSchemaMigrations(): Promise<void> {
  await pool.query(BOOTSTRAP_SQL);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map((r) => r.filename));
}

function getMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files;
}

export async function runMigrations(): Promise<void> {
  await ensureSchemaMigrations();

  const applied = await getAppliedMigrations();
  const allFiles = getMigrationFiles();
  const pending = allFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('[Migration Runner] All migrations already applied.');
    return;
  }

  console.log(`[Migration Runner] ${pending.length} migration(s) to apply.`);

  for (const filename of pending) {
    const filePath = join(MIGRATIONS_DIR, filename);
    const sql = readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      await client.query('COMMIT');
      console.log(`[Migration Runner] ✅ Applied: ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migration Runner] ❌ Failed: ${filename}`);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log('[Migration Runner] Done.');
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('migrations/runner.ts') ?? false;
if (isMain) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
