/**
 * Profiles, identifiers, consents and suppressions (WP-07) on real Postgres, through the non-bypass engage role.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';

describe.skipIf(!adminUrl)('profiles, consents and suppressions (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let P: typeof import('../../engage/profiles.js');
  let A: string;
  let B: string;
  const logs: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const u = () => `${Math.random().toString(36).slice(2, 10)}`;
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  beforeAll(async () => {
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }));
    }
    P = await import('../../engage/profiles.js');
    app = await startEngageApp();
    A = f.A.organization.id;
    B = f.B.organization.id;
  }, 90_000);

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  describe('database rules (raw SQL as the engage role)', () => {
    const profile = async (org: string) => (await sql(org, `INSERT INTO engage.profiles (organization_id, external_id) VALUES ($1, $2) RETURNING id`, [org, `db-${u()}`])).rows[0].id as string;
    const ident = (org: string, pid: string, type: string, value: string) =>
      sql(org, `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized) VALUES ($1, $2, $3, $4)`, [org, pid, type, value]);

    it('allows only one ACTIVE email and one ACTIVE phone per profile', async () => {
      const p = await profile(A);
      await ident(A, p, 'email', `one-${u()}@example.com`);
      await expect(ident(A, p, 'email', `two-${u()}@example.com`)).rejects.toThrow(/identifiers_one_active_per_type/);
      await ident(A, p, 'phone', '+905320000001');
      await expect(ident(A, p, 'phone', '+905320000002')).rejects.toThrow(/identifiers_one_active_per_type/);
    });

    it('allows only one active owner of a value in a tenant, but the same value in another tenant', async () => {
      const email = `shared-${u()}@example.com`;
      const p1 = await profile(A);
      const p2 = await profile(A);
      await ident(A, p1, 'email', email);
      await expect(ident(A, p2, 'email', email)).rejects.toThrow(/identifiers_one_active_owner/);
      await ident(B, await profile(B), 'email', email);
    });

    it('keeps inactive history, and a deactivated value can be claimed by someone else', async () => {
      const email = `moved-${u()}@example.com`;
      const p1 = await profile(A);
      const p2 = await profile(A);
      await ident(A, p1, 'email', email);
      await sql(A, `UPDATE engage.identifiers SET is_active = false, deactivated_at = now() WHERE profile_id = $1 AND type = 'email'`, [p1]);
      await ident(A, p2, 'email', email);
      const rows = await sql(A, `SELECT profile_id, is_active FROM engage.identifiers WHERE value_normalized = $1 ORDER BY first_seen_at`, [email]);
      expect(rows.rows.map((r) => r.is_active)).toEqual([false, true]);
    });

    it.each([
      ['email in upper case', 'email', 'Mixed@Example.com'],
      ['email with surrounding space', 'email', ' a@example.com'],
      ['email without a domain dot', 'email', 'a@localhost'],
      ['phone not in E.164', 'phone', '0532 000 00 00'],
      ['phone without plus', 'phone', '905320000000'],
      ['phone that is too short', 'phone', '+90532'],
    ])('rejects %s', async (_n, type, value) => {
      await expect(ident(A, await profile(A), type, value)).rejects.toThrow(/violates check constraint/);
    });

    it('rejects an identifier whose active flag disagrees with its deactivation time', async () => {
      await expect(sql(A, `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized, is_active, deactivated_at)
        VALUES ($1, $2, 'email', $3, true, now())`, [A, await profile(A), `x-${u()}@example.com`])).rejects.toThrow(/violates check constraint/);
    });

    it('cannot attach a child row to another tenant\'s profile, even with the right tenant context', async () => {
      const pB = await profile(B);
      await expect(ident(A, pB, 'email', `cross-${u()}@example.com`)).rejects.toThrow(/foreign key|row-level security/);
      await expect(sql(A, `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence)
        VALUES ($1, $2, 'email', 'granted', 'import', '{"f":1}')`, [A, pB])).rejects.toThrow(/foreign key|row-level security/);
    });

    it('never deletes profiles or identifiers', async () => {
      const p = await profile(A);
      await expect(sql(A, `DELETE FROM engage.profiles WHERE id = $1`, [p])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.identifiers WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
    });

    describe('consent ledger and state', () => {
      const consent = (org: string, pid: string, status: string, source: string, evidence: object, at?: string) =>
        sql(org, `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence, recorded_at)
                  VALUES ($1, $2, 'email', $3, $4, $5::jsonb, COALESCE($6::timestamptz, now()))`, [org, pid, status, source, JSON.stringify(evidence), at ?? null]);
      const state = async (org: string, pid: string) =>
        (await sql(org, `SELECT status FROM engage.consent_state WHERE profile_id = $1 AND channel = 'email'`, [pid])).rows[0]?.status as string | undefined;

      it('defaults to no state at all (fail closed)', async () => {
        expect(await state(A, await profile(A))).toBeUndefined();
      });

      it('a grant outside IYS without evidence is rejected; a grant with evidence is accepted', async () => {
        const p = await profile(A);
        await expect(consent(A, p, 'granted', 'web', {})).rejects.toThrow(/violates check constraint/);
        await consent(A, p, 'granted', 'web', { text_version: 'v3', ip: '203.0.113.9' });
        expect(await state(A, p)).toBe('granted');
      });

      it('state follows the ledger, and the latest decision wins', async () => {
        const p = await profile(A);
        await consent(A, p, 'granted', 'web', { v: 1 }, '2026-01-01T10:00:00Z');
        await consent(A, p, 'revoked', 'unsubscribe_link', {}, '2026-01-02T10:00:00Z');
        expect(await state(A, p)).toBe('revoked');
        await consent(A, p, 'granted', 'web', { v: 2 }, '2026-01-03T10:00:00Z');
        expect(await state(A, p)).toBe('granted');
        expect((await sql(A, `SELECT count(*)::int AS n FROM engage.consents WHERE profile_id = $1`, [p])).rows[0].n).toBe(3);
      });

      it('an older decision arriving late does not overwrite a newer state', async () => {
        const p = await profile(A);
        await consent(A, p, 'revoked', 'stop_keyword', {}, '2026-02-02T10:00:00Z');
        await consent(A, p, 'granted', 'import', { file: 'old.csv' }, '2026-02-01T10:00:00Z');
        expect(await state(A, p)).toBe('revoked');
      });

      it('the ledger is append-only: no edits (except the IYS sync stamp), no deletes', async () => {
        const p = await profile(A);
        await consent(A, p, 'granted', 'web', { v: 1 });
        await expect(sql(A, `UPDATE engage.consents SET status = 'revoked' WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
        await expect(sql(A, `UPDATE engage.consents SET evidence = '{}' WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
        await expect(sql(A, `DELETE FROM engage.consents WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
        const r = await sql(A, `UPDATE engage.consents SET iys_synced_at = now() WHERE profile_id = $1`, [p]);
        expect(r.rowCount).toBe(1);
      });

      it('consent_state cannot be written directly', async () => {
        const p = await profile(A);
        await expect(sql(A, `INSERT INTO engage.consent_state (organization_id, profile_id, channel, purpose, status, updated_at)
          VALUES ($1, $2, 'email', 'marketing', 'granted', now())`, [A, p])).rejects.toThrow(/permission denied/);
        await consent(A, p, 'revoked', 'stop_keyword', {});
        await expect(sql(A, `UPDATE engage.consent_state SET status = 'granted' WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
        await expect(sql(A, `DELETE FROM engage.consent_state WHERE profile_id = $1`, [p])).rejects.toThrow(/permission denied/);
        expect(await state(A, p)).toBe('revoked');
      });

      it('only the marketing purpose exists (transactional is a message attribute, not a consent)', async () => {
        await expect(sql(A, `INSERT INTO engage.consents (organization_id, profile_id, channel, purpose, status, source, evidence)
          VALUES ($1, $2, 'email', 'transactional', 'granted', 'web', '{"a":1}')`, [A, await profile(A)])).rejects.toThrow(/violates check constraint/);
      });
    });

    it('suppressions are append-only and unique per address', async () => {
      const v = `sup-${u()}@example.com`;
      await sql(A, `INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, 'hard_bounce')`, [A, v]);
      await expect(sql(A, `INSERT INTO engage.suppressions (organization_id, channel, value_normalized, reason) VALUES ($1, 'email', $2, 'manual')`, [A, v])).rejects.toThrow(/duplicate key/);
      await expect(sql(A, `UPDATE engage.suppressions SET reason = 'manual' WHERE value_normalized = $1`, [v])).rejects.toThrow(/permission denied/);
      await expect(sql(A, `DELETE FROM engage.suppressions WHERE value_normalized = $1`, [v])).rejects.toThrow(/permission denied/);
    });
  });

  describe('service', () => {
    it('creates a profile with normalized identifiers and merges attributes', async () => {
      const ext = `cust-${u()}`;
      const v = await P.upsertProfile(A, { externalId: ext, email: ' Ayse@Example.com ', phone: '0532 111 22 33', attributes: { city: 'Izmir', tier: 'gold' }, locale: 'tr-TR' });
      expect(v.identifiers).toEqual({ email: 'ayse@example.com', phone: '+905321112233' });
      expect(v.attributes).toEqual({ city: 'Izmir', tier: 'gold' });
      expect(v.consents).toEqual({});
      const again = await P.upsertProfile(A, { externalId: ext, attributes: { tier: null, vip: true } });
      expect(again.id).toBe(v.id);
      expect(again.attributes).toEqual({ city: 'Izmir', vip: true });
      expect(again.identifiers.email).toBe('ayse@example.com');
      expect(again.locale).toBe('tr-TR');
    });

    it('changing an email keeps the old one as inactive history; null deactivates', async () => {
      const ext = `cust-${u()}`;
      const first = `old-${u()}@example.com`;
      const v = await P.upsertProfile(A, { externalId: ext, email: first });
      const second = `new-${u()}@example.com`;
      await P.upsertProfile(A, { externalId: ext, email: second });
      const rows = await sql(A, `SELECT value_normalized, is_active FROM engage.identifiers WHERE profile_id = $1 AND type = 'email' ORDER BY first_seen_at`, [v.id]);
      expect(rows.rows).toEqual([{ value_normalized: first, is_active: false }, { value_normalized: second, is_active: true }]);
      expect((await P.upsertProfile(A, { externalId: ext, email: second })).identifiers.email).toBe(second);
      expect((await sql(A, `SELECT count(*)::int AS n FROM engage.identifiers WHERE profile_id = $1 AND type = 'email'`, [v.id])).rows[0].n).toBe(2);
      expect((await P.upsertProfile(A, { externalId: ext, email: null })).identifiers.email).toBeNull();
      expect((await P.upsertProfile(A, { externalId: ext, phone: undefined })).identifiers.email).toBeNull();
    });

    it('can return to an earlier value without violating history', async () => {
      const ext = `cust-${u()}`;
      const a = `a-${u()}@example.com`;
      await P.upsertProfile(A, { externalId: ext, email: a });
      await P.upsertProfile(A, { externalId: ext, email: `b-${u()}@example.com` });
      expect((await P.upsertProfile(A, { externalId: ext, email: a })).identifiers.email).toBe(a);
    });

    it('refuses an email that is the active identifier of another profile, and changes nothing', async () => {
      const taken = `taken-${u()}@example.com`;
      await P.upsertProfile(A, { externalId: `owner-${u()}`, email: taken });
      const ext = `other-${u()}`;
      const mine = `mine-${u()}@example.com`;
      await P.upsertProfile(A, { externalId: ext, email: mine });
      await expect(P.upsertProfile(A, { externalId: ext, email: taken, attributes: { x: 1 } })).rejects.toThrow(P.IdentifierConflictError);
      const v = (await P.findProfileByExternalId(A, ext))!;
      expect(v.identifiers.email).toBe(mine);
      expect(v.attributes).toEqual({});
    });

    it('rejects malformed input before touching the database', async () => {
      await expect(P.upsertProfile(A, { externalId: '' })).rejects.toThrow(P.ProfileInputError);
      await expect(P.upsertProfile(A, { externalId: 'x', email: 'not-an-email' })).rejects.toThrow(P.ProfileInputError);
      await expect(P.upsertProfile(A, { externalId: 'x', phone: '123' })).rejects.toThrow(P.ProfileInputError);
      await expect(P.upsertProfile(A, { externalId: 'x', attributes: [] as unknown as Record<string, unknown> })).rejects.toThrow(P.ProfileInputError);
      expect(await P.findProfileByExternalId(A, 'x')).toBeNull();
    });

    it('tenants do not see or collide with each other (same external id, same email)', async () => {
      const ext = `same-${u()}`;
      const email = `same-${u()}@example.com`;
      const a = await P.upsertProfile(A, { externalId: ext, email, attributes: { who: 'a' } });
      const b = await P.upsertProfile(B, { externalId: ext, email, attributes: { who: 'b' } });
      expect(a.id).not.toBe(b.id);
      expect((await P.findProfileByExternalId(A, ext))!.attributes).toEqual({ who: 'a' });
      await expect(P.getProfile(A, b.id)).rejects.toThrow(P.ProfileNotFoundError);
      await expect(P.recordConsent(A, b.id, { channel: 'email', status: 'revoked', source: 'api' })).rejects.toThrow(P.ProfileNotFoundError);
    });

    it('consent: default none; grant needs evidence; revoke wins; hasConsent fails closed', async () => {
      const v = await P.upsertProfile(A, { externalId: `c-${u()}`, email: `c-${u()}@example.com` });
      expect(await P.hasConsent(A, v.id, 'email')).toBe(false);
      await expect(P.recordConsent(A, v.id, { channel: 'email', status: 'granted', source: 'web' })).rejects.toThrow(P.ProfileInputError);
      expect(await P.hasConsent(A, v.id, 'email')).toBe(false);
      const g = await P.recordConsent(A, v.id, { channel: 'email', status: 'granted', source: 'web', evidence: { text_version: 'v1', ip: '203.0.113.7' } });
      expect(g.consents).toEqual({ email: 'granted' });
      expect(await P.hasConsent(A, v.id, 'email')).toBe(true);
      expect(await P.hasConsent(A, v.id, 'sms')).toBe(false);
      await P.recordConsent(A, v.id, { channel: 'email', status: 'revoked', source: 'api' });
      expect(await P.hasConsent(A, v.id, 'email')).toBe(false);
    });

    it('a recipient opt-out revokes consent AND suppresses the address, atomically', async () => {
      const email = `out-${u()}@example.com`;
      const v = await P.upsertProfile(A, { externalId: `o-${u()}`, email, phone: '+905329998877' });
      await P.recordConsent(A, v.id, { channel: 'email', status: 'granted', source: 'web', evidence: { v: 1 } });
      expect(await P.isSuppressed(A, 'email', email)).toBe(false);
      await P.recordConsent(A, v.id, { channel: 'email', status: 'revoked', source: 'unsubscribe_link' });
      expect(await P.isSuppressed(A, 'email', email.toUpperCase())).toBe(true);
      expect(await P.isSuppressed(A, 'sms', '0532 999 88 77')).toBe(false);
      await P.recordConsent(A, v.id, { channel: 'sms', status: 'revoked', source: 'stop_keyword' });
      expect(await P.isSuppressed(A, 'sms', '0532 999 88 77')).toBe(true);
      expect(await P.isSuppressed(B, 'email', email)).toBe(false);
    });

    it('an API revocation withdraws consent but does not by itself suppress the address', async () => {
      const email = `soft-${u()}@example.com`;
      const v = await P.upsertProfile(A, { externalId: `s-${u()}`, email });
      await P.recordConsent(A, v.id, { channel: 'email', status: 'revoked', source: 'api' });
      expect(await P.isSuppressed(A, 'email', email)).toBe(false);
    });

    it('an address that cannot be normalized counts as suppressed (fail closed)', async () => {
      expect(await P.isSuppressed(A, 'email', 'garbage')).toBe(true);
      expect(await P.isSuppressed(A, 'sms', '123')).toBe(true);
    });

    it('an erased profile cannot be modified', async () => {
      const ext = `e-${u()}`;
      await P.upsertProfile(A, { externalId: ext });
      await f.admin.query(`UPDATE engage.profiles SET erased_at = now() WHERE organization_id = $1 AND external_id = $2`, [A, ext]);
      await expect(P.upsertProfile(A, { externalId: ext, attributes: { a: 1 } })).rejects.toThrow(/erased/);
    });
  });

  describe('HTTP', () => {
    it('a tenant user reads their own profile with identifiers and consent state', async () => {
      const email = `http-${u()}@example.com`;
      const v = await P.upsertProfile(A, { externalId: `h-${u()}`, email });
      await P.recordConsent(A, v.id, { channel: 'email', status: 'granted', source: 'web', evidence: { v: 1 } });
      const r = await app.http(`/profiles/${v.id}`, { token: token(f.A.admin.authUserId, A) });
      expect(r.status).toBe(200);
      expect(r.json.identifiers).toEqual({ email, phone: null });
      expect(r.json.consents).toEqual({ email: 'granted' });
      expect(r.headers.get('cache-control')).toBe('no-store');
    });

    it('another tenant\'s profile id returns 404, same as a missing one, and a malformed id', async () => {
      const b = await P.upsertProfile(B, { externalId: `h-${u()}` });
      const tok = token(f.A.admin.authUserId, A);
      const cross = await app.http(`/profiles/${b.id}`, { token: tok });
      const missing = await app.http(`/profiles/00000000-0000-4000-8000-000000000000`, { token: tok });
      const bad = await app.http(`/profiles/not-a-uuid`, { token: tok });
      expect([cross.status, missing.status, bad.status]).toEqual([404, 404, 404]);
      expect(cross.text).toBe(missing.text);
      expect((await app.http(`/profiles/${b.id}`, { token: token(f.B.admin.authUserId, B) })).status).toBe(200);
    });

    it('requires authentication', async () => {
      const v = await P.upsertProfile(A, { externalId: `h-${u()}` });
      expect((await app.http(`/profiles/${v.id}`)).status).toBe(401);
    });
  });

  it('personal data (emails, phones, ids) never appears in logs', () => {
    const joined = logs.join('\n');
    expect(joined).not.toMatch(/@example\.com/);
    expect(joined).not.toMatch(/\+90532/);
  });
});
