import pg from 'pg';
import os from 'os';
const { Pool } = pg;

// Local dev fallback: use current OS user (Mac username) instead of postgres
const localUser = process.env.USER || os.userInfo().username || 'postgres';
const localFallback = `postgresql://${localUser}@localhost:5432/messign`;

// Prefer public URL when set (for local migrations against Railway); otherwise DATABASE_URL (internal on Railway)
let connectionString =
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

// Longer timeout for remote DB (e.g. Railway public proxy); 2s is too short for SSL handshake + round-trip
const connectionTimeoutMillis = useUnsafeSSL ? 15000 : 2000;

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis,
  ...(useUnsafeSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return pool.query(text, params) as Promise<pg.QueryResult<T>>;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}
