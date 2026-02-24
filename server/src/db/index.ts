import pg from 'pg';
const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== 'production' ? 'postgresql://localhost:5432/messign_reimbursement' : undefined);

if (!connectionString) {
  throw new Error('DATABASE_URL is required in production. Set it in your environment.');
}

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return pool.query(text, params) as Promise<pg.QueryResult<T>>;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}
