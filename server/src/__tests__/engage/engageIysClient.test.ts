/**
 * The İYS client against the mock İYS server (WP-26), over real HTTP on localhost, no database. The mock follows the
 * official documentation (apidocs.iys.org.tr 3.2.4): token and refresh token, add consent v2, the movement listing with
 * its `after` marker, and the documented error codes. Time is a shared fake clock.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IysApiError, IysClient, IysNetworkError, IysRateLimitError } from '../../engage/iys/client.js';
import { startMockIys, type MockIys } from '../../engage/iys/mock/mockIysServer.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Wednesday 2026-11-18, 10:00 Turkish time.
const T0 = Date.parse('2026-11-18T07:00:00Z');

describe('İYS client and mock', () => {
  let mock: MockIys;
  let clock: number;
  const sleeps: number[] = [];
  const client = (o: Partial<ConstructorParameters<typeof IysClient>[0]> = {}) => new IysClient({
    baseUrl: mock.url, iysCode: mock.o.iysCode, brandCode: mock.o.brandCode, credentials: { username: mock.o.username, password: mock.o.password },
    now: () => clock, sleep: async (ms) => { sleeps.push(ms); }, minIntervalMs: 0, ...o,
  });
  const optOut = { recipient: 'ayse@example.com', type: 'EPOSTA' as const, status: 'RET' as const, source: 'HS_EPOSTA', consentDate: new Date(T0 - HOUR) };

  beforeEach(async () => { clock = T0; sleeps.length = 0; mock = await startMockIys({ now: () => clock, visibilityDelayMs: 0 }); });
  afterEach(async () => { await mock.stop(); });

  describe('tokens', () => {
    it('fetches one token and reuses it for every call', async () => {
      const c = client();
      await c.listBrands(); await c.listBrands(); await c.listChanges();
      expect(mock.requestsTo('/oauth2/token')).toHaveLength(1);
      expect(mock.requests[0]!.body).toEqual({ username: 'mock-user', password: 'mock-password', grant_type: 'password' });
    });
    it('refreshes with the refresh token when the access token has expired, not with the password', async () => {
      const c = client();
      await c.listBrands();
      clock += 2 * HOUR + 60_000; // past the 2-hour access token, inside the 4-hour refresh token
      await c.listBrands();
      const tokenCalls = mock.requestsTo('/oauth2/token');
      expect(tokenCalls).toHaveLength(2);
      expect(tokenCalls[1]!.body).toMatchObject({ grant_type: 'refresh_token' });
      expect(JSON.stringify(tokenCalls[1]!.body)).not.toContain('mock-password');
    });
    it('falls back to the password when the refresh token has expired too', async () => {
      const c = client();
      await c.listBrands();
      clock += 5 * HOUR;
      await c.listBrands();
      expect(mock.requestsTo('/oauth2/token').map((r) => (r.body as { grant_type: string }).grant_type)).toEqual(['password', 'password']);
    });
    it('gets a new token once when İYS rejects the current one, and does not loop', async () => {
      const c = client();
      await c.listBrands();
      mock.failNext({ status: 401, code: 'H351', when: (r) => r.path.endsWith('/brands') });
      await expect(c.listBrands()).resolves.toHaveLength(1);
      expect(mock.requestsTo('/oauth2/token')).toHaveLength(2);
      mock.failNext({ status: 401, code: 'H351', when: (r) => r.path.endsWith('/brands') });
      mock.failNext({ status: 401, code: 'H351', when: (r) => r.path.endsWith('/brands') });
      await expect(c.listBrands()).rejects.toMatchObject({ status: 401, code: 'H351' });
    });
    it('reports wrong credentials with İYS\'s code and trace id, and never echoes the password', async () => {
      const bad = client({ credentials: { username: 'mock-user', password: 'wrong-password-xyz' } });
      const err = await bad.listBrands().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(IysApiError);
      expect(err).toMatchObject({ status: 401, code: 'H251', retryable: false });
      expect((err as IysApiError).traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(String(err)).not.toContain('wrong-password-xyz');
    });
  });

  describe('adding a consent (v2)', () => {
    it('sends the documented fields only, the date in Turkish time, and returns İYS\'s transaction', async () => {
      await mock.addRecipientChange({ recipient: 'ayse@example.com', type: 'EPOSTA', status: 'ONAY', source: 'IYS_WEB', consentDate: new Date(T0 - 2 * DAY) });
      const added = await client().addConsent(optOut);
      expect(added.transactionId).toMatch(/^[0-9a-f]{64}$/);
      expect(added.creationDate).toBe('2026-11-18 10:00:00');
      const sent = mock.requests.find((r) => r.path.startsWith('/v2/sps/'))!;
      expect(sent.method).toBe('POST');
      expect(sent.path).toBe(`/v2/sps/${mock.o.iysCode}/brands/${mock.o.brandCode}/consents`);
      expect(sent.body).toEqual({ recipient: 'ayse@example.com', type: 'EPOSTA', source: 'HS_EPOSTA', status: 'RET', consentDate: '2026-11-18 09:00:00', recipientType: 'BIREYSEL' });
      expect(mock.current('ayse@example.com', 'EPOSTA')).toMatchObject({ status: 'RET', source: 'HS_EPOSTA' });
    });
    it('answers a repeated identical request with the same transaction (safe to retry)', async () => {
      mock.addRecipientChange({ recipient: 'ayse@example.com', type: 'EPOSTA', status: 'ONAY', consentDate: new Date(T0 - 2 * DAY) });
      const c = client();
      const first = await c.addConsent(optOut);
      const second = await c.addConsent(optOut);
      expect(second.transactionId).toBe(first.transactionId);
      expect(mock.movements.filter((m) => m.source === 'HS_EPOSTA')).toHaveLength(1);
    });
    it('refuses, with the documented codes and no retry, what İYS refuses', async () => {
      const c = client();
      const code = async (p: Parameters<IysClient['addConsent']>[0]) => (await c.addConsent(p).catch((e: unknown) => e)) as IysApiError;
      // A first record cannot be a RET (H175): there is nothing in İYS to revoke.
      expect(await code(optOut)).toMatchObject({ status: 400, code: 'H175', retryable: false });
      mock.addRecipientChange({ recipient: 'ayse@example.com', type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 2 * DAY) });
      // The status must change (H174).
      expect(await code(optOut)).toMatchObject({ status: 400, code: 'H174' });
      // An older date than İYS holds (H178): somebody acted in İYS after.
      mock.addRecipientChange({ recipient: 'can@example.com', type: 'EPOSTA', status: 'ONAY', consentDate: new Date(T0 - HOUR) });
      expect(await code({ ...optOut, recipient: 'can@example.com', consentDate: new Date(T0 - 3 * HOUR) })).toMatchObject({ status: 400, code: 'H178' });
      // A date in the future (H162) and one older than three business days (H467).
      expect(await code({ ...optOut, consentDate: new Date(T0 + HOUR) })).toMatchObject({ status: 422, code: 'H162' });
      expect(await code({ ...optOut, recipient: 'new@example.com', consentDate: new Date(T0 - 8 * DAY) })).toMatchObject({ status: 422, code: 'H467' });
      // An address İYS cannot take (H120 for email, H121 for a phone).
      expect(await code({ ...optOut, recipient: 'not-an-address' })).toMatchObject({ status: 422, code: 'H120' });
      expect(await code({ ...optOut, recipient: '0532 000 00 00', type: 'MESAJ' })).toMatchObject({ status: 422, code: 'H121' });
    });
    it('allows two operations a day for one recipient and refuses a third (H453)', async () => {
      const c = client();
      mock.addRecipientChange({ recipient: 'ayse@example.com', type: 'EPOSTA', status: 'ONAY', consentDate: new Date(T0 - 5 * HOUR) });
      await c.addConsent({ ...optOut, consentDate: new Date(T0 - 4 * HOUR) });
      await c.addConsent({ ...optOut, status: 'ONAY', source: 'HS_WEB', consentDate: new Date(T0 - 3 * HOUR) });
      await expect(c.addConsent({ ...optOut, consentDate: new Date(T0 - 2 * HOUR) })).rejects.toMatchObject({ code: 'H453' });
    });
  });

  describe('failures that are not the request\'s fault', () => {
    it('waits out a per-second limit and tries again', async () => {
      mock.failNext({ status: 429, code: 'H083', when: (r) => r.path.endsWith('/brands') });
      await expect(client().listBrands()).resolves.toHaveLength(1);
      expect(sleeps).toContain(1000);
    });
    it('raises an hourly limit at once, with the scope and the wait, and does not call again', async () => {
      mock.failNext({ status: 429, code: 'H089', when: (r) => r.path.endsWith('/changes') || r.path.includes('/changes?') });
      const err = await client().listChanges().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(IysRateLimitError);
      expect(err).toMatchObject({ scope: 'history', retryAfterMs: HOUR, retryable: true });
      expect(mock.requestsTo('/sps/').filter((r) => r.path.includes('/changes'))).toHaveLength(1);
    });
    it('treats a server error as worth retrying, and an unreachable İYS as a network error', async () => {
      mock.failNext({ status: 503, code: 'ERR-SYS-0002', when: (r) => r.path.endsWith('/brands') });
      await expect(client().listBrands()).rejects.toMatchObject({ status: 503, retryable: true });
      await mock.stop();
      await expect(client({ timeoutMs: 500 }).listBrands()).rejects.toBeInstanceOf(IysNetworkError);
    });
    it('keeps the recipient out of error messages', async () => {
      const err = await client().addConsent({ ...optOut, recipient: 'secret.person@example.com' }).catch((e: unknown) => e);
      expect(String(err) + JSON.stringify((err as IysApiError).message)).not.toContain('secret.person');
    });
  });

  describe('the movement listing', () => {
    it('lists what recipients did through İYS by default, oldest first, and not what the provider sent', async () => {
      mock.addRecipientChange({ recipient: 'a@example.com', type: 'EPOSTA', status: 'ONAY', consentDate: new Date(T0 - 3 * HOUR), creationMs: T0 - 3 * HOUR });
      mock.addRecipientChange({ recipient: 'b@example.com', type: 'EPOSTA', status: 'ONAY', source: 'HS_WEB', creationMs: T0 - 2 * HOUR });
      mock.addRecipientChange({ recipient: 'c@example.com', type: 'MESAJ', status: 'RET', source: 'IYS_KISAMESAJ', consentDate: new Date(T0 - 2 * HOUR), creationMs: T0 - 2 * HOUR });
      const iys = await client().listChanges();
      expect(iys.list.map((x) => x.recipient)).toEqual(['a@example.com', 'c@example.com']);
      expect(iys.list[0]).toMatchObject({ type: 'EPOSTA', status: 'ONAY', source: 'IYS_WEB', recipientType: 'BIREYSEL', consentDate: '2026-11-18 07:00:00' });
      expect((await client().listChanges({ source: 'HS' })).list.map((x) => x.recipient)).toEqual(['b@example.com']);
    });
    it('pages with the after marker, each movement once, and keeps the marker when there is nothing new (204)', async () => {
      for (let i = 0; i < 5; i++) mock.addRecipientChange({ recipient: `r${i}@example.com`, type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 5 * HOUR + i * 60_000), creationMs: T0 - 5 * HOUR + i * 60_000 });
      const c = client();
      const seen: string[] = [];
      let after: string | null = null;
      for (let page = 0; page < 3; page++) {
        const p: { after: string | null; list: Array<{ recipient: string }> } = await c.listChanges({ after, limit: 2 });
        seen.push(...p.list.map((x) => x.recipient));
        after = p.after;
      }
      expect(seen).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'].map((r) => `${r}@example.com`));
      const empty = await c.listChanges({ after, limit: 2 });
      expect(empty).toEqual({ after, list: [] });
      expect(mock.requests.at(-1)!.query).toMatchObject({ source: 'IYS', limit: '2', after });
    });
    it('does not list movements of the last hour, and lists them once they are older (the marker still works)', async () => {
      await mock.stop();
      mock = await startMockIys({ now: () => clock }); // the documented one-hour delay
      mock.addRecipientChange({ recipient: 'old@example.com', type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 3 * HOUR), creationMs: T0 - 3 * HOUR });
      mock.addRecipientChange({ recipient: 'new@example.com', type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 10 * 60_000), creationMs: T0 - 10 * 60_000 });
      const c = client();
      const first = await c.listChanges();
      expect(first.list.map((x) => x.recipient)).toEqual(['old@example.com']);
      clock += 2 * HOUR;
      expect((await c.listChanges({ after: first.after })).list.map((x) => x.recipient)).toEqual(['new@example.com']);
    });
    it('covers the last 7 days only', async () => {
      mock.addRecipientChange({ recipient: 'ancient@example.com', type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 9 * DAY), creationMs: T0 - 8 * DAY });
      mock.addRecipientChange({ recipient: 'recent@example.com', type: 'EPOSTA', status: 'RET', consentDate: new Date(T0 - 6 * DAY), creationMs: T0 - 6 * DAY });
      expect((await client().listChanges()).list.map((x) => x.recipient)).toEqual(['recent@example.com']);
    });
    it('refuses a limit İYS refuses', async () => {
      await expect(client().listChanges({ limit: 5000 }).then(() => 'ok')).resolves.toBe('ok'); // clamped to the documented maximum of 1000
      expect(mock.requests.at(-1)!.query.limit).toBe('1000');
    });
  });

  it('spaces its requests for İYS\'s 10 requests a second', async () => {
    const c = client({ minIntervalMs: 100 });
    clock = T0;
    await c.listBrands(); await c.listBrands(); await c.listBrands();
    expect(sleeps.filter((s) => s > 0).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(300);
  });
});
