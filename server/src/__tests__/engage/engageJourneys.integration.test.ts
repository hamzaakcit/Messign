/**
 * Journeys (WP-15) on real Postgres and the real HTTP stack: definitions, immutable versions, approval and activation.
 * Acceptance: an unapproved version cannot be activated, through the API or by writing to the database directly.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

const definition = (template = 'cart-reminder', extra: Record<string, unknown> = {}) => ({
  trigger: { type: 'event', event: 'cart_updated' },
  exit_when: [{ event: 'order_completed' }],
  steps: [
    { id: 'wait', type: 'delay', minutes: 60 },
    { id: 'remind', type: 'message', channel: 'email', template, purpose: 'marketing', ...extra },
  ],
});

describe.skipIf(!adminUrl)('journeys (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let J: typeof import('../../engage/journeys/journeys.js');
  let T: typeof import('../../engage/templates/templates.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  interface T0 { org: string; admin: string; member: string; adminUserId: string }
  const tenant = async (): Promise<T0> => {
    const t = await f.provisionTenant(`Jrn ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    await T.createTemplate(org, null, { key: 'cart-reminder', name: 'Sepet', subject: 'Sepetiniz', html: '<p>{{first_name}} <a href="{{unsubscribe_url}}">x</a></p>' });
    return { org, admin: token(t.admin.authUserId, org), member: token(member, org), adminUserId: t.admin.userId };
  };
  const create = async (t: T0, def: unknown = definition(), key = `cart-${u()}`) => {
    const r = await app.http('/journeys', { token: t.admin, body: { key, name: 'Sepet terk', definition: def } });
    expect(r.status).toBe(201);
    return (r.json.journey as { id: string }).id;
  };
  const act = (t: T0, path: string, who: 'admin' | 'member' = 'admin', b: unknown = {}) => app.http(path, { token: t[who], body: b });
  const versions = async (t: T0, id: string) => (await app.http(`/journeys/${id}`, { token: t.admin })).json.versions as Array<{ version: number; status: string }>;

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    J = await import('../../engage/journeys/journeys.js');
    T = await import('../../engage/templates/templates.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('acceptance: an unapproved version cannot be activated', () => {
    it('through the API', async () => {
      const t = await tenant(); const id = await create(t);
      const r = await act(t, `/journeys/${id}/versions/1/activate`);
      expect(r).toMatchObject({ status: 409, json: { error: 'Version 1 is not approved' } });
      expect((await versions(t, id))[0]).toMatchObject({ version: 1, status: 'draft' });
      const key = ((await app.http(`/journeys/${id}`, { token: t.admin })).json.journey as { key: string }).key;
      expect(await J.getActiveJourneyVersion(t.org, key)).toBeNull();
    });

    it('by writing to the database directly, as the engage role (the CHECK refuses it)', async () => {
      const t = await tenant(); const id = await create(t);
      await expect(sql(t.org, `UPDATE engage.journey_versions SET activated_at = now(), activated_by = $2 WHERE journey_id = $1`, [id, t.adminUserId]))
        .rejects.toThrow(/journey_versions_check/);
    });

    it('even by the database owner, who bypasses RLS and grants', async () => {
      const t = await tenant(); const id = await create(t);
      await expect(f.admin.query(`UPDATE engage.journey_versions SET activated_at = now(), activated_by = $2 WHERE journey_id = $1`, [id, t.adminUserId]))
        .rejects.toThrow(/check constraint/);
    });
  });

  describe('lifecycle', () => {
    it('draft -> approved -> active, recording who and when; repeating a step is refused or a no-op', async () => {
      const t = await tenant(); const id = await create(t);
      const ap = await act(t, `/journeys/${id}/versions/1/approve`);
      expect(ap).toMatchObject({ status: 200, json: { version: { status: 'approved', approvedBy: t.adminUserId } } });
      expect((await act(t, `/journeys/${id}/versions/1/approve`)).status).toBe(409);
      const on = await act(t, `/journeys/${id}/versions/1/activate`);
      expect(on).toMatchObject({ status: 200, json: { version: { status: 'active', activatedBy: t.adminUserId } } });
      const v = on.json.version as { createdAt: string; approvedAt: string; activatedAt: string };
      expect(v.createdAt <= v.approvedAt && v.approvedAt <= v.activatedAt).toBe(true);
      expect(await act(t, `/journeys/${id}/versions/1/activate`)).toMatchObject({ status: 200, json: { version: { status: 'active' } } });
      expect((await app.http('/journeys', { token: t.admin })).json.journeys).toMatchObject([{ id, activeVersion: 1, latestVersion: 1 }]);
    });

    it('activating a new version retires the old one; a retired version never comes back', async () => {
      const t = await tenant(); const id = await create(t);
      await act(t, `/journeys/${id}/versions/1/approve`); await act(t, `/journeys/${id}/versions/1/activate`);
      expect((await act(t, `/journeys/${id}/versions`, 'admin', { definition: definition('cart-reminder', { template_version: 1 }) })).status).toBe(201);
      await act(t, `/journeys/${id}/versions/2/approve`); await act(t, `/journeys/${id}/versions/2/activate`);
      expect((await versions(t, id)).map((v) => `${v.version}:${v.status}`)).toEqual(['2:active', '1:retired']);
      expect(await act(t, `/journeys/${id}/versions/1/activate`)).toMatchObject({ status: 409, json: { error: expect.stringMatching(/retired/) } });
    });

    it('stopping a journey leaves nothing active; it can be started again with an approved version', async () => {
      const t = await tenant(); const key = `stop-${u()}`; const id = await create(t, definition(), key);
      await act(t, `/journeys/${id}/versions/1/approve`); await act(t, `/journeys/${id}/versions/1/activate`);
      expect(await J.getActiveJourneyVersion(t.org, key)).toMatchObject({ journeyId: id, version: { version: 1 } });
      expect(await act(t, `/journeys/${id}/deactivate`)).toMatchObject({ status: 200, json: { retiredVersion: 1 } });
      expect(await J.getActiveJourneyVersion(t.org, key)).toBeNull();
      expect(await act(t, `/journeys/${id}/deactivate`)).toMatchObject({ status: 200, json: { retiredVersion: null } });
      await act(t, `/journeys/${id}/versions`, 'admin', { definition: definition() });
      await act(t, `/journeys/${id}/versions/2/approve`);
      expect(await act(t, `/journeys/${id}/versions/2/activate`)).toMatchObject({ status: 200 });
    });

    it('activations at the same moment all succeed, one after the other, leaving exactly one active version', async () => {
      const t = await tenant(); const id = await create(t);
      for (let i = 2; i <= 4; i += 1) await act(t, `/journeys/${id}/versions`, 'admin', { definition: definition() });
      for (let i = 1; i <= 4; i += 1) await act(t, `/journeys/${id}/versions/${i}/approve`);
      // Open the connections first, or the first activation finishes before the others even connect.
      await Promise.all(Array.from({ length: 8 }, () => sql(t.org, 'SELECT pg_sleep(0.1)')));
      const results = await Promise.allSettled([1, 2, 3, 4].map((i) => J.activateJourneyVersion(t.org, t.adminUserId, id, i)));
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
      const vs = await versions(t, id);
      expect(vs.filter((v) => v.status === 'active')).toHaveLength(1);
      expect(vs.filter((v) => v.status === 'retired')).toHaveLength(3);
    });

    it('the database refuses: changing a definition, undoing a step, deleting, or two active versions', async () => {
      const t = await tenant(); const id = await create(t);
      await act(t, `/journeys/${id}/versions/1/approve`); await act(t, `/journeys/${id}/versions/1/activate`);
      await act(t, `/journeys/${id}/versions`, 'admin', { definition: definition() });
      await act(t, `/journeys/${id}/versions/2/approve`);
      await expect(sql(t.org, `UPDATE engage.journey_versions SET definition = '{}'::jsonb WHERE journey_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `UPDATE engage.journey_versions SET approved_at = NULL, approved_by = NULL WHERE journey_id = $1 AND version = 2`, [id])).rejects.toThrow(/cannot be changed or undone/);
      await expect(sql(t.org, `UPDATE engage.journey_versions SET approved_at = now() WHERE journey_id = $1 AND version = 1`, [id])).rejects.toThrow(/cannot be changed or undone/);
      await expect(sql(t.org, `DELETE FROM engage.journey_versions WHERE journey_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `UPDATE engage.journeys SET key = 'x' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `UPDATE engage.journey_versions SET activated_at = now(), activated_by = $2 WHERE journey_id = $1 AND version = 2`, [id, t.adminUserId]))
        .rejects.toThrow(/journey_versions_one_active_uq/);
      // A version that was never active cannot be marked retired (it would hide that it never ran).
      await expect(f.admin.query(`UPDATE engage.journey_versions SET deactivated_at = now(), deactivated_by = $2 WHERE journey_id = $1 AND version = 2`, [id, t.adminUserId]))
        .rejects.toThrow(/check constraint/);
      // The owner cannot rewrite a definition either (trigger), even though grants do not apply to it.
      await expect(f.admin.query(`UPDATE engage.journey_versions SET definition = '{}'::jsonb WHERE journey_id = $1`, [id])).rejects.toThrow(/immutable/);
    });
  });

  describe('definitions', () => {
    it('refuses an invalid definition with the reasons, and stores nothing', async () => {
      const t = await tenant();
      const bad = { trigger: { type: 'event', event: 'cart_updated' }, steps: [{ id: 'a', type: 'delay', minutes: 1, next: 'a' }] };
      const r = await app.http('/journeys', { token: t.admin, body: { key: `bad-${u()}`, name: 'x', definition: bad } });
      expect(r).toMatchObject({ status: 400, json: { issues: [{ path: 'steps[0]', message: 'a step cannot go to itself' }] } });
      expect((await app.http('/journeys', { token: t.admin })).json.journeys).toEqual([]);
    });

    it('refuses templates that do not exist in this tenant, or a version the template does not have', async () => {
      const t = await tenant();
      const r1 = await app.http('/journeys', { token: t.admin, body: { key: `m-${u()}`, name: 'x', definition: definition('no-such-template') } });
      expect(r1).toMatchObject({ status: 400, json: { issues: [{ message: 'no template with key "no-such-template"' }] } });
      const r2 = await app.http('/journeys', { token: t.admin, body: { key: `m-${u()}`, name: 'x', definition: definition('cart-reminder', { template_version: 7 }) } });
      expect(r2).toMatchObject({ status: 400, json: { issues: [{ message: 'template "cart-reminder" has no version 7' }] } });
    });

    it('validate checks schema, graph and templates without storing anything', async () => {
      const t = await tenant();
      expect((await app.http('/journeys/validate', { token: t.member, body: { definition: definition() } })).json).toEqual({ ok: true, errors: [] });
      expect((await app.http('/journeys/validate', { token: t.member, body: { definition: definition('missing') } })).json).toMatchObject({ ok: false });
      expect((await app.http('/journeys/validate', { token: t.member, body: {} })).json).toMatchObject({ ok: false });
      expect((await app.http('/journeys', { token: t.admin })).json.journeys).toEqual([]);
    });

    it('a duplicate key is a conflict', async () => {
      const t = await tenant(); await create(t, definition(), 'same-key');
      expect((await app.http('/journeys', { token: t.admin, body: { key: 'same-key', name: 'x', definition: definition() } })).status).toBe(409);
    });
  });

  describe('roles and tenants', () => {
    it('members read and validate; only admins create, publish, approve, activate or stop', async () => {
      const t = await tenant(); const id = await create(t);
      expect((await app.http('/journeys', { token: t.member })).status).toBe(200);
      expect((await app.http(`/journeys/${id}`, { token: t.member })).status).toBe(200);
      for (const path of ['/journeys', `/journeys/${id}/versions`, `/journeys/${id}/versions/1/approve`, `/journeys/${id}/versions/1/activate`, `/journeys/${id}/deactivate`]) {
        expect((await act(t, path, 'member', { key: 'k', name: 'n', definition: definition() })).status).toBe(403);
      }
      expect((await app.http('/journeys')).status).toBe(401);
      expect((await versions(t, id))[0]).toMatchObject({ status: 'draft' });
    });

    it('another tenant cannot see, approve, activate or stop it, nor use its templates', async () => {
      const a = await tenant(); const b = await tenant(); const id = await create(a);
      expect((await app.http('/journeys', { token: b.admin })).json.journeys).toEqual([]);
      for (const path of [`/journeys/${id}/versions/1/approve`, `/journeys/${id}/versions/1/activate`, `/journeys/${id}/deactivate`, `/journeys/${id}/versions`]) {
        expect((await act(b, path, 'admin', { definition: definition() })).status).toBe(404);
      }
      expect((await app.http(`/journeys/${id}`, { token: b.admin })).status).toBe(404);
      await T.createTemplate(a.org, null, { key: 'only-in-a', name: 'x', subject: 's', html: '<p>x</p>' });
      expect((await app.http('/journeys', { token: b.admin, body: { key: 'x', name: 'x', definition: definition('only-in-a') } })).status).toBe(400);
      expect((await versions(a, id))[0]).toMatchObject({ status: 'draft' });
    });
  });

  it('defining and activating a journey sends nothing', async () => {
    const t = await tenant(); const id = await create(t);
    await act(t, `/journeys/${id}/versions/1/approve`); await act(t, `/journeys/${id}/versions/1/activate`);
    expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(0);
  });
});
