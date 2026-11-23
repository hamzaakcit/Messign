/**
 * WP-33: the checklist, followed step by step through the real Settings API on real Postgres, takes a bare tenant to a tenant that
 * sends in live mode; take any readiness item away and the gate refuses. Every setup problem the readiness check can report is a
 * code the checklist document names, and the document names no other.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageOnboardingChecklist.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';
import { startEngageApp, token, type TestApp } from './helpers/httpApp.js';
import { tableBetween } from './helpers/docTable.js';

const CHECKLIST = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs'), 'onboarding', 'onboarding-checklist.md');

describe.skipIf(!adminUrl)('onboarding checklist, followed through the API (real Postgres)', () => {
  let f: TenancyFixture;
  let app: TestApp;
  let M: typeof import('../../engage/messaging/index.js');
  let C: typeof import('../../engage/campaigns/campaigns.js');
  let G: typeof import('../../engage/messaging/gate.js');
  let P: typeof import('../../engage/profiles.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const saved = { mode: process.env.SEND_MODE, app: process.env.ENGAGE_PUBLIC_APP_URL, api: process.env.ENGAGE_PUBLIC_API_URL };
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    C = await import('../../engage/campaigns/campaigns.js');
    G = await import('../../engage/messaging/gate.js');
    P = await import('../../engage/profiles.js');
    app = await startEngageApp();
  }, 90_000);
  afterEach(() => { process.env.SEND_MODE = 'live'; process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com'; process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com'; });
  afterAll(async () => {
    for (const [k, v] of [['SEND_MODE', saved.mode], ['ENGAGE_PUBLIC_APP_URL', saved.app], ['ENGAGE_PUBLIC_API_URL', saved.api]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    spies.forEach((s) => s.mockRestore());
    await app?.close();
    await f?.teardown();
  });

  const tenant = async () => {
    const t = await f.provisionTenant(`Checklist ${u()}`);
    return { org: t.organization.id, admin: token(t.admin.authUserId, t.organization.id) };
  };
  const codesOf = async (org: string, mode: 'off' | 'sandbox' | 'live'): Promise<string[]> =>
    (await C.getSendReadiness(org, mode, 'email')).problems.map((p) => p.code);

  it('every problem the readiness check can report is named in the checklist, and the checklist names nothing else', async () => {
    const documented = new Set(tableBetween(readFileSync(CHECKLIST, 'utf8'), 'setup-codes').map((r) => r[0]!));
    const seen = new Set<string>();
    const add = (codes: string[]) => codes.forEach((c) => seen.add(c));

    const bare = await tenant();
    add(await codesOf(bare.org, 'off'));
    add(await codesOf(bare.org, 'live'));
    process.env.ENGAGE_PUBLIC_APP_URL = 'http://not-https';
    add(await codesOf(bare.org, 'live'));
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';

    const withAccount = await tenant();
    const mk = (t: { org: string; admin: string }) => app.http('/channel-accounts', { token: t.admin, body: { channel: 'email', provider: 'mock', mode: 'test', label: `m-${u()}`, config: {}, secrets: { webhook_secret: `whsec_${u()}` } } });
    expect((await mk(withAccount)).status).toBe(201);
    add(await codesOf(withAccount.org, 'live')); // a test account while the server runs live
    expect((await mk(withAccount)).status).toBe(201);
    add(await codesOf(withAccount.org, 'sandbox')); // two active email accounts

    seen.add('sender_identity_mismatch'); // the gate's own code, proven end to end in engageSenderName.integration.test.ts
    expect([...seen].sort()).toEqual([...documented].sort());
  });

  it('following the checklist takes a bare tenant to sending in live mode; each readiness item the gate needs, taken away, stops it', async () => {
    process.env.SEND_MODE = 'live';
    const t = await tenant();
    const api = (path: string, method: string, body: unknown) => app.http(path, { method, token: t.admin, body });
    const problems = async () => await codesOf(t.org, 'live');

    // Start: the Settings screen refuses to turn sending on, and says why.
    expect(await problems()).toEqual(expect.arrayContaining(['tenant_send_disabled', 'no_email_account', 'no_rate_card', 'no_budget_cap', 'readiness_missing']));
    const refused = await api('/settings/send-enabled', 'PUT', { enabled: true });
    expect(refused.status).toBe(409);

    // Checklist steps 3, 4, 6 (the operator's account step uses the same API a tenant admin has).
    expect((await api('/settings/sender', 'PUT', { senderName: 'Kitap Evi' })).status).toBe(200);
    const acct = await api('/channel-accounts', 'POST', { channel: 'email', provider: 'mock', mode: 'live', label: `live-${u()}`, config: { from_name: 'Kitap Evi' }, secrets: { webhook_secret: `whsec_${u()}` } });
    expect(acct.status).toBe(201);
    for (const category of ['marketing', 'transactional']) expect((await api('/settings/rate-cards', 'POST', { channel: 'email', category, unitCostMinor: 1, currency: 'TRY' })).status).toBe(201);
    expect((await api('/settings/budget-caps/email', 'PUT', { monthlyCapMinor: 100_000, currency: 'TRY' })).status).toBe(200);
    expect(await problems()).toEqual(['tenant_send_disabled', 'readiness_missing']);

    // Section A: the items the gate requires for email. The domain item cannot be typed in (the API refuses it); the DNS check sets it,
    // which engageEmailDomain covers; here the row is written the way the check writes it.
    for (const item of G.REQUIRED_READINESS.email) {
      if (item === G.EMAIL_DOMAIN_ITEM) {
        const typed = await api(`/settings/readiness/email/${item}`, 'PUT', { value: 'typed by hand' });
        expect(typed.status).toBe(400);
        await sql(t.org, `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value) VALUES ($1, 'email', $2, 'dns check passed')`, [t.org, item]);
      } else {
        expect((await api(`/settings/readiness/email/${item}`, 'PUT', { value: 'Signed 2026-12-01 by A. Yılmaz, v1', evidenceUrl: 'https://example.com/evidence/dpa.pdf' })).status).toBe(200);
      }
    }
    expect(await problems()).toEqual(['tenant_send_disabled']);
    expect((await api('/settings/send-enabled', 'PUT', { enabled: true })).status).toBe(200);
    expect(await problems()).toEqual([]);

    // The gate lets a message through in live mode.
    const profile = await P.upsertProfile(t.org, { externalId: `c-${u()}`, email: `${u()}@example.com` });
    const make = async () => {
      const p = profile;
      return (await M.createMessage(t.org, { profileId: p.id, channel: 'email', purpose: 'transactional', channelAccountId: acct.json.id as string, idempotencyKey: `k-${u()}`, content: { subject: 'Hello', text: 'Hello', html: '<p>Hello</p>' } })).message.id;
    };
    // The mock adapter refuses a live account by design, so the proof that the gate lets the message through is its recorded `allow`.
    const passes = async (): Promise<boolean> => {
      const id = await make();
      const r = await M.dispatchMessage(t.org, id);
      const d = (await sql(t.org, `SELECT decision FROM engage.send_decisions WHERE message_id = $1 ORDER BY id DESC LIMIT 1`, [id])).rows[0];
      expect(r).toEqual({ outcome: 'failed', code: 'mock_requires_test_account' });
      return d?.decision === 'allow';
    };
    expect(await passes()).toBe(true);

    // Take each required item away: the readiness check names it and the gate refuses.
    for (const item of G.REQUIRED_READINESS.email) {
      const row = (await sql(t.org, `SELECT value, evidence_url FROM engage.tenant_readiness WHERE channel = 'email' AND item = $1`, [item])).rows[0];
      await sql(t.org, `DELETE FROM engage.tenant_readiness WHERE channel = 'email' AND item = $1`, [item]);
      const readiness = await C.getSendReadiness(t.org, 'live', 'email');
      expect(readiness.problems.find((p) => p.code === 'readiness_missing')?.message, item).toContain(item);
      const r = await M.dispatchMessage(t.org, await make());
      expect(r, item).toEqual({ outcome: 'blocked', code: 'readiness_missing' });
      await sql(t.org, `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value, evidence_url) VALUES ($1, 'email', $2, $3, $4)`, [t.org, item, row.value, row.evidence_url]);
    }
    expect(await passes()).toBe(true);
  }, 60_000);
});
