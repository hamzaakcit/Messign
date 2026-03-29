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

// Railway TCP proxy: use SSL but do not verify cert (self-signed). Strip sslmode from URL —
// pg treats require/prefer as verify-full and rejects the cert; we force TLS via Pool's ssl option only.
const useUnsafeSSL =
  connectionString.includes('rlwy.net') ||
  connectionString.includes('railway.app') ||
  connectionString.includes('railway.net');

if (useUnsafeSSL) {
  connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

// With PgBouncer, keep Node-side pool small — PgBouncer handles the real pooling
const usePgBouncer = !!process.env.PGBOUNCER_URL;
/** Hosted Postgres (Neon, Supabase pooler, etc.): longer connect timeout + shorter idle recycle. */
const isServerlessPostgres =
  connectionString.includes('neon.tech') || connectionString.includes('supabase.co');

export const pool = new Pool({
  connectionString,
  max: usePgBouncer ? 10 : isServerlessPostgres ? 15 : 20,
  idleTimeoutMillis: usePgBouncer ? 10000 : isServerlessPostgres ? 20000 : 30000,
  connectionTimeoutMillis: usePgBouncer ? 5000 : useUnsafeSSL ? 15000 : isServerlessPostgres ? 60000 : 2000,
  ...(useUnsafeSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (err) => {
  console.error('[pg pool] idle client error', err);
});

/** Stable UUID for dev when JWT sub is a slug (e.g. pending_actions.user_id UUID column). */
export const DEV_HAMZA_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Map known auth slugs to a UUID before binding to UUID-typed columns.
 * Legacy JWTs may still use `user-hamza`; seed Hamza uses `DEV_HAMZA_ID` directly.
 * Do not use for TEXT columns that intentionally store slugs (unless migrating to UUID).
 */
export function sanitizeUuid(id: string): string {
  if (id === 'user-hamza') return DEV_HAMZA_ID;
  return id;
}

// RLS compatibility: We use set_config('app.current_tenant', $1, true) inside BEGIN...COMMIT.
// That is transaction-scoped (like SET LOCAL). PgBouncer transaction mode resets session between
// transactions, so it works. Never use SET (without LOCAL) — that leaks state across transactions.

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return pool.query(text, params) as Promise<pg.QueryResult<T>>;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

/**
 * Runs a function within a tenant-scoped transaction.
 * Sets app.current_tenant so RLS policies enforce tenant isolation.
 * Use this for all queries against RLS-enabled tables.
 *
 * @param tenantId - UUID of the tenant (organization_id)
 * @param fn - Async function that receives the PoolClient and returns T
 */
export async function withTenantQuery<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
