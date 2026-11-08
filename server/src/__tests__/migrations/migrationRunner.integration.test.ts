/**
 * Migration baseline and runner on real Postgres (WP-03). Each case builds its own throwaway database from
 * ENGAGE_TEST_ADMIN_URL, so the role needs CREATEDB and CREATE EXTENSION. The baseline needs pgvector: use Postgres 17
 * with pgvector (CI: pgvector/pgvector:pg17). Without pgvector the cases skip with a note.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pg from 'pg';
import { BASELINE, baselineTables, listMigrationFiles, runMigrations } from '../../migrations/runner.js';

const adminUrl = process.env.ENGAGE_TEST_ADMIN_URL;
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/** Structure of the production schema on 2026-11-08 (public schema, excluding schema_migrations). */
export const LIVE_FINGERPRINT = {
  tables: 230, columns: 2761, indexes: 783, primary_keys: 230, foreign_keys: 162, unique: 73, checks: 122,
  policies: 249, rls_enabled: 72, rls_forced: 61, functions: 4, matviews: 8, triggers: 1, enum_types: 10, sequences: 5,
};

export const FINGERPRINT_SQL = `
SELECT json_build_object(
  'tables',        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'),
  'columns',       (SELECT count(*) FROM information_schema.columns c JOIN pg_tables t ON t.schemaname = c.table_schema AND t.tablename = c.table_name WHERE c.table_schema = 'public' AND c.table_name <> 'schema_migrations'),
  'indexes',       (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'schema_migrations'),
  'primary_keys',  (SELECT count(*) FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname <> 'schema_migrations' AND k.contype = 'p'),
  'foreign_keys',  (SELECT count(*) FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND k.contype = 'f'),
  'unique',        (SELECT count(*) FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname <> 'schema_migrations' AND k.contype = 'u'),
  'checks',        (SELECT count(*) FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND k.contype = 'c'),
  'policies',      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'rls_enabled',   (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity),
  'rls_forced',    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity),
  'functions',     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
  'matviews',      (SELECT count(*) FROM pg_matviews WHERE schemaname = 'public'),
  'triggers',      (SELECT count(*) FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal),
  'enum_types',    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'),
  'sequences',     (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S')
) AS fp`;

describe('migration files', () => {
  it('are the baseline first, then numbered NNN_name.sql files in strictly increasing order', () => {
    const files = listMigrationFiles(MIGRATIONS);
    expect(files[0]).toBe(BASELINE);
    const numbers = files.map((f) => {
      expect(f, 'name must be NNN_snake_case.sql').toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
      return Number(f.slice(0, 3));
    });
    expect(new Set(numbers).size, 'duplicate migration numbers').toBe(numbers.length);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  it('the baseline defines 230 tables, none of them schema_migrations or pgboss', () => {
    const sql = readFileSync(join(MIGRATIONS, BASELINE), 'utf-8');
    expect(baselineTables(sql)).toHaveLength(230);
    expect(sql).not.toMatch(/CREATE TABLE public\.schema_migrations|CREATE SCHEMA pgboss|\bpgboss\./);
    expect(sql).not.toMatch(/^\\/m);
  });
});

describe.skipIf(!adminUrl)('migration runner (real Postgres)', () => {
  const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  const created: string[] = [];
  let vectorOk = false;

  const urlFor = (db: string) => { const u = new URL(adminUrl!); u.pathname = `/${db}`; return u.toString(); };
  async function newDb(): Promise<string> {
    const name = `mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await admin.query(`CREATE DATABASE ${name}`);
    created.push(name);
    return name;
  }
  async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(db: string, sql: string): Promise<T[]> {
    const c = new pg.Client({ connectionString: urlFor(db) });
    await c.connect();
    try { return (await c.query<T>(sql)).rows; } finally { await c.end(); }
  }
  const fingerprint = async (db: string) => (await q<{ fp: Record<string, number> }>(db, FINGERPRINT_SQL))[0]!.fp;
  function baselineOnlyDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-only-'));
    cpSync(join(MIGRATIONS, BASELINE), join(dir, BASELINE));
    return dir;
  }
  const quiet = { log: () => undefined };

  beforeAll(async () => {
    const r = await admin.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'vector'`);
    vectorOk = (r.rowCount ?? 0) > 0;
  });
  beforeEach(({ skip }) => { skip(!vectorOk, 'pgvector is not installed in this Postgres (use Postgres 17 + pgvector)'); });
  afterAll(async () => {
    for (const db of created) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  });

  it('applies the baseline then later migrations to an empty database, and a second run does nothing', async () => {
    const db = await newDb();
    const first = await runMigrations({ connectionString: urlFor(db), ...quiet });
    expect(first.adoptedBaseline).toBe(false);
    expect(first.applied).toEqual(listMigrationFiles(MIGRATIONS));
    const rows = await q<{ filename: string }>(db, 'SELECT filename FROM public.schema_migrations ORDER BY filename');
    expect(rows.map((r) => r.filename)).toEqual(listMigrationFiles(MIGRATIONS));
    expect((await q<{ n: string }>(db, `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'engage'`))[0]!.n).toBe('3');
    expect((await q<{ search_path: string }>(db, 'SHOW search_path'))[0]!.search_path).toContain('public');
    const second = await runMigrations({ connectionString: urlFor(db), ...quiet });
    expect(second).toEqual({ applied: [], adoptedBaseline: false });
  }, 60_000);

  it('the baseline alone reproduces the production schema (structural fingerprint)', async () => {
    const db = await newDb();
    const dir = baselineOnlyDir();
    try {
      await runMigrations({ connectionString: urlFor(db), migrationsDir: dir, ...quiet });
      expect(await fingerprint(db)).toEqual(LIVE_FINGERPRINT);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('adopts the baseline on an existing database without running it, then applies later migrations', async () => {
    const db = await newDb();
    const dir = baselineOnlyDir();
    try {
      await runMigrations({ connectionString: urlFor(db), migrationsDir: dir, ...quiet });
      await q(db, `DELETE FROM public.schema_migrations; INSERT INTO public.schema_migrations (filename) VALUES ('001_base_schema.sql'), ('109_calibration_snapshots.sql')`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const before = await fingerprint(db);
    const res = await runMigrations({ connectionString: urlFor(db), ...quiet });
    expect(res.adoptedBaseline).toBe(true);
    expect(res.applied).toEqual(listMigrationFiles(MIGRATIONS).filter((f) => f !== BASELINE));
    const after = await fingerprint(db);
    expect({ ...after, columns: before.columns, checks: before.checks }).toEqual(before);
    const names = (await q<{ filename: string }>(db, 'SELECT filename FROM public.schema_migrations ORDER BY filename')).map((r) => r.filename);
    expect(names).toContain(BASELINE);
    expect(names).toContain('001_base_schema.sql');
  }, 60_000);

  it('refuses an existing database that is behind the baseline, and writes nothing', async () => {
    const db = await newDb();
    const dir = baselineOnlyDir();
    try { await runMigrations({ connectionString: urlFor(db), migrationsDir: dir, ...quiet }); } finally { rmSync(dir, { recursive: true, force: true }); }
    await q(db, 'DELETE FROM public.schema_migrations; DROP TABLE public.game_scores CASCADE; DROP TABLE public.marketing_content_calendar CASCADE');
    await expect(runMigrations({ connectionString: urlFor(db), ...quiet })).rejects.toThrow(/behind the baseline \(2 of 230 missing/);
    expect((await q(db, 'SELECT 1 FROM public.schema_migrations')).length).toBe(0);
    expect((await q(db, `SELECT 1 FROM pg_namespace WHERE nspname = 'engage'`)).length).toBe(0);
  }, 60_000);

  it('rolls back a failing migration completely and does not record it', async () => {
    const db = await newDb();
    const dir = baselineOnlyDir();
    writeFileSync(join(dir, '001_bad.sql'), 'CREATE TABLE public.half_done (id int);\nSELECT 1/0;');
    try {
      await expect(runMigrations({ connectionString: urlFor(db), migrationsDir: dir, ...quiet })).rejects.toThrow(/division by zero/);
      expect((await q(db, `SELECT 1 FROM pg_tables WHERE tablename = 'half_done'`)).length).toBe(0);
      const names = (await q<{ filename: string }>(db, 'SELECT filename FROM public.schema_migrations')).map((r) => r.filename);
      expect(names).toEqual([BASELINE]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('a migration and its record commit together: if recording fails, the migration is undone', async () => {
    const db = await newDb();
    const dir = baselineOnlyDir();
    // Succeeds on its own, but renames the bookkeeping table so the runner cannot record it.
    writeFileSync(join(dir, '001_breaks_recording.sql'), 'ALTER TABLE public.schema_migrations RENAME TO schema_migrations_moved;');
    try {
      await expect(runMigrations({ connectionString: urlFor(db), migrationsDir: dir, ...quiet })).rejects.toThrow();
      const tables = (await q<{ tablename: string }>(db, `SELECT tablename FROM pg_tables WHERE tablename LIKE 'schema_migrations%'`)).map((r) => r.tablename);
      expect(tables).toEqual(['schema_migrations']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('two runners started together apply each migration exactly once', async () => {
    const db = await newDb();
    const [a, b] = await Promise.all([
      runMigrations({ connectionString: urlFor(db), ...quiet }),
      runMigrations({ connectionString: urlFor(db), ...quiet }),
    ]);
    expect([...a.applied, ...b.applied].sort()).toEqual(listMigrationFiles(MIGRATIONS));
  }, 90_000);
});
