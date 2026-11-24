/**
 * The engage audit log (WP-31, migration 138) on real Postgres and the real HTTP stack.
 * Acceptance: every control-plane change is recorded by the database in the same transaction, with who did it; nothing
 * secret or personal is recorded; the log is append-only for every role; the per-tenant hash chain verifies, and an edited,
 * removed or re-ordered entry is found; tenants see only their own; concurrent changes leave no gap or fork.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5499/scratch npx vitest run src/__tests__/engage/engageAudit.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

interface Row { seq: number; actor: string; action: string; subject_type: string; subject_id: string | null; details: Record<string, unknown>; prev_hash: string; entry_hash: string }

describe.skipIf(!adminUrl)('engage audit log (real Postgres, HTTP)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let creds: typeof import('../../engage/credentials.js');
  let audit: typeof import('../../engage/audit.js');
  let gateConfig: typeof import('../../engage/messaging/gateConfig.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));
  const rows = async (org: string): Promise<Row[]> =>
    (await f.admin.query<Row>(`SELECT seq::int, actor, action, subject_type, subject_id, details, prev_hash, entry_hash FROM engage.audit_log WHERE organization_id = $1 ORDER BY seq`, [org])).rows;
  const actions = async (org: string) => (await rows(org)).map((r) => r.action);
  const verify = async (org: string) => (await f.admin.query(`SELECT ok, entries::int, first_bad_seq::int, head_seq::int FROM engage.verify_audit_chain($1)`, [org])).rows[0];
  /** Tamper as the database owner would: the only way to change a row is to switch the protection off and on again. */
  async function tamper(fn: (c: import('pg').PoolClient) => Promise<void>): Promise<void> {
    const c = await f.admin.connect();
    try {
      await c.query('BEGIN');
      await c.query('ALTER TABLE engage.audit_log DISABLE TRIGGER audit_log_immutable');
      await fn(c);
      await c.query('ALTER TABLE engage.audit_log ENABLE TRIGGER audit_log_immutable');
      await c.query('COMMIT');
    } catch (err) { await c.query('ROLLBACK').catch(() => undefined); throw err; } finally { c.release(); }
  }

  interface Tn { org: string; userId: string; admin: string; member: string }
  async function tenant(): Promise<Tn> {
    const t = await f.provisionTenant(`Audit ${u()}`);
    const org = t.organization.id;
    const member = `member-${u()}`;
    await f.admin.query(
      `INSERT INTO reimbursement_users (organization_id, tenant_id, auth_user_id, email, full_name, role, status) VALUES ($1, $1, $2, $3, 'Member', 'employee', 'active')`,
      [org, member, `${member}@example.com`]);
    return { org, userId: t.admin.userId, admin: token(t.admin.authUserId, org), member: token(member, org) };
  }

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.SEND_MODE = 'sandbox';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    creds = await import('../../engage/credentials.js');
    audit = await import('../../engage/audit.js');
    gateConfig = await import('../../engage/messaging/gateConfig.js');
    app = await startEngageApp();
  }, 90_000);
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  it('records the creation of a tenant, as the first entry of its chain', async () => {
    const t = await tenant();
    const r = await rows(t.org);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ seq: 1, action: 'tenant.created', subject_type: 'tenant', subject_id: t.org, actor: 'system', prev_hash: '0'.repeat(64) });
    expect(await verify(t.org)).toMatchObject({ ok: true, entries: 1, first_bad_seq: null, head_seq: 1 });
  });

  it('records settings changes with who made them, and only the values that changed', async () => {
    const t = await tenant();
    const gate = await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { timezone: 'Europe/Istanbul', quietHours: { start: '21:00', end: '09:00' }, frequencyCap: { max: 5, windowHours: 24 } } });
    expect(gate.status).toBe(200);
    const sender = await app.http('/settings/sender', { method: 'PUT', token: t.admin, body: { senderName: 'Demo Kitap' } });
    expect(sender.status).toBe(200);
    const changes = (await rows(t.org)).filter((r) => r.action === 'settings.changed');
    expect(changes).toHaveLength(2);
    expect(changes[0]!.actor).toBe(`user:${t.userId}`);
    expect(changes[0]!.details).toMatchObject({
      quiet_hours_start: { from: null, to: '21:00:00' },
      quiet_hours_end: { from: null, to: '09:00:00' },
      frequency_cap_max: { from: 3, to: 5 },
      frequency_cap_window_hours: { from: 168, to: 24 },
    });
    expect(changes[0]!.details).not.toHaveProperty('timezone'); // unchanged, so not recorded
    expect(changes[1]!.details).toMatchObject({ sender_name: { from: null, to: 'Demo Kitap' } });
    expect(await verify(t.org)).toMatchObject({ ok: true });
  });

  it('records turning sending on and off (the kill switch) with the acting user', async () => {
    const t = await tenant();
    await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label: `mock-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } });
    await f.admin.query(`INSERT INTO engage.rate_cards (organization_id, channel, category, route, unit_cost_minor, currency) VALUES ($1, 'email', 'marketing', 'default', 1, 'TRY')`, [t.org]);
    await f.admin.query(`INSERT INTO engage.budget_caps (organization_id, channel, monthly_cap_minor, currency) VALUES ($1, 'email', 1000000, 'TRY')`, [t.org]);
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    expect((await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } })).status).toBe(200);
    expect((await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: false } })).status).toBe(200);
    const sw = (await rows(t.org)).filter((r) => r.action.startsWith('sending.'));
    expect(sw.map((r) => [r.action, r.actor])).toEqual([['sending.turned_on', `user:${t.userId}`], ['sending.turned_off', `user:${t.userId}`]]);
  });

  it('a refused change leaves no entry (the entry commits with the change, not before it)', async () => {
    const t = await tenant();
    const before = (await rows(t.org)).length;
    const refused = await app.http('/settings/send-enabled', { method: 'PUT', token: t.admin, body: { enabled: true } });
    expect(refused.status).toBe(409);
    expect((await rows(t.org)).length).toBe(before);
  });

  it('records channel accounts, rotation and disabling without a trace of the secret', async () => {
    const t = await tenant();
    const secret = `sk_live_${u()}${u()}`;
    const label = `mock-${u()}`;
    const acc = await creds.createAccount(t.org, t.userId, { channel: 'email', provider: 'mock', mode: 'test', label, config: {}, secrets: { webhook_secret: secret } });
    const newSecret = `sk_live_${u()}${u()}`;
    const rotated = await creds.rotateAccount(t.org, t.userId, acc.id, { secrets: { webhook_secret: newSecret } });
    await creds.disableAccount(t.org, rotated.id);
    const r = await rows(t.org);
    expect(r.filter((x) => x.subject_type === 'channel_account').map((x) => x.action)).toEqual(
      ['channel_account.created', 'channel_account.disabled', 'channel_account.created', 'channel_account.disabled']);
    const all = JSON.stringify(r);
    expect(all).not.toContain(secret);
    expect(all).not.toContain(newSecret);
    expect(all).not.toMatch(/ciphertext|wrapped_data_key|secret_/);
    expect(r.find((x) => x.action === 'channel_account.created')!.details).toMatchObject({ channel: 'email', provider: 'mock', mode: 'test', label });
  });

  it('records allow-list changes by id and channel, never the address', async () => {
    const t = await tenant();
    const address = `staff-${u()}@example.com`;
    const { id } = await gateConfig.addAllowlistEntry(t.org, 'email', address, { label: 'Hamza private' });
    expect(await gateConfig.removeAllowlistEntry(t.org, id)).toBe(true);
    const r = (await rows(t.org)).filter((x) => x.subject_type === 'allowlist_entry');
    expect(r.map((x) => x.action)).toEqual(['allowlist.added', 'allowlist.removed']);
    expect(r.every((x) => x.subject_id === id && JSON.stringify(x.details) === '{"channel":"email"}')).toBe(true);
    const all = JSON.stringify(await rows(t.org));
    expect(all).not.toContain(address);
    expect(all).not.toContain('Hamza private');
  });

  it('records budget caps, rate cards and readiness items', async () => {
    const t = await tenant();
    expect((await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: 5000, currency: 'TRY' } })).status).toBe(200);
    expect((await app.http('/settings/budget-caps/email', { method: 'PUT', token: t.admin, body: { monthlyCapMinor: 9000, currency: 'TRY' } })).status).toBe(200);
    expect((await app.http('/settings/rate-cards', { method: 'POST', token: t.admin, body: { channel: 'email', category: 'marketing', unitCostMinor: 7, currency: 'TRY' } })).status).toBe(201);
    expect((await app.http('/settings/readiness/email/dpa_signed', { method: 'PUT', token: t.admin, body: { value: 'signed 2026-02-01', evidenceUrl: 'https://example.com/dpa.pdf' } })).status).toBe(200);
    const r = await rows(t.org);
    expect(r.filter((x) => x.action === 'budget_cap.set').map((x) => x.details.monthly_cap_minor)).toEqual([5000, 9000]);
    expect(r.find((x) => x.action === 'rate_card.added')!.details).toMatchObject({ channel: 'email', unit_cost_minor: 7, currency: 'TRY' });
    expect(r.find((x) => x.action === 'readiness.recorded')!.details).toMatchObject({ channel: 'email', item: 'dpa_signed', evidence_url: 'https://example.com/dpa.pdf' });
    expect(r.every((x) => x.actor === `user:${t.userId}` || x.action === 'tenant.created')).toBe(true);
  });

  it('records API keys created by a platform admin, without the key or its hash', async () => {
    const t = await tenant();
    const platformToken = token(f.platformUser, f.platformOrgId);
    const made = await app.http(`/admin/organizations/${t.org}/api-keys`, { method: 'POST', token: platformToken, body: { name: 'shop backend', scopes: ['ingest'] } });
    expect(made.status).toBe(201);
    const plaintext = made.json.apiKey as string;
    const entry = (await rows(t.org)).find((x) => x.action === 'api_key.created')!;
    expect(entry.details).toMatchObject({ name: 'shop backend', scopes: ['ingest'], key_prefix: made.json.prefix });
    const hash = (await f.admin.query<{ key_hash: string }>('SELECT key_hash FROM engage.api_keys WHERE id = $1', [made.json.id])).rows[0]!.key_hash;
    const all = JSON.stringify(await rows(t.org));
    expect(all).not.toContain(plaintext);
    expect(all).not.toContain(hash);
    await f.admin.query('UPDATE engage.api_keys SET revoked_at = now() WHERE id = $1', [made.json.id]);
    expect((await actions(t.org)).filter((a) => a.startsWith('api_key.'))).toEqual(['api_key.created', 'api_key.revoked']);
  });

  it('records the journey lifecycle against the people who did it', async () => {
    const t = await tenant();
    const T = await import('../../engage/templates/templates.js');
    await T.createTemplate(t.org, null, { key: 'cart-reminder', name: 'Cart', subject: 'Cart', html: '<p>{{first_name}} <a href="{{unsubscribe_url}}">x</a></p>' });
    const def = { trigger: { type: 'event', event: 'cart_updated' }, exit_when: [{ event: 'order_completed' }],
      steps: [{ id: 'wait', type: 'delay', minutes: 60 }, { id: 'remind', type: 'message', channel: 'email', template: 'cart-reminder', purpose: 'marketing' }] };
    const created = await app.http('/journeys', { token: t.admin, body: { key: `cart-${u()}`, name: 'Cart', definition: def } });
    expect(created.status).toBe(201);
    const id = (created.json.journey as { id: string }).id;
    const approve = await app.http(`/journeys/${id}/versions/1/approve`, { token: t.admin, body: {} });
    const activate = await app.http(`/journeys/${id}/versions/1/activate`, { token: t.admin, body: {} });
    expect([approve.status, activate.status]).toEqual([200, 200]);
    const j = (await rows(t.org)).filter((x) => x.action.startsWith('journey.'));
    expect(j.map((x) => x.action)).toEqual(['journey.version_created', 'journey.version_approved', 'journey.version_activated']);
    expect(j.every((x) => x.actor === `user:${t.userId}`)).toBe(true);
    expect(j[1]!.details).toMatchObject({ journey_id: id, version: 1 });
  });

  describe('the chain', () => {
    async function busyTenant(changes = 6): Promise<Tn> {
      const t = await tenant();
      for (let i = 0; i < changes; i++) await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 10 + i, windowHours: 24 } } });
      return t;
    }

    it('links every entry to the one before it, from a fixed start', async () => {
      const t = await busyTenant();
      const r = await rows(t.org);
      expect(r.map((x) => x.seq)).toEqual(r.map((_, i) => i + 1));
      r.forEach((x, i) => expect(x.prev_hash).toBe(i === 0 ? '0'.repeat(64) : r[i - 1]!.entry_hash));
      expect(await verify(t.org)).toMatchObject({ ok: true, entries: r.length, head_seq: r.length });
    });

    it('finds an edited entry, and says where', async () => {
      const t = await busyTenant();
      await tamper((c) => c.query(`UPDATE engage.audit_log SET actor = 'user:somebody-else' WHERE organization_id = $1 AND seq = 3`, [t.org]).then(() => undefined));
      expect(await verify(t.org)).toMatchObject({ ok: false, first_bad_seq: 3 });
    });

    it('finds an edited detail', async () => {
      const t = await busyTenant();
      await tamper((c) => c.query(`UPDATE engage.audit_log SET details = '{}'::jsonb WHERE organization_id = $1 AND seq = 2`, [t.org]).then(() => undefined));
      expect(await verify(t.org)).toMatchObject({ ok: false, first_bad_seq: 2 });
    });

    it('finds a removed entry in the middle', async () => {
      const t = await busyTenant();
      await tamper((c) => c.query(`DELETE FROM engage.audit_log WHERE organization_id = $1 AND seq = 4`, [t.org]).then(() => undefined));
      expect(await verify(t.org)).toMatchObject({ ok: false, first_bad_seq: 5 });
    });

    it('finds an entry rewritten together with its own hash, because the next entry no longer links to it', async () => {
      const t = await busyTenant();
      await tamper(async (c) => {
        const fresh = (await c.query<{ h: string }>(
          `SELECT engage.audit_entry_hash(organization_id, seq, prev_hash, occurred_at, 'user:forged', action, subject_type, subject_id, details) AS h
             FROM engage.audit_log WHERE organization_id = $1 AND seq = 2`, [t.org])).rows[0]!.h;
        await c.query(`UPDATE engage.audit_log SET actor = 'user:forged', entry_hash = $2 WHERE organization_id = $1 AND seq = 2`, [t.org, fresh]);
      });
      expect(await verify(t.org)).toMatchObject({ ok: false, first_bad_seq: 3 });
    });

    it('a removed tail still verifies (only a remembered head shows it): the documented limit', async () => {
      const t = await busyTenant();
      const before = await verify(t.org);
      await tamper((c) => c.query(`DELETE FROM engage.audit_log WHERE organization_id = $1 AND seq = $2`, [t.org, before.head_seq]).then(() => undefined));
      const after = await verify(t.org);
      expect(after.ok).toBe(true);
      expect(after.head_seq).toBe(before.head_seq - 1);
    });

    it('stays gap-free and in one line when many changes arrive at once', async () => {
      const t = await tenant();
      const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
        app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 100 + i, windowHours: 24 } } })));
      expect(results.every((r) => r.status === 200)).toBe(true);
      const r = await rows(t.org);
      expect(r.map((x) => x.seq)).toEqual(r.map((_, i) => i + 1));
      expect(await verify(t.org)).toMatchObject({ ok: true, entries: 26 }); // 1 creation + 25 changes of the cap
    });
  });

  describe('append-only, and tenant-private', () => {
    it('the engage role cannot insert, update, delete or truncate, directly', async () => {
      const t = await tenant();
      const forged = `INSERT INTO engage.audit_log (organization_id, seq, occurred_at, actor, action, subject_type, details, prev_hash, entry_hash)
                      VALUES ($1, 99, now(), 'system', 'tenant.created', 'tenant', '{}', repeat('0', 64), repeat('1', 64))`;
      await expect(sql(t.org, forged, [t.org])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `UPDATE engage.audit_log SET actor = 'system' WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `DELETE FROM engage.audit_log WHERE organization_id = $1`, [t.org])).rejects.toThrow(/permission denied/);
      await expect(sql(t.org, `TRUNCATE engage.audit_log`)).rejects.toThrow(/permission denied/);
      expect((await rows(t.org)).length).toBe(1);
    });

    it('even the database owner is stopped by the trigger until it is switched off on purpose', async () => {
      const t = await tenant();
      await expect(f.admin.query(`UPDATE engage.audit_log SET actor = 'system' WHERE organization_id = $1`, [t.org])).rejects.toThrow(/append-only/);
      await expect(f.admin.query(`DELETE FROM engage.audit_log WHERE organization_id = $1`, [t.org])).rejects.toThrow(/append-only/);
      await expect(f.admin.query(`TRUNCATE engage.audit_log`)).rejects.toThrow(/append-only/);
      expect((await rows(t.org)).length).toBe(1);
    });

    it('the engage role cannot write an entry for another tenant through the function either', async () => {
      const a = await tenant(); const b = await tenant();
      await expect(sql(a.org, `SELECT engage.audit_append($1, 'system', 'tenant.created', 'tenant', NULL, '{}')`, [b.org])).rejects.toThrow(/outside the current tenant/);
      await expect(f.engage.withEngageScheduler((c) => c.query(`SELECT engage.audit_append($1, 'system', 'tenant.created', 'tenant', NULL, '{}')`, [a.org]))).rejects.toThrow(/without a tenant/);
      expect((await rows(b.org)).length).toBe(1);
    });

    it('a tenant reads and verifies only its own log', async () => {
      const a = await tenant(); const b = await tenant();
      await app.http('/settings/gate', { method: 'PUT', token: a.admin, body: { frequencyCap: { max: 9, windowHours: 24 } } });
      expect((await audit.listAudit(a.org)).length).toBe(2);
      expect((await audit.listAudit(b.org)).length).toBe(1);
      const seen = (await sql(a.org, `SELECT DISTINCT organization_id FROM engage.audit_log`)).rows.map((r) => r.organization_id);
      expect(seen).toEqual([a.org]);
      expect(await audit.verifyAuditChain(a.org)).toMatchObject({ ok: true, entries: 2, headSeq: 2 });
    });

    it('is not deleted with the organization row', async () => {
      const t = await tenant();
      await f.admin.query('DELETE FROM organizations WHERE id = $1', [t.org]).catch(() => undefined); // may be refused by legacy rows; either way the log stays
      expect((await rows(t.org)).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /settings/audit', () => {
    it('shows an admin the newest entries and the chain status, and nobody else', async () => {
      const t = await tenant();
      await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 7, windowHours: 24 } } });
      const r = await app.http('/settings/audit?limit=10', { token: t.admin });
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      const entries = r.json.entries as Array<{ seq: number; action: string; actor: string }>;
      expect(entries.map((e) => e.seq)).toEqual([2, 1]);
      expect(entries[0]).toMatchObject({ action: 'settings.changed', actor: `user:${t.userId}` });
      expect(r.json.chain).toMatchObject({ ok: true, entries: 2, firstBadSeq: null, headSeq: 2 });
      expect((await app.http('/settings/audit', { token: t.member })).status).toBe(403);
      expect((await app.http('/settings/audit')).status).toBe(401);
      expect((await app.http('/settings/audit?limit=abc', { token: t.admin })).status).toBe(400);
    });

    it('pages backwards with beforeSeq and clamps the page size', async () => {
      const t = await tenant();
      for (let i = 0; i < 4; i++) await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 20 + i, windowHours: 24 } } });
      const first = await app.http('/settings/audit?limit=2', { token: t.admin });
      expect((first.json.entries as Array<{ seq: number }>).map((e) => e.seq)).toEqual([5, 4]);
      const next = await app.http('/settings/audit?limit=2&beforeSeq=4', { token: t.admin });
      expect((next.json.entries as Array<{ seq: number }>).map((e) => e.seq)).toEqual([3, 2]);
      expect((await audit.listAudit(t.org, { limit: 100000 })).length).toBe(5);
    });
  });

  describe('the ops rule', () => {
    it('raises audit_chain_broken (critical) only for a chain that does not verify', async () => {
      const { takeSnapshot } = await import('../../engage/ops/snapshot.js');
      const { evaluateRules } = await import('../../engage/ops/rules.js');
      const { DEFAULT_THRESHOLDS } = await import('../../engage/ops/thresholds.js');
      const t = await busyTenant2();
      const healthy = await takeSnapshot(t.org, DEFAULT_THRESHOLDS);
      expect(healthy.auditChain).toMatchObject({ ok: true });
      expect(evaluateRules(healthy, DEFAULT_THRESHOLDS).map((c) => c.rule)).not.toContain('audit_chain_broken');
      await tamper((c) => c.query(`UPDATE engage.audit_log SET actor = 'user:x' WHERE organization_id = $1 AND seq = 2`, [t.org]).then(() => undefined));
      const broken = await takeSnapshot(t.org, DEFAULT_THRESHOLDS);
      const cond = evaluateRules(broken, DEFAULT_THRESHOLDS).find((c) => c.rule === 'audit_chain_broken');
      expect(cond).toMatchObject({ severity: 'critical', data: { firstBadSeq: 2 } });
    });
    async function busyTenant2(): Promise<Tn> {
      const t = await tenant();
      await app.http('/settings/gate', { method: 'PUT', token: t.admin, body: { frequencyCap: { max: 4, windowHours: 24 } } });
      return t;
    }
  });
});
