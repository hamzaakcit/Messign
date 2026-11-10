import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EngageHub } from '@/engage/EngageHub';
import { CustomerDetailPage, decisionText } from '@/engage/CustomerDetailPage';
import type { CustomerTrail, CustomerListItem } from '@/engage/customersApi';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The Lucy page on engage: customers is its first section. */
const renderHub = () => render(
  <QueryClientProvider client={client()}>
    <MemoryRouter initialEntries={['/marketing']}><EngageHub /></MemoryRouter>
  </QueryClientProvider>,
);
/** One customer's record, as the panel shows it. */
const renderCustomer = (id: string) => render(
  <QueryClientProvider client={client()}>
    <MemoryRouter><CustomerDetailPage id={id} /></MemoryRouter>
  </QueryClientProvider>,
);

const row = (i: number, over: Partial<CustomerListItem> = {}): CustomerListItem => ({
  id: `00000000-0000-0000-0000-00000000000${i}`, externalId: `kitap-${i}`, email: `c${i}@example.com`, emailConsent: 'granted',
  suppressed: false, erased: false, createdAt: '2026-11-09T10:00:00Z', lastEventAt: null, ...over,
});

const ID = '00000000-0000-0000-0000-000000000001';
const TRAIL: CustomerTrail = {
  profile: {
    id: ID, externalId: 'kitap-1', attributes: {}, timezone: null, locale: null, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
    erasedAt: null, identifiers: { email: 'ayse@example.com', phone: null }, consents: { email: 'revoked' },
  },
  identifiers: [{ type: 'email', value: 'ayse@example.com', active: true, firstSeenAt: '2026-11-01T10:00:00Z', deactivatedAt: null }],
  consents: [
    { id: 'c2', channel: 'email', status: 'revoked', source: 'web', recordedAt: '2026-11-05T10:00:00Z', evidence: {} },
    { id: 'c1', channel: 'email', status: 'granted', source: 'import', recordedAt: '2026-11-01T10:00:00Z', evidence: { file: 'x' } },
  ],
  suppressions: [],
  enrollments: [{
    id: 'e1', journeyKey: 'cart-abandonment', journeyName: 'Sepet terk', version: 1, status: 'exited', endReason: 'exit_event', cohort: 'holdout',
    triggerKind: 'event', enteredAt: '2026-11-02T10:00:00Z', endedAt: '2026-11-02T12:00:00Z', currentStep: 'wait-24h',
    steps: [
      { stepId: 'wait-1h', stepType: 'delay', status: 'done', outcome: 'elapsed', startedAt: '2026-11-02T10:00:00Z', wakeAt: '2026-11-02T11:00:00Z', doneAt: '2026-11-02T11:00:00Z', messageId: null },
      { stepId: 'reminder-1', stepType: 'message', status: 'done', outcome: 'held_out', startedAt: '2026-11-02T11:00:00Z', wakeAt: null, doneAt: '2026-11-02T11:00:00Z', messageId: null },
    ],
  }],
  messages: [
    {
      id: 'm2', channel: 'email', purpose: 'marketing', status: 'blocked', errorCode: 'no_consent', createdAt: '2026-11-06T10:00:00Z',
      subject: 'Sepetiniz bekliyor', template: { id: 't', version: 1 }, renderError: null,
      journey: { enrollmentId: 'e0', journeyKey: 'cart-abandonment', stepId: 'reminder-1' },
      events: [{ type: 'blocked', source: 'system', occurredAt: '2026-11-06T10:00:01Z', errorCode: 'no_consent' }],
      decisions: [{ id: 'd2', decision: 'deny', code: 'no_consent', reasons: [{ code: 'no_consent' }, { code: 'frequency_cap' }], sendMode: 'sandbox', createdAt: '2026-11-06T10:00:01Z', retryAt: null,
        consentInForce: { id: 'c2', status: 'revoked', source: 'web', recordedAt: '2026-11-05T10:00:00Z' } }],
    },
    {
      id: 'm1', channel: 'email', purpose: 'marketing', status: 'delivered', errorCode: null, createdAt: '2026-11-03T10:00:00Z',
      subject: 'Yeni kitaplar', template: null, renderError: null, journey: null,
      events: [{ type: 'sent', source: 'system', occurredAt: '2026-11-03T10:00:01Z', errorCode: null }],
      decisions: [{ id: 'd1', decision: 'allow', code: 'allowed', reasons: [], sendMode: 'sandbox', createdAt: '2026-11-03T10:00:01Z', retryAt: null, consentInForce: null }],
    },
  ],
  events: [{ id: 'ev1', name: 'cart_updated', occurredAt: '2026-11-02T10:00:00Z', receivedAt: '2026-11-02T10:00:00Z', properties: {} }],
};

describe('engage customers (WP-19, in the Lucy page)', () => {
  const original = globalThis.fetch;
  let urls: string[];
  const mockFetch = (handler: (url: string) => Response) => {
    urls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return handler(url); }) as typeof fetch;
  };
  afterEach(() => { globalThis.fetch = original; });

  it('lists customers with their consent state and opens one in a panel on the page', async () => {
    mockFetch((url) => (url.includes('/trail') ? json(TRAIL) : json({ profiles: [row(1), row(2, { suppressed: true }), row(3, { emailConsent: null, email: null })], nextCursor: null })));
    renderHub();
    expect(await screen.findByText('kitap-1')).toBeInTheDocument();
    expect(screen.getByText('suppressed')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
    fireEvent.click(screen.getByText('kitap-1'));
    expect(await screen.findByRole('heading', { name: 'kitap-1' })).toBeInTheDocument();
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('engage-customer'));
    expect(urls.some((u) => u.endsWith(`/engage/profiles/${ID}/trail`))).toBe(true);
  });

  it('searches (after typing stops) and loads the next page with the cursor', async () => {
    mockFetch((url) => {
      if (url.includes('cursor=next1')) return json({ profiles: [row(5)], nextCursor: null });
      if (url.includes('q=ayse')) return json({ profiles: [row(4)], nextCursor: 'next1' });
      return json({ profiles: [row(1)], nextCursor: null });
    });
    renderHub();
    await screen.findByText('kitap-1');
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'ayse@example.com' } });
    expect(await screen.findByText('kitap-4')).toBeInTheDocument();
    expect(urls.some((u) => u.includes('q=ayse%40example.com'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('kitap-5')).toBeInTheDocument();
    expect(screen.getByText('kitap-4')).toBeInTheDocument();
  });

  it('says so when there are no customers, and when loading fails', async () => {
    mockFetch(() => json({ profiles: [], nextCursor: null }));
    const empty = renderHub();
    expect(await screen.findByText(/No customers yet/)).toBeInTheDocument();
    empty.unmount();
    mockFetch(() => json({ error: 'boom' }, 500));
    renderHub();
    expect(await screen.findByText(/Could not load customers/)).toBeInTheDocument();
  });

  it('acceptance: each message shows its gate decision and the consent in force at that decision', async () => {
    mockFetch(() => json(TRAIL));
    renderCustomer(ID);
    const messages = await screen.findAllByTestId('trail-message');
    expect(messages).toHaveLength(2);
    const blocked = within(messages[0]!);
    expect(blocked.getByText('Sepetiniz bekliyor')).toBeInTheDocument();
    expect(blocked.getByText(/Journey cart-abandonment, step reminder-1/)).toBeInTheDocument();
    expect(blocked.getByText('deny')).toBeInTheDocument();
    expect(blocked.getByText('no marketing consent')).toBeInTheDocument();
    expect(blocked.getByText(/Also: frequency cap reached/)).toBeInTheDocument();
    expect(blocked.getByTestId('consent-in-force')).toHaveTextContent(/Consent in force: revoked \(web, recorded/);
    const sent = within(messages[1]!);
    expect(sent.getByText('allow')).toBeInTheDocument();
    expect(sent.getByText(/Sent directly/)).toBeInTheDocument();
    expect(sent.getByTestId('consent-in-force')).toHaveTextContent('Consent in force: none recorded at that time');
  });

  it('shows journeys step by step (holdout says so), consent history and events', async () => {
    mockFetch(() => json(TRAIL));
    renderCustomer(ID);
    const enrollment = await screen.findByTestId('trail-enrollment');
    expect(within(enrollment).getByText(/holdout: no messages/)).toBeInTheDocument();
    expect(within(enrollment).getByText(/exit event/)).toBeInTheDocument();
    expect(within(enrollment).getByText(/reminder-1 \(message\): held out/)).toBeInTheDocument();
    expect(screen.getByText(/Marketing consent: email revoked/)).toBeInTheDocument();
    expect(screen.getByText(/via import/)).toBeInTheDocument();
    expect(screen.getByText('cart_updated')).toBeInTheDocument();
  });

  it('a missing customer is a clear message, not a crash', async () => {
    mockFetch(() => json({ error: 'Profile not found' }, 404));
    renderCustomer('00000000-0000-0000-0000-000000000009');
    expect(await screen.findByText('This customer does not exist.')).toBeInTheDocument();
  });

  it('names gate codes in words, including template errors', () => {
    expect(decisionText('suppressed')).toBe('address suppressed');
    expect(decisionText('render_missing_variable')).toBe('template could not be filled (missing_variable)');
    expect(decisionText('something_new')).toBe('something new');
  });
});

describe('header breadcrumbs (WP-19)', () => {
  it('show a record id as "Details", not as a string of words', async () => {
    const { breadcrumbLabel } = await import('@/components/layout/Header');
    expect(breadcrumbLabel('3d0aae44-b1cb-49c0-9457-0523a2289b01')).toBe('Details');
    expect(breadcrumbLabel('brand-profiles')).toBe('Brand Profiles');
  });
});
