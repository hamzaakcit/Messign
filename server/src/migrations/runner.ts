/**
 * Migration runner — applies unapplied SQL migrations in alphabetical order.
 * Uses schema_migrations table to track which migrations have been applied.
 * Run via: npx tsx server/src/migrations/runner.ts
 *
 * IMPORTANT: Migrations require postgres/superuser (CREATE TABLE, etc.).
 * Uses DATABASE_ADMIN_URL or DATABASE_PUBLIC_URL if set; otherwise DATABASE_URL.
 * The messign_app role typically cannot create tables — use admin URL for Railway.
 */
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from server/ so migrations get DB vars when run from workspace root
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
const MIGRATIONS_DIR = join(__dirname);

let adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error('DATABASE_ADMIN_URL, DATABASE_PUBLIC_URL, or DATABASE_URL required for migrations.');
}
const isRailway = adminUrl.includes('rlwy.net') || adminUrl.includes('railway.app') || adminUrl.includes('railway.net');
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
