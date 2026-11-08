import { describe, expect, it, vi } from 'vitest';

const rewrapTenant = vi.fn();
const query = vi.fn();
vi.mock('../../engage/credentials.js', () => ({ rewrapTenant: (...a: unknown[]) => rewrapTenant(...a) }));
vi.mock('../../db/index.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const { rewrapAllTenants } = await import('../../engage/bootstrap/rewrapAllTenants.js');
const { loadKeyring } = await import('../../engage/crypto.js');
const keyring = loadKeyring({ ENGAGE_MASTER_KEY: 'a1b2c3d4'.repeat(8) } as NodeJS.ProcessEnv);

describe('rewrapAllTenants', () => {
  it('re-wraps each tenant separately through the engage path and totals the result', async () => {
    query.mockResolvedValue({ rows: [{ organization_id: 'o1' }, { organization_id: 'o2' }, { organization_id: 'o3' }] });
    rewrapTenant.mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    await expect(rewrapAllTenants(keyring)).resolves.toEqual({ tenants: 3, rewrapped: 7 });
    expect(rewrapTenant.mock.calls.map((c) => c[0])).toEqual(['o1', 'o2', 'o3']);
    expect(rewrapTenant.mock.calls.every((c) => c[1] === keyring)).toBe(true);
  });
  it('stops at the first tenant that fails instead of skipping it', async () => {
    rewrapTenant.mockReset();
    query.mockResolvedValue({ rows: [{ organization_id: 'o1' }, { organization_id: 'o2' }] });
    rewrapTenant.mockRejectedValueOnce(new Error('cannot decrypt'));
    await expect(rewrapAllTenants(keyring)).rejects.toThrow('cannot decrypt');
    expect(rewrapTenant).toHaveBeenCalledTimes(1);
  });
});
