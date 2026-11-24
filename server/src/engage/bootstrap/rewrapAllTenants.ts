import { loadKeyring, type Keyring } from '../crypto.js';
import { rewrapTenant } from '../credentials.js';

/**
 * Master-key rotation across tenants. Listing every tenant needs the admin pool (the engage role only sees one tenant
 * at a time), so this lives in bootstrap. Each tenant is re-wrapped in its own transaction through the engage role.
 */
export async function rewrapAllTenants(keyring: Keyring = loadKeyring()): Promise<{ tenants: number; rewrapped: number }> {
  const { pool } = await import('../../db/index.js');
  const orgs = await pool.query<{ organization_id: string }>('SELECT organization_id FROM engage.tenant_settings ORDER BY organization_id');
  let rewrapped = 0;
  for (const { organization_id } of orgs.rows) rewrapped += await rewrapTenant(organization_id, keyring);
  return { tenants: orgs.rows.length, rewrapped };
}
