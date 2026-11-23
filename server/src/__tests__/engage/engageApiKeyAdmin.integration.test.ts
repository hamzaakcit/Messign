/**
 * API key revocation and the narrowed grants (WP-31, migrations 138-139) on real Postgres.
 * Acceptance: a revoked key is refused at once and the audit log says who revoked it; a key cannot be revoked through another
 * tenant; the engage role cannot rewrite a key's hash, scopes or limit, or delete a key.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('API key revocation (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let admin: typeof import('../../engage/apiKeyAdmin.js');
  let actor: typeof import('../../engage/actor.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    admin = await import('../../engage/apiKeyAdmin.js');
    actor = await import('../../engage/actor.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  async function newKey(org: string): Promise<{ id: string; key: string }> {
    const platform = token(f.platformUser, f.platformOrgId);
    const r = await app.http(`/admin/organizations/${org}/api-keys`, { method: 'POST', token: platform, body: { name: 'shop', scopes: ['ingest'] } });
    expect(r.status).toBe(201);
    return { id: r.json.id as string, key: r.json.apiKey as string };
  }

  it('a revoked key is refused on its next request, and the audit log names who revoked it', async () => {
    const org = f.A.organization.id;
    const k = await newKey(org);
    expect((await app.http('/key/me', { key: k.key })).status).toBe(200);
    const done = await actor.runAsActor('operator:api-key', () => admin.revokeApiKey(org, k.id));
    expect(done).toBe(true);
    expect((await app.http('/key/me', { key: k.key })).status).toBe(401);
    const entry = (await f.admin.query(`SELECT actor, details FROM engage.audit_log WHERE organization_id = $1 AND action = 'api_key.revoked' AND subject_id = $2`, [org, k.id])).rows[0];
    expect(entry).toMatchObject({ actor: 'operator:api-key' });
    expect(await admin.revokeApiKey(org, k.id)).toBe(false); // already revoked
  });

  it('lists keys without anything that could be used as one', async () => {
    const org = f.A.organization.id;
    const k = await newKey(org);
    const keys = await admin.listApiKeys(org);
    const mine = keys.find((x) => x.id === k.id)!;
    expect(mine).toMatchObject({ name: 'shop', scopes: ['ingest'], revokedAt: null });
    expect(JSON.stringify(keys)).not.toContain(k.key);
  });

  it('cannot revoke another tenant\'s key', async () => {
    const k = await newKey(f.A.organization.id);
    expect(await admin.revokeApiKey(f.B.organization.id, k.id)).toBe(false);
    expect((await app.http('/key/me', { key: k.key })).status).toBe(200);
  });

  it('the engage role can stamp usage and revocation, but not rewrite a key or delete it', async () => {
    const org = f.A.organization.id;
    const k = await newKey(org);
    await expect(sql(org, `UPDATE engage.api_keys SET last_used_at = now() WHERE id = $1`, [k.id])).resolves.toBeTruthy();
    await expect(sql(org, `UPDATE engage.api_keys SET key_hash = repeat('a', 64) WHERE id = $1`, [k.id])).rejects.toThrow(/permission denied/);
    await expect(sql(org, `UPDATE engage.api_keys SET scopes = ARRAY['ingest','journeys:trigger'] WHERE id = $1`, [k.id])).rejects.toThrow(/permission denied/);
    await expect(sql(org, `UPDATE engage.api_keys SET rate_limit_per_min = 1000000 WHERE id = $1`, [k.id])).rejects.toThrow(/permission denied/);
    await expect(sql(org, `DELETE FROM engage.api_keys WHERE id = $1`, [k.id])).rejects.toThrow(/permission denied/);
    expect((await app.http('/key/me', { key: k.key })).status).toBe(200);
  });

  it('each key is limited by its own number: a key with a low limit is cut off while another is not', async () => {
    const org = f.A.organization.id;
    const low = await newKey(org);
    const high = await newKey(org);
    await f.admin.query(`UPDATE engage.api_keys SET rate_limit_per_min = 3 WHERE id = $1`, [low.id]);
    const body = { events: [{ profileExternalId: 'p1', name: 'cart_updated', clientEventId: 'x' }] };
    const statuses = async (key: string, n: number) => (await Promise.all(Array.from({ length: n }, () => app.http('/v1/events:track', { key, body })))).map((r) => r.status);
    const lowStatuses = await statuses(low.key, 6);
    expect(lowStatuses.filter((s) => s === 429).length).toBe(3);
    const highStatuses = await statuses(high.key, 6);
    expect(highStatuses.filter((s) => s === 429).length).toBe(0);
  });
});
