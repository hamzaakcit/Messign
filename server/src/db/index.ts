import pg from 'pg';
import os from 'os';
const { Pool } = pg;

// Local dev fallback: use current OS user (Mac username) instead of postgres
const localUser = process.env.USER || os.userInfo().username || 'postgres';
const localFallback = `postgresql://${localUser}@localhost:5432/messign`;

// PgBouncer first (production with connection pooling); then public URL (migrations); then DATABASE_URL; then local fallback
let connectionString =
  process.env.PGBOUNCER_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== 'production' ? localFallback : undefined);

if (!connectionString) {
  throw new Error('DATABASE_URL is required in production. Set it in your environment.');
}

// Railway TCP proxy: use SSL but do not verify cert (self-signed). Do not add sslmode=require to URL —
// current pg treats it as verify-full and rejects the cert; we force TLS via Pool's ssl option only.
const useUnsafeSSL =
  connectionString.includes('rlwy.net') ||
  connectionString.includes('railway.app') ||
  connectionString.includes('railway.net');

// With PgBouncer, keep Node-side pool small — PgBouncer handles the real pooling
const usePgBouncer = !!process.env.PGBOUNCER_URL;

export const pool = new Pool({
  connectionString,
  max: usePgBouncer ? 10 : 20,
  idleTimeoutMillis: usePgBouncer ? 10000 : 30000,
  connectionTimeoutMillis: usePgBouncer ? 5000 : useUnsafeSSL ? 15000 : 2000,
  ...(useUnsafeSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

// RLS compatibility: We use set_config('app.current_tenant', $1, true) inside BEGIN...COMMIT.
// That is transaction-scoped (like SET LOCAL). PgBouncer transaction mode resets session between
// transactions, so it works. Never use SET (without LOCAL) — that leaks state across transactions.

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return pool.query(text, params) as Promise<pg.QueryResult<T>>;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}
