/**
 * Tenant-isolation adversarial suite (target-state section A, tests 1, 2, 3, 4, 7, 8) on real Postgres, connected
 * as the non-bypass messign_engage role. Table checks are generic: they enumerate the engage schema, so a new
 * table is covered as soon as it exists, and fails until it has a seeder in helpers/seeders.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { signAccess } from '../../utils/jwt.js';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { SEEDERS } from './helpers/seeders.js';

describe.skipIf(!adminUrl)('engage tenant isolation (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let tables: string[] = [];
  let C: string;

  beforeAll(async () => {
    f = await setupTenancyFixture();
    const t = await f.admin.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'engage' AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`);
    tables = t.rows.map((r) => r.relname);
    const c = await f.admin.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, product) VALUES ('Charlie', $1, 'engage') RETURNING id`, [`charlie-${f.suffix}`]);
    C = c.rows[0]!.id;
    const client = await f.admin.connect();
    try {
      for (const table of tables) {
        const seed = SEEDERS[table];
        if (!seed) continue;
        for (const org of [f.A.organization.id, f.B.organization.id]) {
          if (table === 'tenant_settings') continue;
          await seed(client, org);
        }
      }
    } finally { client.release(); }
  }, 60_000);

  afterAll(async () => {
    if (!f) return;
    await f.admin.query('DELETE FROM organizations WHERE id = $1', [C]);
    await f.teardown();
  });

  it('every engage table has a registered seeder (new tables must be added to helpers/seeders.ts)', () => {
    expect(tables.length).toBeGreaterThanOrEqual(3);
    expect(tables.filter((t) => !SEEDERS[t])).toEqual([]);
  });

  describe('test 3: schema guard', () => {
    it('every engage table has ENABLE + FORCE RLS and organization_id NOT NULL', async () => {
      const r = await f.admin.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
               EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND a.attnotnull) AS has_org
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'engage' AND c.relkind IN ('r', 'p') AND NOT c.relispartition`);
      expect(r.rows.length).toBeGreaterThanOrEqual(3);
      for (const row of r.rows) expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, has_org: true });
    });

    it('every policy is bound to the tenant (or the key-hash lookup), never permissive', async () => {
      const r = await f.admin.query<{ tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }>(
        `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'engage'`);
      for (const t of tables) expect(r.rows.filter((p) => p.tablename === t).length, `${t} has no policy`).toBeGreaterThan(0);
      for (const p of r.rows) {
        // The only non-tenant reads: the API-key lookup by hash, and (WP-12) the webhook lookup of ONE channel account by id.
        const bound = p.tablename === 'channel_accounts' && p.cmd === 'SELECT' ? /current_org_id|lookup_account_id/ : /current_org_id|lookup_key_hash/;
        expect(p.qual ?? '', `${p.tablename}.${p.policyname} USING`).toMatch(bound);
        if (p.cmd !== 'SELECT') expect(p.with_check ?? '', `${p.tablename}.${p.policyname} WITH CHECK`).toMatch(/current_org_id/);
        expect(p.cmd === 'SELECT' || /current_org_id/.test(p.qual ?? ''), `${p.tablename}.${p.policyname} writes must use the tenant`).toBe(true);
      }
    });

    it('the engage role holds no privileges on any legacy (public) table', async () => {
      const r = await f.admin.query(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'messign_engage' AND table_schema = 'public'`);
      expect(r.rows).toEqual([]);
    });
  });

  describe('test 1: cross-tenant access, per table', () => {
    it('for every engage table, A cannot read, update, delete, move or insert B rows', async () => {
      const A = f.A.organization.id;
      const B = f.B.organization.id;
      for (const table of tables) {
        await f.engage.withEngageTenant(A, async (c) => {
          const own = await c.query(`SELECT DISTINCT organization_id FROM engage.${table}`);
          expect(own.rows.map((r) => r.organization_id), `${table} visible orgs`).toEqual([A]);
          expect((await c.query(`SELECT 1 FROM engage.${table} WHERE organization_id = $1`, [B])).rowCount, `${table} read B`).toBe(0);
        });
        for (const [what, sql] of [
          ['update', `UPDATE engage.${table} SET organization_id = organization_id WHERE organization_id = $1`],
          ['delete', `DELETE FROM engage.${table} WHERE organization_id = $1`],
        ] as const) {
          // Affecting zero rows, or being forbidden outright by the table's privileges, are both safe.
          const hits = await f.engage.withEngageTenant(A, async (c) => (await c.query(sql, [B])).rowCount ?? 0).catch((e) => {
            if (/permission denied/.test(String(e))) return 0;
            throw e;
          });
          expect(hits, `${table} ${what} B rows`).toBe(0);
        }
        await expect(f.engage.withEngageTenant(A, (c) =>
          c.query(`UPDATE engage.${table} SET organization_id = $1 WHERE organization_id = $2`, [B, A]),
        ), `${table} move A row to B`).rejects.toThrow(/row-level security|permission denied/);
        await expect(f.engage.withEngageTenant(A, async (c) => SEEDERS[table]!(c, C)), `${table} insert for another org`).rejects.toThrow(/row-level security/);
        const bRows = await f.admin.query(`SELECT count(*)::int AS n FROM engage.${table} WHERE organization_id = $1`, [B]);
        expect(bRows.rows[0].n, `${table} B rows intact`).toBeGreaterThan(0);
      }
    });
  });

  describe('test 2: no tenant context', () => {
    it('every table returns nothing and accepts no writes', async () => {
      const pool = f.engage.getEngagePool();
      for (const table of tables) {
        expect((await pool.query(`SELECT 1 FROM engage.${table}`)).rowCount, table).toBe(0);
        const client = await pool.connect();
        try {
          await expect(SEEDERS[table]!(client, f.A.organization.id), `${table} write without tenant`).rejects.toThrow(/row-level security/);
        } finally { client.release(); }
      }
    });
    it('an empty tenant setting is treated as no tenant', async () => {
      const client = await f.engage.getEngagePool().connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', '', true)");
        for (const t of tables) expect((await client.query(`SELECT 1 FROM engage.${t}`)).rowCount, t).toBe(0);
        await client.query('COMMIT');
      } finally { client.release(); }
    });
  });

  describe('test 8: one pooled connection, many tenants', () => {
    it('A, B, A on the same client never leaks, and nothing remains after COMMIT', async () => {
      const client = await f.engage.getEngagePool().connect();
      try {
        for (const [org, other] of [[f.A, f.B], [f.B, f.A], [f.A, f.B], [f.B, f.A]] as const) {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_tenant', $1, true)", [org.organization.id]);
          for (const t of tables) {
            const seen = (await client.query(`SELECT DISTINCT organization_id FROM engage.${t}`)).rows.map((r) => r.organization_id);
            expect(seen, t).toEqual([org.organization.id]);
            expect(seen, t).not.toContain(other.organization.id);
          }
          await client.query('COMMIT');
          for (const t of tables) expect((await client.query(`SELECT 1 FROM engage.${t}`)).rowCount, t).toBe(0);
        }
      } finally { client.release(); }
    });
    it('a rolled-back or failed transaction does not leave a tenant behind', async () => {
      const pool = f.engage.getEngagePool();
      await expect(f.engage.withEngageTenant(f.A.organization.id, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      const client = await pool.connect();
      try {
        expect((await client.query(`SELECT current_setting('app.current_tenant', true) AS t`)).rows[0].t ?? '').toBe('');
        expect((await client.query('SELECT 1 FROM engage.tenant_settings')).rowCount).toBe(0);
      } finally { client.release(); }
    });
  });

  describe('tests 4 and 7: over HTTP', () => {
    let server: Server;
    let base: string;
    const logs: string[] = [];
    const bodies: string[] = [];
    const spies: Array<ReturnType<typeof vi.spyOn>> = [];

    const token = (sub: string, org?: string) => signAccess({ sub, role: 'admin', ...(org ? { organizationId: org } : {}) });
    async function http(path: string, opts: { token?: string; key?: string; body?: unknown; headers?: Record<string, string> } = {}) {
      const r = await fetch(base + path, {
        method: opts.body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.key ? { 'x-api-key': opts.key } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const text = await r.text();
      bodies.push(text);
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text); } catch { /* non-JSON body */ }
      return { status: r.status, json };
    }

    beforeAll(async () => {
      for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); }));
      }
      // Loaded after the fixture: authMiddleware pulls in the legacy pool, which must already point at the scratch DB.
      const { optionalJwt } = await import('../../middleware/authMiddleware.js');
      const { engageRouter } = await import('../../engage/routes.js');
      const app = express();
      app.use(express.json());
      app.use('/api', optionalJwt);
      app.use('/api/engage', engageRouter);
      await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/engage`;
    });
    afterAll(async () => {
      spies.forEach((s) => s.mockRestore());
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    });

    it('a tenant user only ever resolves to their own organization', async () => {
      const A = f.A.organization.id; const B = f.B.organization.id;
      const ok = await http('/me', { token: token(f.A.admin.authUserId, A) });
      expect(ok.status).toBe(200);
      expect(ok.json.organizationId).toBe(A);
      expect((await http('/me', { token: token(f.A.admin.authUserId, B) })).status).toBe(403);
      expect((await http('/me', { token: token(f.A.admin.authUserId) })).status).toBe(401);
      expect((await http('/me', { token: token(f.B.admin.authUserId, A) })).status).toBe(403);
      const spoofed: Array<Record<string, string>> = [{ 'x-organization-id': B }, { 'x-tenant-id': B }, { 'x-user-id': f.B.admin.authUserId }];
      for (const h of spoofed) {
        const r = await http('/me', { token: token(f.A.admin.authUserId, A), headers: h });
        expect(r.json.organizationId, JSON.stringify(h)).toBe(A);
      }
    });

    it('an API key resolves to its own organization whatever the request claims', async () => {
      const a = f.keys.generateApiKey();
      await f.engage.withEngageTenant(f.A.organization.id, (c) => c.query(
        `INSERT INTO engage.api_keys (organization_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'http', $2, $3, '{ingest}')`,
        [f.A.organization.id, a.prefix, a.hash]));
      const r = await http('/key/me', { key: a.plaintext, headers: { 'x-organization-id': f.B.organization.id, 'x-tenant-id': f.B.organization.id } });
      expect(r.status).toBe(200);
      expect(r.json.organizationId).toBe(f.A.organization.id);
    });

    it('a tenant admin cannot use platform routes, for their own or another organization', async () => {
      const t = token(f.A.admin.authUserId, f.A.organization.id);
      expect((await http('/admin/organizations', { token: t, body: { name: 'Evil', slug: 'evil', adminEmail: 'e@x.example.com', adminFullName: 'Evil Admin' } })).status).toBe(403);
      for (const org of [f.A.organization.id, f.B.organization.id]) {
        expect((await http(`/admin/organizations/${org}/api-keys`, { token: t, body: { name: 'k', scopes: ['ingest'] } })).status).toBe(403);
      }
      const evil = await f.admin.query(`SELECT 1 FROM organizations WHERE slug = 'evil'`);
      expect(evil.rowCount).toBe(0);
    });

    it('every engage route, including those in nested routers, starts with an authentication middleware', async () => {
      const { engageRouter } = await import('../../engage/routes.js');
      const guards = [f.auth.requireEngageUser, f.auth.requireApiKey, f.auth.requirePlatformAdmin];
      interface Layer { route?: { path: string; stack: Array<{ handle: unknown }> }; handle?: { stack?: Layer[] } }
      const found: Array<{ path: string; first: unknown }> = [];
      const walk = (stack: Layer[], prefix: string) => {
        for (const l of stack) {
          if (l.route) found.push({ path: `${prefix}${l.route.path}`, first: l.route.stack[0]!.handle });
          else if (l.handle?.stack) walk(l.handle.stack, `${prefix}(nested)`);
        }
      };
      walk((engageRouter as unknown as { stack: Layer[] }).stack, '');
      expect(found.length).toBeGreaterThanOrEqual(9);
      expect(found.some((r) => r.path.startsWith('(nested)')), 'nested routers must be inspected').toBe(true);
      // Provider webhooks authenticate by signature; their guard is accepted on /webhooks routes only.
      const { requireWebhookAccount } = await import('../../engage/webhookRoutes.js');
      for (const r of found) {
        const ok = guards.includes(r.first as never) || (r.first === requireWebhookAccount && r.path === '(nested)/:accountId');
        expect(ok, `${r.path} must start with an auth middleware`).toBe(true);
      }
      expect(found.filter((r) => r.first === requireWebhookAccount)).toHaveLength(1);
    });

    it('test 7: secrets are never logged or returned after creation', async () => {
      const t = token(f.platformUser, f.platformOrgId);
      const prov = await http('/admin/organizations', { token: t, body: { name: 'Delta', slug: `delta-${f.suffix}`, adminEmail: `d@delta-${f.suffix}.example.com`, adminFullName: 'Delta Admin' } });
      expect(prov.status).toBe(201);
      const org = prov.json.organization as { id: string };
      const password = prov.json.temporaryPassword as string;
      const hash = (await f.admin.query('SELECT password_hash FROM employee_auth WHERE email = $1', [`d@delta-${f.suffix}.example.com`])).rows[0].password_hash as string;
      const created = await http(`/admin/organizations/${org.id}/api-keys`, { token: t, body: { name: 'k', scopes: ['ingest'] } });
      expect(created.status).toBe(201);
      const plaintext = created.json.apiKey as string;
      const keyHash = f.keys.hashApiKey(plaintext);
      await http('/key/me', { key: plaintext });
      await http('/key/me', { key: 'mke_aaaaaaaa_' + 'x'.repeat(40) });
      await http('/admin/organizations', { token: t, body: { name: 'Delta', slug: `delta-${f.suffix}`, adminEmail: `d2@delta-${f.suffix}.example.com`, adminFullName: 'Delta Two' } });
      await http('/admin/organizations', { token: t, body: { name: 'x' } });

      await f.admin.query('DELETE FROM employee_auth WHERE email = $1', [`d@delta-${f.suffix}.example.com`]);
      await f.admin.query('DELETE FROM organizations WHERE id = $1', [org.id]);

      const secrets = { plaintext, password, hash, keyHash };
      const everything = logs.join('\n');
      for (const [name, value] of Object.entries(secrets)) expect(everything.includes(value), `${name} appeared in logs`).toBe(false);
      const created2 = bodies.filter((b) => b.includes(plaintext) || b.includes(password));
      expect(created2.length, 'plaintext key and password appear only in their creation responses').toBe(2);
      for (const b of bodies) {
        expect(b.includes(keyHash), 'key hash returned').toBe(false);
        expect(b.includes(hash), 'password hash returned').toBe(false);
        expect(b).not.toMatch(/key_hash|password_hash/);
      }
    });
  });
});
