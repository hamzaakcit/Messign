/**
 * The kill-switch drill (WP-33) on real Postgres through the non-bypass engage role: it passes on a ready drill tenant with real
 * timings, leaves the tenant's switch and SEND_MODE as it found them, and refuses or fails loudly where it should.
 * ENGAGE_TEST_ADMIN_URL=postgresql://me@localhost:5432/scratch npx vitest run src/__tests__/engage/engageKillSwitchDrill.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { adminUrl, setupTenancyFixture, type TenancyFixture } from './helpers/tenancyFixture.js';

describe.skipIf(!adminUrl)('kill-switch drill (real Postgres, non-bypass role)', () => {
  let f: TenancyFixture;
  let D: typeof import('../../engage/ops/killSwitchDrill.js');
  let M: typeof import('../../engage/messaging/index.js');
  let creds: typeof import('../../engage/credentials.js');
  const spies: Array<{ mockRestore: () => void }> = [];
  const u = () => Math.random().toString(36).slice(2, 10);
  const sql = (org: string, text: string, params: unknown[] = []) => f.engage.withEngageTenant(org, (c) => c.query(text, params));

  beforeAll(async () => {
    process.env.ENGAGE_MASTER_KEY = randomBytes(32).toString('hex');
    process.env.ENGAGE_MASTER_KEY_ID = 'k1';
    delete process.env.ENGAGE_MASTER_KEYS_OLD;
    process.env.ENGAGE_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.ENGAGE_PUBLIC_API_URL = 'https://api.example.com';
    f = await setupTenancyFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    M = await import('../../engage/messaging/index.js');
    creds = await import('../../engage/credentials.js');
    D = await import('../../engage/ops/killSwitchDrill.js');
  }, 90_000);
  beforeEach(() => { process.env.SEND_MODE = 'sandbox'; });
  afterAll(async () => {
    delete process.env.SEND_MODE;
    spies.forEach((s) => s.mockRestore());
    await f?.teardown();
  });

  /** A drill tenant: a mock email account, a rate card and a budget cap; sending switched as asked. */
  async function drillTenant(o: { enabled?: boolean; mode?: 'test' | 'live'; fromName?: string; senderName?: string; ready?: boolean } = {}) {
    const t = await f.provisionTenant(`Drill ${u()}`);
    const org = t.organization.id;
    const account = await creds.createAccount(org, t.admin.userId, {
      channel: 'email', provider: 'mock', mode: o.mode ?? 'test', label: `d-${u()}`,
      config: o.fromName ? { from_name: o.fromName } : {}, secrets: { webhook_secret: `whsec_${u()}` },
    });
    if (o.ready !== false) {
      await M.addRateCard(org, { channel: 'email', category: 'marketing', unitCostMinor: 1, currency: 'TRY' });
      await M.addRateCard(org, { channel: 'email', category: 'transactional', unitCostMinor: 1, currency: 'TRY' });
      await M.setBudgetCap(org, 'email', 1_000_000, 'TRY');
    }
    if (o.senderName) await sql(org, `UPDATE engage.tenant_settings SET sender_name = $2 WHERE organization_id = $1`, [org, o.senderName]);
    await sql(org, `UPDATE engage.tenant_settings SET send_enabled = $2 WHERE organization_id = $1`, [org, o.enabled ?? true]);
    return { org, account: account.id };
  }
  const enabled = async (org: string) => (await sql(org, `SELECT send_enabled FROM engage.tenant_settings WHERE organization_id = $1`, [org])).rows[0].send_enabled as boolean;

  it('passes on a ready drill tenant: both switches hold at the very next message, nothing is lost or sent twice, and the timings are real', async () => {
    const t = await drillTenant();
    const lines: string[] = [];
    const r = await D.runKillSwitchDrill({ orgId: t.org, accountId: t.account, log: (l) => lines.push(l) });
    expect(r.steps.filter((s) => !s.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.name)).toEqual([
      'preconditions', 'baseline',
      'global switch: the next message after SEND_MODE=off is held', 'global switch: the rest of the batch is held and nothing left the queue',
      'tenant switch: the write itself', 'tenant switch: the next message after the write is held', 'tenant switch: the rest of the batch is held and nothing left the queue',
      'switching back: every held message went out, once each',
    ]);
    for (const ms of Object.values(r.timings)) { expect(Number.isFinite(ms)).toBe(true); expect(ms).toBeGreaterThanOrEqual(0); expect(ms).toBeLessThan(5000); }
    expect(r.timings.tenantHeldMs).toBeGreaterThanOrEqual(r.timings.tenantWriteMs);
    // the database agrees: 16 drill messages, all sent, one decision `allow` each, and none left over
    const rows = (await sql(t.org, `SELECT status, count(*)::int AS n FROM engage.messages GROUP BY 1`)).rows;
    expect(rows).toEqual([{ status: 'sent', n: D.DRILL_MESSAGES }]);
    const held = (await sql(t.org, `SELECT count(*)::int AS n FROM engage.send_decisions`)).rows[0].n as number;
    expect(held).toBe(D.DRILL_MESSAGES); // a held message records no decision: only the 16 allows exist
    expect(lines.length).toBe(r.steps.length);
    expect(D.formatDrill(r)).toContain('Kill-switch drill');
    expect(D.formatDrill(r)).toContain('PASS');
  }, 60_000);

  it('leaves the tenant switch and SEND_MODE as it found them, whichever they were; its allow-list entries are removed', async () => {
    const off = await drillTenant({ enabled: false });
    process.env.SEND_MODE = 'sandbox';
    expect((await D.runKillSwitchDrill({ orgId: off.org, accountId: off.account })).ok).toBe(true);
    expect(await enabled(off.org)).toBe(false);
    expect(process.env.SEND_MODE).toBe('sandbox');
    expect((await sql(off.org, `SELECT count(*)::int AS n FROM engage.send_allowlist WHERE removed_at IS NULL`)).rows[0].n).toBe(0);

    const on = await drillTenant({ enabled: true });
    delete process.env.SEND_MODE; // unset (= off) in the operator's shell: the drill forces sandbox for itself only
    expect((await D.runKillSwitchDrill({ orgId: on.org, accountId: on.account })).ok).toBe(true);
    expect(await enabled(on.org)).toBe(true);
    expect(process.env.SEND_MODE).toBeUndefined();
  }, 60_000);

  it('refuses an account that is not a mock account in test mode, and writes nothing', async () => {
    const t = await drillTenant({ mode: 'live' });
    await expect(D.runKillSwitchDrill({ orgId: t.org, accountId: t.account })).rejects.toThrow(D.DrillRefusedError);
    await expect(D.runKillSwitchDrill({ orgId: t.org, accountId: t.account })).rejects.toThrow(/never touches a real provider/);
    expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(0);
    await expect(D.runKillSwitchDrill({ orgId: t.org, accountId: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow(/not found/);
  });

  it('refuses a tenant that is not ready to send, naming what is missing', async () => {
    const t = await drillTenant({ ready: false });
    await expect(D.runKillSwitchDrill({ orgId: t.org, accountId: t.account })).rejects.toThrow(/no_rate_card/);
    expect((await sql(t.org, `SELECT count(*)::int AS n FROM engage.messages`)).rows[0].n).toBe(0);
  });

  it('fails, with the gate code in words, when the sender name and the account From name differ: the baseline would be denied', async () => {
    const t = await drillTenant({ fromName: 'Başka Mağaza', senderName: 'Kitapyurdu' });
    const r = await D.runKillSwitchDrill({ orgId: t.org, accountId: t.account });
    expect(r.ok).toBe(false);
    const stopped = r.steps.find((s) => s.name === 'stopped');
    expect(stopped?.detail).toMatch(/blocked/);
    expect(stopped?.detail).toMatch(/sender_identity_mismatch/);
    expect(await enabled(t.org)).toBe(true);
  }, 60_000);

  it('formats elapsed times for the stopwatch', () => {
    expect(D.formatElapsed(12.4)).toBe('12 ms');
    expect(D.formatElapsed(1500)).toBe('1.5 s');
    expect(D.formatElapsed(83_412)).toBe('1 min 23.4 s');
  });
});
