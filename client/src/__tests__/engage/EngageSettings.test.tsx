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
