import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EngageHub } from '@/engage/EngageHub';
import { useAuthStore } from '@/stores/authStore';

/**
 * Engage settings (WP-22) on the engage page, against a fake API. Admins see the Settings tab; the server decides what is
 * allowed (a refusal names the missing readiness), and the screen shows those reasons instead of a bare error.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
interface Call { url: string; method: string; body: unknown }
let calls: Call[];
function mockApi(handler: (url: string, method: string, body: unknown) => Response) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    return handler(url, method, body);
  }) as typeof fetch;
}
const sent = (method: string, part: string) => calls.filter((c) => c.method === method && c.url.includes(part));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function renderHub() {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/marketing']}><EngageHub /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const SETTINGS_NOT_READY = {
  sendEnabled: false,
  senderName: null,
  timezone: 'Europe/Istanbul',
  quietHours: null,
  frequencyCap: { max: 3, windowHours: 168 },
  readiness: {
    sendMode: 'sandbox',
    ready: false,
    problems: [
      { code: 'no_email_account', message: 'No email sending account is set up.' },
      { code: 'no_rate_card', message: 'No email rate card is set up (the cost of a marketing email).' },
      { code: 'no_budget_cap', message: 'No monthly email budget cap is set up.' },
    ],
  },
  requiredItems: { email: ['dpa_signed', 'email_domain_authenticated'], sms: ['dpa_signed', 'btk_sender_id', 'iys_brand_code'], whatsapp: ['dpa_signed', 'waba_verified'] },
  readinessItems: [],
  budgetCaps: [],
  rateCards: [],
  channelAccounts: [],
};
const READY = {
  ...SETTINGS_NOT_READY,
  readiness: { sendMode: 'sandbox', ready: true, problems: [] },
  channelAccounts: [{ id: 'a1', channel: 'email', provider: 'ses', mode: 'test', label: 'SES sandbox', hint: 'AKIA…1234', status: 'active', createdAt: '2026-11-10T10:00:00Z', disabledAt: null }],
  budgetCaps: [{ channel: 'email', monthlyCapMinor: 500000, currency: 'TRY', updatedAt: '2026-11-10T10:00:00Z' }],
  rateCards: [{ channel: 'email', category: 'marketing', route: 'default', unitCostMinor: 12, currency: 'TRY', effectiveFrom: '2026-11-10T10:00:00Z' }],
};

/** The lists the engage page loads on the way in. Specific routes are matched before this. */
function lists(url: string, method: string): Response | null {
  if (method !== 'GET') return null;
  if (url.includes('/engage/profiles')) return json({ profiles: [], nextCursor: null });
  if (url.endsWith('/engage/templates')) return json({ templates: [] });
  if (url.endsWith('/engage/segments')) return json({ segments: [] });
  if (url.endsWith('/engage/journeys')) return json({ journeys: [] });
  return null;
}

const originalFetch = globalThis.fetch;
beforeEach(() => { useAuthStore.setState({ isAdmin: true }); });
afterEach(() => { globalThis.fetch = originalFetch; });

async function openSettings() {
  fireEvent.click(await screen.findByTestId('hub-tab-settings'));
  return screen.findByTestId('hub-settings');
}

describe('engage settings (WP-22)', () => {
  it('a tenant admin sees the Settings tab; the readiness it still needs is listed and sending cannot be turned on', async () => {
    mockApi((url, method) => lists(url, method) ?? (url.endsWith('/engage/settings') ? json(SETTINGS_NOT_READY) : json({}, 404)));
    renderHub();
    const panel = await openSettings();
    expect(screen.getByTestId('settings-send-state')).toHaveTextContent('Sending is off');
    const card = within(panel).getByTestId('settings-sending');
    expect(within(card).getByText('No email sending account is set up.')).toBeInTheDocument();
    expect(within(card).getByTestId('settings-send-on')).toBeDisabled();
  });

  it('saves the sender name; the server answers with the settings and the screen shows the new name', async () => {
    mockApi((url, method, body) => {
      if (url.endsWith('/engage/settings/sender') && method === 'PUT') return json({ ...SETTINGS_NOT_READY, senderName: (body as { senderName: string }).senderName });
      return lists(url, method) ?? (url.endsWith('/engage/settings') ? json(SETTINGS_NOT_READY) : json({}, 404));
    });
    renderHub();
    const panel = await openSettings();
    const card = within(panel).getByTestId('settings-sender');
    expect(within(card).getByTestId('sender-not-set')).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText('Sender name'), { target: { value: '  Kitapyurdu  ' } });
    fireEvent.click(within(card).getByTestId('sender-save'));
    await waitFor(() => expect(sent('PUT', '/engage/settings/sender')).toHaveLength(1));
    expect(sent('PUT', '/engage/settings/sender')[0]!.body).toEqual({ senderName: 'Kitapyurdu' });
    expect(await within(card).findByText('Saved.')).toBeInTheDocument();
  });

  it('a refused sender name shows the reason under the field', async () => {
    mockApi((url, method) => {
      if (url.endsWith('/engage/settings/sender') && method === 'PUT') return json({ error: 'The sender name is not valid', issues: [{ path: 'senderName', message: 'must be 1 to 80 characters on one line, with no < > { or }' }] }, 400);
      return lists(url, method) ?? (url.endsWith('/engage/settings') ? json(SETTINGS_NOT_READY) : json({}, 404));
    });
    renderHub();
    const card = within(await openSettings()).getByTestId('settings-sender');
    fireEvent.change(within(card).getByLabelText('Sender name'), { target: { value: '<b>Kitap</b>' } });
    fireEvent.click(within(card).getByTestId('sender-save'));
    expect(await within(card).findByText(/senderName: must be 1 to 80/)).toBeInTheDocument();
  });

  it('a member does not get the Settings tab', async () => {
    useAuthStore.setState({ isAdmin: false });
    mockApi((url, method) => lists(url, method) ?? json({}, 404));
    renderHub();
    await screen.findByTestId('hub-tab-customers');
    expect(screen.queryByTestId('hub-tab-settings')).toBeNull();
    expect(screen.queryByTestId('hub-go-settings')).toBeNull();
  });

  it('when readiness is complete, turning sending on sends one request and the screen shows it on', async () => {
    let enabled = false;
    mockApi((url, method, body) => {
      const l = lists(url, method);
      if (l) return l;
      if (url.endsWith('/engage/settings') && method === 'GET') return json({ ...READY, sendEnabled: enabled });
      if (url.endsWith('/engage/settings/send-enabled') && method === 'PUT') {
        enabled = (body as { enabled: boolean }).enabled;
        return json({ ...READY, sendEnabled: enabled });
      }
      return json({}, 404);
    });
    renderHub();
    await openSettings();
    fireEvent.click(screen.getByTestId('settings-send-on'));
    await waitFor(() => expect(screen.getByTestId('settings-send-state')).toHaveTextContent('Sending is on'));
    expect(sent('PUT', '/engage/settings/send-enabled')).toEqual([expect.objectContaining({ body: { enabled: true } })]);
  });

  it('a refused turn-on shows the server\'s reasons under the button, not a bare error', async () => {
    mockApi((url, method) => {
      const l = lists(url, method);
      if (l) return l;
      if (url.endsWith('/engage/settings') && method === 'GET') return json({ ...READY, readiness: { sendMode: 'sandbox', ready: true, problems: [] } });
      if (url.endsWith('/engage/settings/send-enabled')) return json({
        error: 'Sending cannot be turned on until these are fixed',
        problems: [{ code: 'readiness_missing', message: 'Readiness items not recorded yet: dpa_signed.' }],
      }, 409);
      return json({}, 404);
    });
    renderHub();
    await openSettings();
    fireEvent.click(screen.getByTestId('settings-send-on'));
    const problems = await screen.findByTestId('settings-problems');
    expect(problems).toHaveTextContent('Readiness items not recorded yet: dpa_signed.');
    expect(screen.getByTestId('settings-send-state')).toHaveTextContent('Sending is off');
  });

  it('quiet hours with only one end set are refused on the screen before anything is sent', async () => {
    mockApi((url, method) => lists(url, method) ?? (url.endsWith('/engage/settings') ? json(READY) : json({}, 404)));
    renderHub();
    await openSettings();
    fireEvent.change(screen.getByTestId('gate-quiet-start'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByTestId('gate-save'));
    expect(await screen.findByText('Set both quiet hour times, or clear both.')).toBeInTheDocument();
    expect(sent('PUT', '/engage/settings/gate')).toHaveLength(0);
  });
});

const ACCOUNT = { id: 'a1', label: 'SES sender', domain: 'shop.example' };
const PASSED = {
  id: 'c1', domain: 'shop.example', dkimSelectors: ['s1'], passed: true, checkedAt: '2026-11-20T10:00:00Z', automatic: false,
  spf: { ok: true, code: 'found' }, dkim: [{ selector: 's1', ok: true, code: 'found' }], dmarc: { ok: true, code: 'found', policy: 'none' },
};
const FAILED = {
  id: 'c2', domain: 'shop.example', dkimSelectors: ['s1', 's2'], passed: false, checkedAt: '2026-11-20T10:05:00Z', automatic: false,
  spf: { ok: true, code: 'found' },
  dkim: [{ selector: 's1', ok: true, code: 'found' }, { selector: 's2', ok: false, code: 'dkim_missing' }],
  dmarc: { ok: false, code: 'dmarc_missing' },
};

/** Settings plus the email domain endpoints; `domain` answers GET email-domain and `check` answers the POST. */
function domainApi(domain: unknown, check?: (body: unknown) => Response) {
  mockApi((url, method, body) => {
    if (url.endsWith('/engage/settings/email-domain/check') && method === 'POST') return check ? check(body) : json(domain);
    if (url.endsWith('/engage/settings/email-domain') && method === 'GET') return json(domain);
    return lists(url, method) ?? (url.endsWith('/engage/settings') ? json(READY) : json({}, 404));
  });
}

describe('email domain check (WP-39)', () => {
  it('shows the sending domain, takes no typed value for the domain item, and shows no result before a check', async () => {
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: null });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-email-domain');
    expect(await within(card).findByTestId('email-domain-account')).toHaveTextContent('shop.example');
    expect(within(card).queryByTestId('email-domain-result')).toBeNull();
    // The readiness row for the domain item has no input: it is set by the check.
    const row = within(panel).getByTestId('readiness-email-email_domain_authenticated');
    expect(within(row).getByText(/Set by the email domain check/)).toBeInTheDocument();
    expect(within(row).queryByRole('textbox')).toBeNull();
    expect(within(panel).queryByTestId('readiness-save-email-email_domain_authenticated')).toBeNull();
    // Other items still have their inputs.
    expect(within(panel).getByTestId('readiness-save-email-dpa_signed')).toBeInTheDocument();
  });

  it('says so when the last check was the scheduled one', async () => {
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: { ...FAILED, automatic: true } });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-email-domain');
    expect(await within(card).findByTestId('email-domain-verdict')).toHaveTextContent('checked automatically');
  });

  it('runs the check with the named selectors, shows what was and was not found, and refreshes the settings', async () => {
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: null }, () => json({ account: ACCOUNT, accountProblem: null, lastCheck: FAILED }));
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-email-domain');
    await within(card).findByTestId('email-domain-account');
    const settingsLoads = () => calls.filter((c) => c.method === 'GET' && c.url.endsWith('/engage/settings')).length;
    const before = settingsLoads();
    fireEvent.change(within(card).getByLabelText('DKIM selectors'), { target: { value: ' S1 , s2 ' } });
    fireEvent.click(within(card).getByTestId('email-domain-check'));
    expect(await within(card).findByTestId('email-domain-result')).toBeInTheDocument();
    expect(sent('POST', '/engage/settings/email-domain/check')[0]!.body).toEqual({ dkimSelectors: ['S1', 's2'] });
    expect(within(card).getByTestId('email-domain-verdict')).toHaveTextContent('Did not pass for shop.example');
    expect(within(card).getByTestId('email-domain-spf')).toHaveTextContent('SPF record found');
    expect(within(card).getByTestId('email-domain-dkim-s1')).toHaveTextContent('DKIM record found');
    expect(within(card).getByTestId('email-domain-dkim-s2')).toHaveTextContent('No DKIM record for the selector s2');
    expect(within(card).getByTestId('email-domain-dmarc')).toHaveTextContent('No DMARC record');
    await waitFor(() => expect(settingsLoads()).toBeGreaterThan(before));
  });

  it('a pass says so, with the DMARC policy; checking again without editing the selectors reuses the last ones', async () => {
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: PASSED }, () => json({ account: ACCOUNT, accountProblem: null, lastCheck: PASSED }));
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-email-domain');
    expect(await within(card).findByTestId('email-domain-verdict')).toHaveTextContent('Passed for shop.example');
    expect(within(card).getByTestId('email-domain-dmarc')).toHaveTextContent('policy: none');
    expect(within(card).getByLabelText('DKIM selectors')).toHaveValue('s1');
    fireEvent.click(within(card).getByTestId('email-domain-check'));
    await waitFor(() => expect(sent('POST', '/engage/settings/email-domain/check')).toHaveLength(1));
    expect(sent('POST', '/engage/settings/email-domain/check')[0]!.body).toEqual({});
  });

  it('a check without any selector says a selector is needed', async () => {
    const none = { ...FAILED, dkimSelectors: [], dkim: [], passed: false };
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: none });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-email-domain');
    expect(await within(card).findByTestId('email-domain-dkim-none')).toHaveTextContent('Name at least one DKIM selector');
  });

  it('shows the server\'s refusal under the button', async () => {
    domainApi({ account: ACCOUNT, accountProblem: null, lastCheck: null }, () => json({ error: 'Wait 10 seconds between checks.', code: 'too_soon', issues: [] }, 429));
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-email-domain');
    await within(card).findByTestId('email-domain-account');
    fireEvent.click(within(card).getByTestId('email-domain-check'));
    expect(await within(card).findByText(/Wait 10 seconds/)).toBeInTheDocument();
  });

  it.each([
    ['no_email_account', /No email sending account is set up/],
    ['email_account_ambiguous', /More than one email account is active/],
  ])('with %s it explains why and cannot run a check', async (accountProblem, text) => {
    domainApi({ account: null, accountProblem, lastCheck: null });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-email-domain');
    expect(await within(card).findByTestId('email-domain-problem')).toHaveTextContent(text);
    expect(within(card).getByTestId('email-domain-check')).toBeDisabled();
  });
});

const IYS_REPORT = {
  health: 'ok' as const,
  push: { pending: 0, sent: 4, skipped: 1, failed: 0, deadlineMissed: 0, onTrack: 0, late: 0, atRisk: 0, breached: 0, oldestPendingAt: null, oldestPendingAgeHours: null },
  pull: { status: 'ok' as const, lastPullAt: '2026-11-22T10:00:00Z', lastAttemptAt: '2026-11-22T10:00:00Z', lastOutcome: 'ok', lastErrorCode: null, lastApplied: 2 },
};
const IYS_CONNECTION = { accountId: 'i1', provider: 'iys', mode: 'test' as const, iysCode: 100001, brandCode: 100002 };

/** Settings plus the İYS and attention endpoints. */
function iysApi(o: { iys?: unknown; attention?: unknown[]; check?: () => Response; health?: unknown }) {
  mockApi((url, method) => {
    if (url.endsWith('/engage/settings/delivery-health') && method === 'GET') return json(o.health ?? { checkedAt: '2026-11-23T10:00:00Z', accounts: [], tenant: [] });
    if (url.endsWith('/engage/settings/iys/check') && method === 'POST') return o.check ? o.check() : json({ ok: true, code: null, message: null, brandFound: true });
    if (url.endsWith('/engage/settings/iys') && method === 'GET') return json(o.iys ?? { connection: null, report: null });
    if (url.endsWith('/engage/settings/attention') && method === 'GET') return json({ items: o.attention ?? [] });
    if (url.endsWith('/engage/settings/email-domain') && method === 'GET') return json({ account: null, accountProblem: 'no_email_account', lastCheck: null });
    return lists(url, method) ?? (url.endsWith('/engage/settings') ? json(READY) : json({}, 404));
  });
}

describe('İYS card', () => {
  it('says plainly when no İYS account is connected, and that the credentials are not typed here', async () => {
    iysApi({});
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-iys');
    expect(await within(card).findByTestId('iys-not-connected')).toHaveTextContent(/never typed in this browser/);
    expect(within(card).queryByTestId('iys-check')).toBeNull();
  });

  it('shows the connection, the opt-outs owed to İYS and the pull, and checks the connection on request', async () => {
    iysApi({ iys: { connection: IYS_CONNECTION, report: IYS_REPORT } });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-iys');
    expect(await within(card).findByTestId('iys-account')).toHaveTextContent('İYS sandbox, İYS no. 100001, brand no. 100002');
    expect(within(card).getByTestId('iys-health')).toHaveTextContent('All good');
    expect(within(card).getByTestId('iys-push')).toHaveTextContent('waiting to be reported to İYS: 0');
    expect(within(card).getByTestId('iys-push')).toHaveTextContent('Reported: 4, nothing to report: 1, refused: 0');
    expect(within(card).getByTestId('iys-pull')).toHaveTextContent('Up to date');
    fireEvent.click(within(card).getByTestId('iys-check'));
    expect(await within(card).findByTestId('iys-check-result')).toHaveTextContent('The connection works.');
    expect(sent('POST', '/engage/settings/iys/check')).toHaveLength(1);
  });

  it('shows what is late, and İYS\'s own answer when the connection check fails', async () => {
    iysApi({
      iys: { connection: { ...IYS_CONNECTION, mode: 'live' }, report: { ...IYS_REPORT, health: 'critical', push: { ...IYS_REPORT.push, pending: 3, late: 1, atRisk: 1, breached: 1 }, pull: { ...IYS_REPORT.pull, status: 'critical', lastErrorCode: 'H251' } } },
      check: () => json({ ok: false, code: 'H251', message: 'Kullanıcı kimlik bilgileri geçersiz!', brandFound: false }),
    });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-iys');
    expect(await within(card).findByTestId('iys-health')).toHaveTextContent('Needs action');
    expect(within(card).getByTestId('iys-account')).toHaveTextContent('live');
    expect(within(card).getByTestId('iys-push')).toHaveTextContent('over a day: 1, near the three-business-day limit: 1, past it: 1');
    expect(within(card).getByTestId('iys-pull')).toHaveTextContent('Not working for days');
    expect(within(card).getByTestId('iys-pull')).toHaveTextContent('Last answer: H251');
    fireEvent.click(within(card).getByTestId('iys-check'));
    expect(await within(card).findByTestId('iys-check-result')).toHaveTextContent('H251: Kullanıcı kimlik bilgileri geçersiz!');
  });
});

describe('needs attention', () => {
  const LOST = { code: 'email_domain_lost', severity: 'critical', since: '2026-11-22T08:00:00Z', data: { domain: 'shop.example', reasons: ['dmarc_missing', 'spf_missing'] } };
  const IYS_LATE = { code: 'iys_sync', severity: 'warning', since: null, data: { pullStatus: 'ok', pullErrorCode: null, late: 2, atRisk: 0, breached: 0, failed: 0, deadlineMissed: 0 } };

  it('is not shown when there is nothing, and the Settings tab has no dot', async () => {
    iysApi({ attention: [] });
    renderHub();
    const panel = await openSettings();
    await within(panel).findByTestId('settings-iys');
    expect(within(panel).queryByTestId('settings-attention')).toBeNull();
    expect(screen.queryByTestId('settings-attention-dot')).toBeNull();
  });

  it('puts the serious items first on the Settings screen, in words, and a red dot on the tab', async () => {
    iysApi({ attention: [LOST, IYS_LATE] });
    renderHub();
    const dot = await screen.findByTestId('settings-attention-dot');
    expect(dot).toHaveAttribute('aria-label', 'needs attention');
    expect(dot.className).toContain('bg-red-500');
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-attention');
    const lost = within(card).getByTestId('attention-email_domain_lost');
    expect(lost).toHaveTextContent('Email domain no longer authenticated');
    expect(lost).toHaveTextContent('shop.example');
    expect(lost).toHaveTextContent('there is no DMARC record and there is no SPF record');
    expect(lost).toHaveTextContent('Live email sending is blocked');
    expect(within(card).getByTestId('attention-iys_sync')).toHaveTextContent('2 opt-outs have waited over a day to be reported to İYS');
    expect(within(card).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))).toEqual(['attention-email_domain_lost', 'attention-iys_sync']);
  });

  it('a warning alone gives an amber dot', async () => {
    iysApi({ attention: [IYS_LATE] });
    renderHub();
    expect((await screen.findByTestId('settings-attention-dot')).className).toContain('bg-amber-400');
  });

  it('a refused or failed request gives no dot and no error: a hint never breaks the page', async () => {
    mockApi((url, method) => (url.endsWith('/engage/settings/attention') ? json({ error: 'Forbidden' }, 403) : lists(url, method) ?? (url.endsWith('/engage/settings') ? json(READY) : json({}, 404))));
    renderHub();
    await screen.findByTestId('hub-tab-settings');
    await waitFor(() => expect(sent('GET', '/engage/settings/attention')).toHaveLength(1));
    expect(screen.queryByTestId('settings-attention-dot')).toBeNull();
  });

  it('is not even asked for by someone who is not an admin', async () => {
    useAuthStore.setState({ isAdmin: false });
    iysApi({ attention: [LOST] });
    renderHub();
    await screen.findByTestId('hub-tab-customers');
    expect(screen.queryByTestId('hub-tab-settings')).toBeNull();
    expect(sent('GET', '/engage/settings/attention')).toHaveLength(0);
  });
});

describe('delivery health and ops alerts (WP-29)', () => {
  const ACCOUNT = {
    accountId: 'w1', label: 'WhatsApp main', channel: 'whatsapp', provider: 'whatsapp_cloud', mode: 'test', status: 'failing' as const,
    last15m: { sent: 0, failed: 3, retried: 0 }, last24h: { sent: 6, bounced: 0, complained: 0, reports: 0 }, waitingForReport: 5,
    issues: [{ rule: 'credentials_rejected', severity: 'critical' as const }],
  };

  it('shows each account with its status in words and what it did recently', async () => {
    iysApi({ health: { checkedAt: '2026-11-23T10:00:00Z', accounts: [ACCOUNT, { ...ACCOUNT, accountId: 'e1', label: 'Email', channel: 'email', provider: 'ses', status: 'ok', issues: [], waitingForReport: 0, last24h: { sent: 40, bounced: 1, complained: 0, reports: 38 } }], tenant: [] } });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-delivery');
    expect(await within(card).findByTestId('delivery-status-w1')).toHaveTextContent('Needs action');
    expect(within(card).getByTestId('delivery-w1')).toHaveTextContent('Last 15 minutes: 0 handed over, 3 failed or retried.');
    expect(within(card).getByTestId('delivery-w1')).toHaveTextContent('5 accepted messages are still waiting for a delivery report');
    expect(within(card).getByTestId('delivery-status-e1')).toHaveTextContent('Delivering normally');
    expect(within(card).getByTestId('delivery-e1')).toHaveTextContent('40 sent, 38 reports back, 1 bounced, 0 complaints');
  });

  it('says so when there is no active account', async () => {
    iysApi({});
    renderHub();
    const panel = await openSettings();
    expect(await within(panel).findByTestId('delivery-none')).toBeInTheDocument();
  });

  it('lists open ops alerts under needs attention in plain words, one per account', async () => {
    iysApi({ attention: [
      { code: 'credentials_rejected', subject: 'w1', severity: 'critical', since: '2026-11-23T09:00:00Z', data: { provider: 'whatsapp_cloud', channel: 'whatsapp', count: 3, codes: [{ code: 'wa_190', count: 3 }] } },
      { code: 'gate_denials_systemic', subject: 'no_rate_card', severity: 'warning', since: '2026-11-23T09:05:00Z', data: { code: 'no_rate_card', count: 7, windowMinutes: 15 } },
      { code: 'delivery_reports_missing', subject: 'w1', severity: 'critical', since: '2026-11-23T09:10:00Z', data: { provider: 'whatsapp_cloud', waiting: 6 } },
    ] });
    renderHub();
    const panel = await openSettings();
    const card = await within(panel).findByTestId('settings-attention');
    expect(within(card).getByTestId('attention-credentials_rejected')).toHaveTextContent('whatsapp_cloud is refusing your credentials');
    expect(within(card).getByTestId('attention-credentials_rejected')).toHaveTextContent('Rotate the channel account');
    expect(within(card).getByTestId('attention-gate_denials_systemic')).toHaveTextContent('7 messages were refused in the last 15 minutes because no price is set for the channel');
    expect(within(card).getByTestId('attention-delivery_reports_missing')).toHaveTextContent('6 messages were accepted by whatsapp_cloud but nothing has been reported back');
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('WhatsApp card (WP-40c)', () => {
  const SETUP = {
    account: { id: 'w1', label: 'WhatsApp main', provider: 'whatsapp_cloud', mode: 'test', phoneNumberId: '102290129340398', wabaId: null },
    accountProblem: null,
    webhook: {
      url: 'https://api.example.com/api/engage/webhooks/w1', urlProblem: null,
      fields: ['messages', 'user_preferences', 'message_template_status_update'], lastDeliveryReportAt: null, lastTemplateUpdateAt: null,
    },
    check: { lastAttemptAt: '2026-11-23T10:00:00Z', lastOkAt: '2026-11-23T07:00:00Z', lastError: 'wa_190', consecutiveFailures: 3, templatesSeen: 2 },
    pacing: { limit: 250, limitIsDefault: true, contacted24h: 240, waiting: 12, waitingOverADay: 2 },
    templatesInUse: [
      { metaName: 'autumn_books', language: 'tr', journeyKeys: ['autumn'], recentMessages: 40, status: 'PAUSED', quality: 'RED', rejectedReason: null },
      { metaName: 'order_shipped', language: 'tr', journeyKeys: [], recentMessages: 3, status: 'APPROVED', quality: 'GREEN', rejectedReason: null },
    ],
    readiness: { sendMode: 'sandbox', ready: false, problems: [{ code: 'no_budget_cap', message: 'No monthly WhatsApp budget cap is set up.' }] },
    steps: [
      { step: 'account', done: true }, { step: 'waba_id', done: false }, { step: 'webhook_url', done: true },
      { step: 'template_check', done: false }, { step: 'templates_in_use', done: false }, { step: 'sending_ready', done: false },
    ],
  };
  function waApi(o: { setup?: unknown; check?: () => Response; attention?: unknown[] }) {
    iysApi({ attention: o.attention });
    const inner = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.endsWith('/engage/whatsapp/setup') && method === 'GET') { calls.push({ url, method, body: undefined }); return json(o.setup ?? SETUP); }
      if (url.endsWith('/engage/whatsapp/templates/check') && method === 'POST') { calls.push({ url, method, body: undefined }); return o.check ? o.check() : json({ ok: true, seen: 2, changed: 1, error: null }); }
      return inner(input, init);
    }) as typeof fetch;
  }

  it('shows the checklist, the webhook URL and fields to give Meta, the failing check in words, the daily limit and the templates in use', async () => {
    waApi({});
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-whatsapp');
    expect(await within(card).findByTestId('whatsapp-account')).toHaveTextContent('phone number id 102290129340398, WhatsApp Business Account not set');
    expect(within(card).getByTestId('whatsapp-step-account')).toHaveTextContent('WhatsApp account added');
    expect(within(card).getByTestId('whatsapp-step-account').querySelector('[aria-label="done"]')).not.toBeNull();
    expect(within(card).getByTestId('whatsapp-step-waba_id')).toHaveTextContent('Rotate the account with --config waba_id=<id>');
    expect(within(card).getByTestId('whatsapp-webhook-url')).toHaveTextContent('https://api.example.com/api/engage/webhooks/w1');
    expect(within(card).getByTestId('whatsapp-webhook')).toHaveTextContent('messages, user_preferences, message_template_status_update');
    expect(within(card).getByTestId('whatsapp-webhook-last')).toHaveTextContent('Last delivery report from Meta: none yet');
    expect(within(card).getByTestId('whatsapp-check-error')).toHaveTextContent('The last 3 checks failed: Meta refused the access token');
    expect(within(card).getByTestId('whatsapp-pacing-state')).toHaveTextContent('240 of 250 customers messaged in the last 24 hours (Meta\'s starting limit');
    expect(within(card).getByTestId('whatsapp-pacing-state')).toHaveTextContent('12 messages are waiting for room, 2 for over a day.');
    expect(within(card).getByTestId('whatsapp-template-autumn_books-tr')).toHaveTextContent('Paused by Meta, quality red');
    expect(within(card).getByTestId('whatsapp-template-autumn_books-tr')).toHaveTextContent('used by autumn; 40 messages in 7 days');
    expect(within(card).getByTestId('whatsapp-template-order_shipped-tr')).toHaveTextContent('Approved');
    expect(within(card).getByTestId('whatsapp-readiness')).toHaveTextContent('No monthly WhatsApp budget cap is set up.');
    expect(card).not.toHaveTextContent(/[ğüşıöçĞÜŞİÖÇ]/);
  });

  it('copies the webhook URL, and runs the template check on request', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    waApi({});
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-whatsapp');
    fireEvent.click(await within(card).findByTestId('whatsapp-webhook-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://api.example.com/api/engage/webhooks/w1'));
    expect(await within(card).findByText('Copied')).toBeInTheDocument();
    fireEvent.click(within(card).getByTestId('whatsapp-check-now'));
    expect(await within(card).findByTestId('whatsapp-check-result')).toHaveTextContent('Done: 2 templates read, 1 changed.');
    expect(sent('POST', '/engage/whatsapp/templates/check')).toHaveLength(1);
    await waitFor(() => expect(sent('GET', '/engage/whatsapp/setup').length).toBeGreaterThan(1));
  });

  it('a failed check says what to do; no account and no public address are said plainly', async () => {
    waApi({ check: () => json({ ok: false, seen: 0, changed: 0, error: 'waba_missing' }) });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-whatsapp');
    fireEvent.click(await within(card).findByTestId('whatsapp-check-now'));
    expect(await within(card).findByTestId('whatsapp-check-result')).toHaveTextContent('has no WhatsApp Business Account id (waba_id)');
  });

  it('without an account it shows the terminal command and no webhook or check', async () => {
    waApi({ setup: { ...SETUP, account: null, accountProblem: 'no_whatsapp_account', pacing: null, templatesInUse: [], webhook: { ...SETUP.webhook, url: null }, steps: SETUP.steps.map((s) => ({ ...s, done: false })) } });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-whatsapp');
    expect(await within(card).findByTestId('whatsapp-account-none')).toBeInTheDocument();
    expect(within(card).getByTestId('whatsapp-step-account')).toHaveTextContent('npm run engage:add-account -- --org <org id> --whatsapp');
    expect(within(card).queryByTestId('whatsapp-webhook')).toBeNull();
    expect(within(card).queryByTestId('whatsapp-check-now')).toBeNull();
    expect(within(card).getByTestId('whatsapp-templates-none')).toBeInTheDocument();
  });

  it('says when the server has no public address to build the webhook URL from', async () => {
    waApi({ setup: { ...SETUP, webhook: { ...SETUP.webhook, url: null, urlProblem: 'public_api_url_not_set' } } });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-whatsapp');
    expect(await within(card).findByTestId('whatsapp-webhook-missing')).toHaveTextContent('ENGAGE_PUBLIC_API_URL) is not set');
  });

  it('explains the WhatsApp alerts under needs attention', async () => {
    waApi({ attention: [
      { code: 'whatsapp_template_unhealthy', severity: 'critical', since: null, data: { count: 1, templates: [{ metaName: 'autumn_books', language: 'tr', status: 'PAUSED', quality: null, journeys: 1, recentMessages: 4 }] } },
      { code: 'whatsapp_template_check_failing', severity: 'warning', since: null, data: { failures: 3, code: 'wa_190' } },
      { code: 'whatsapp_frequency_limited', subject: 'w1', severity: 'warning', since: null, data: { sent: 100, limited: 12, rate: 0.12 } },
      { code: 'whatsapp_pacing_holding', subject: 'w1', severity: 'warning', since: null, data: { waiting: 30, overADay: 2, limit: 250, limitIsDefault: true } },
    ] });
    renderHub();
    const card = await within(await openSettings()).findByTestId('settings-attention');
    expect(within(card).getByTestId('attention-whatsapp_template_unhealthy')).toHaveTextContent('A WhatsApp template in use is stopped at Meta');
    expect(within(card).getByTestId('attention-whatsapp_template_unhealthy')).toHaveTextContent('autumn_books (paused by meta)');
    expect(within(card).getByTestId('attention-whatsapp_template_check_failing')).toHaveTextContent('It failed 3 times in a row. Meta refused the access token');
    expect(within(card).getByTestId('attention-whatsapp_frequency_limited')).toHaveTextContent('Meta did not deliver 12 of 100 WhatsApp messages in the last 24 hours (12%)');
    expect(within(card).getByTestId('attention-whatsapp_frequency_limited')).toHaveTextContent('These customers were not opted out.');
    expect(within(card).getByTestId('attention-whatsapp_pacing_holding')).toHaveTextContent('2 WhatsApp messages have waited over a day because the account may message 250 new customers in 24 hours');
  });
});
