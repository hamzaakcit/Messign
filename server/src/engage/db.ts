import pg from 'pg';

/**
 * The only DB access for engage code (ADR-002). Uses its own pool on the dedicated messign_engage role.
 * There is deliberately no fallback to DATABASE_URL: on Railway that is the postgres superuser, which ignores RLS.
 */
let pool: pg.Pool | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getEngagePool(): pg.Pool {
  if (pool) return pool;
  let connectionString = process.env.ENGAGE_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('ENGAGE_DATABASE_URL is required for engage (no fallback to DATABASE_URL).');
  }
  const railway = /rlwy\.net|railway\.app|railway\.net/.test(connectionString);
  if (railway) connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  pool = new pg.Pool({
    connectionString,
    max: 10,
    ...(railway ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on('error', (err) => console.error('[engage pool] idle client error', err));
  return pool;
}

export async function closeEngagePool(): Promise<void> {
  const p = pool;
  pool = null;
  if (p) await p.end();
}

/** Throws unless the engage connection is a role that cannot bypass RLS. */
export async function assertEngageRoleSafe(p: Pick<pg.Pool, 'query'> = getEngagePool()): Promise<string> {
  const r = await p.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const role = r.rows[0];
  if (!role) throw new Error('Could not determine the engage database role.');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `Engage database role "${role.rolname}" has SUPERUSER or BYPASSRLS, so RLS would not apply. ` +
        'Point ENGAGE_DATABASE_URL at the messign_engage role.',
    );
  }
  return role.rolname;
}

async function inTransaction<T>(setup: (client: pg.PoolClient) => Promise<void>, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getEngagePool().connect();
  try {
    await client.query('BEGIN');
    await setup(client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Runs fn in a transaction scoped to one organization. The setting is transaction-local, so it cannot leak across pooled use. */
export function withEngageTenant<T>(organizationId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(organizationId)) throw new Error('withEngageTenant requires a UUID organization id.');
  return inTransaction(
    (client) => client.query("SELECT set_config('app.current_tenant', $1, true)", [organizationId]).then(() => undefined),
    fn,
  );
}

/** Runs fn with no tenant but permission to read the one api_keys row whose hash is given (pre-auth lookup). */
export function withApiKeyLookup<T>(keyHash: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(
    (client) => client.query("SELECT set_config('engage.lookup_key_hash', $1, true)", [keyHash]).then(() => undefined),
    fn,
  );
}
