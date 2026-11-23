import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EngageHub } from '@/engage/EngageHub';
import { definitionToRows, rowsToDefinition } from '@/engage/SegmentsView';
import { useAuthStore } from '@/stores/authStore';

/**
 * The engage side of the Lucy page (WP-20/21 flows): sections, panels and the forms in them, against a fake API. Nothing
 * here is a separate page: every flow starts on /marketing and ends on /marketing with a panel open.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
interface Call { url: string; method: string; body: unknown }
let calls: Call[];
const original = globalThis.fetch;
function mockApi(handler: (url: string, method: string, body: unknown) => Response) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    return handler(url, method, body);
  }) as typeof fetch;
}
const posted = (part: string) => calls.filter((c) => c.method === 'POST' && c.url.includes(part));

const client = (staleTime?: number) => new QueryClient({ defaultOptions: { queries: { retry: false, ...(staleTime !== undefined ? { staleTime } : {}) } } });
function renderHub(qc = client()) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/marketing']}><EngageHub /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const VERSION = (version: number, status: string, definition: Record<string, unknown>) => ({
  id: `v${version}`, version, status, definition, createdBy: null, createdAt: '2026-11-10T10:00:00Z',
  approvedBy: null, approvedAt: status === 'draft' ? null : '2026-11-10T11:00:00Z', activatedBy: null, activatedAt: status === 'active' || status === 'retired' ? '2026-11-10T12:00:00Z' : null,
  deactivatedBy: null, deactivatedAt: status === 'retired' ? '2026-11-10T13:00:00Z' : null,
});
const CART = {
  trigger: { type: 'event', event: 'cart_updated' }, exit_when: [{ event: 'order_completed' }], re_entry: 'after_exit', holdout_percent: 10,
  steps: [{ id: 'wait', type: 'delay', minutes: 60 }, { id: 'remind', type: 'message', channel: 'email', template: 'cart-reminder', purpose: 'marketing' }],
};
const CART_JOURNEY = { id: 'j1', key: 'cart', name: 'Cart', createdAt: '', activeVersion: 1, latestVersion: 2 };

/** The lists the sections load when a test does not look at them. Specific routes are matched before this. */
function lists(url: string, method: string): Response | null {
  if (method !== 'GET') return null;
  if (url.includes('/engage/profiles')) return json({ profiles: [], nextCursor: null });
  if (url.endsWith('/engage/templates')) return json({ templates: [] });
  if (url.endsWith('/engage/segments')) return json({ segments: [] });
  if (url.endsWith('/engage/journeys')) return json({ journeys: [] });
  return null;
}

beforeEach(() => { useAuthStore.setState({ isAdmin: true }); });
afterEach(() => { globalThis.fetch = original; });

describe('the Lucy page on engage: sections, tiles and quick actions (WP-20)', () => {
  it('has the four sections as tabs and tiles, and only an admin gets the create actions', async () => {
    mockApi((url, method) => lists(url, method) ?? json({}, 404));
    useAuthStore.setState({ isAdmin: false });
    renderHub();
    expect(screen.getByTestId('hub-tab-customers')).toHaveAttribute('aria-selected', 'true');
    for (const id of ['customers', 'journeys', 'segments', 'templates']) expect(screen.getByTestId(`hub-go-${id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('hub-new-journey')).toBeNull();
    expect(screen.getByText(/Only a tenant admin can create or change journeys/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    expect(await screen.findByTestId('hub-journeys')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-go-templates'));
    expect(await screen.findByTestId('hub-templates')).toBeInTheDocument();
    expect(screen.getByTestId('hub-tab-templates')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('journeys (WP-20)', () => {
  it('lists journeys with whether they run', async () => {
    mockApi((url, method) => (url.endsWith('/engage/journeys') && method === 'GET'
      ? json({ journeys: [
        { id: 'j1', key: 'cart', name: 'Cart abandonment', createdAt: '2026-11-10T10:00:00Z', activeVersion: 2, latestVersion: 3 },
        { id: 'j2', key: 'welcome', name: 'Welcome', createdAt: '2026-11-10T10:00:00Z', activeVersion: null, latestVersion: 1 },
      ] })
      : lists(url, method) ?? json({}, 404)));
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    expect(await screen.findByText('Cart abandonment')).toBeInTheDocument();
    expect(screen.getByTestId('status-active')).toBeInTheDocument();
    expect(screen.getByText(/not running \(latest v1\)/)).toBeInTheDocument();
  });

  it('acceptance (UI part): create a journey in the form, save it as a draft, approve and activate it', async () => {
    let versions = [VERSION(1, 'draft', CART)];
    mockApi((url, method) => {
      if (method === 'GET' && url.endsWith('/engage/templates')) return json({ templates: [{ id: 't1', key: 'cart-reminder', name: 'Cart reminder', channel: 'email', createdAt: '', latestVersion: 1 }] });
      if (method === 'POST' && url.endsWith('/engage/journeys')) return json({ journey: { id: 'j9', key: 'cart', name: 'Cart' }, version: versions[0] }, 201);
      if (url.includes('/versions/1/approve')) { versions = [VERSION(1, 'approved', CART)]; return json({ version: versions[0] }); }
      if (url.includes('/versions/1/activate')) { versions = [VERSION(1, 'active', CART)]; return json({ version: versions[0] }); }
      if (method === 'GET' && url.endsWith('/engage/journeys/j9')) return json({ journey: { id: 'j9', key: 'cart', name: 'Cart', createdAt: '', activeVersion: null, latestVersion: 1 }, versions });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.change(screen.getByLabelText('Journey name'), { target: { value: 'Cart' } });
    fireEvent.change(screen.getByLabelText('Journey key'), { target: { value: 'cart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add exit event' }));
    fireEvent.change(screen.getByLabelText('Re-entry'), { target: { value: 'after_exit' } });
    fireEvent.click(screen.getByTestId('add-message'));
    await waitFor(() => expect(screen.getByTestId('step-1-template')).toHaveTextContent('cart-reminder'));
    fireEvent.change(screen.getByTestId('step-1-template'), { target: { value: 'cart-reminder' } });
    fireEvent.change(screen.getByLabelText('Step 2 id'), { target: { value: 'remind' } });
    fireEvent.click(screen.getByTestId('save-journey'));
    // Saved: the panel moves to the new journey, which is a draft version with approve and activate.
    fireEvent.click(await screen.findByTestId('approve-1'));
    expect(posted('/engage/journeys')[0]!.body).toEqual({ key: 'cart', name: 'Cart', definition: CART });
    fireEvent.click(await screen.findByTestId('activate-1'));
    expect(await screen.findAllByTestId('status-active')).not.toHaveLength(0);
    expect(posted('/approve')).toHaveLength(1);
    expect(posted('/activate')).toHaveLength(1);
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('engage-journey'));
  });

  it('creates a date-attribute journey: asks for the attribute, the days and the time, and always lets customers enter again', async () => {
    const DATE_DEF = {
      trigger: { type: 'date_attribute', attribute: 'anniversary_date', offset_days: -7, at_local_time: '09:30' },
      exit_when: [], re_entry: 'after_exit', holdout_percent: 10, steps: [{ id: 'wait', type: 'delay', minutes: 60 }],
    };
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/journeys')) return json({ journey: { id: 'j8', key: 'occasion', name: 'Occasion' }, version: VERSION(1, 'draft', DATE_DEF) }, 201);
      if (method === 'GET' && url.endsWith('/engage/journeys/j8')) return json({ journey: { id: 'j8', key: 'occasion', name: 'Occasion', createdAt: '', activeVersion: null, latestVersion: 1 }, versions: [VERSION(1, 'draft', DATE_DEF)] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.change(screen.getByLabelText('Journey name'), { target: { value: 'Occasion' } });
    fireEvent.change(screen.getByLabelText('Journey key'), { target: { value: 'occasion' } });
    expect(screen.getByLabelText('Re-entry')).toBeEnabled();
    fireEvent.change(screen.getByTestId('trigger-type'), { target: { value: 'date_attribute' } });
    fireEvent.change(screen.getByLabelText('Date attribute'), { target: { value: 'anniversary_date' } });
    fireEvent.change(screen.getByLabelText('Days from the date'), { target: { value: '-7' } });
    fireEvent.change(screen.getByLabelText('At local time'), { target: { value: '09:30' } });
    expect(screen.getByTestId('date-trigger-note')).toHaveTextContent(/once per year|Each customer is enrolled once per year/);
    // A date comes round every year, so the choice is made for the marketer and says why.
    expect(screen.getByLabelText('Re-entry')).toBeDisabled();
    expect(screen.getByLabelText('Re-entry')).toHaveValue('after_exit');
    expect(screen.getByTestId('reentry-note')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('save-journey'));
    await waitFor(() => expect(posted('/engage/journeys')).toHaveLength(1));
    expect(posted('/engage/journeys')[0]!.body).toEqual({ key: 'occasion', name: 'Occasion', definition: DATE_DEF });
  });

  it('shows the server\'s field issues when saving is refused, and keeps what was typed', async () => {
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/journeys')) return json({ error: 'The journey definition is not valid', issues: [{ path: 'steps[0].minutes', message: 'Expected number, received nan' }] }, 400);
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.change(screen.getByLabelText('Journey name'), { target: { value: 'Broken' } });
    fireEvent.change(screen.getByLabelText('Step 1 minutes'), { target: { value: 'an hour' } });
    fireEvent.click(screen.getByTestId('save-journey'));
    const issues = await screen.findByTestId('issues');
    expect(issues).toHaveTextContent('steps[0].minutes');
    expect(screen.getByLabelText('Journey name')).toHaveValue('Broken');
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('journey-editor'));
  });

  it('checks with the server without saving', async () => {
    mockApi((url, method) => (url.includes('/validate') ? json({ ok: true, errors: [] }) : lists(url, method) ?? json({}, 404)));
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('The journey is valid.')).toBeInTheDocument();
    expect(posted('/engage/journeys').filter((c) => !c.url.includes('validate'))).toHaveLength(0);
  });

  it('a definition the form cannot show opens as JSON and is saved unchanged as a new version', async () => {
    const rich = { ...CART, trigger: { type: 'event', event: 'cart_updated', filter: { all: [{ field: 'event.total', op: 'gt', value: 1 }, { field: 'attributes.vip', op: 'exists' }] } } };
    mockApi((url, method) => {
      if (method === 'POST' && url.includes('/versions')) return json({ version: VERSION(2, 'draft', rich) }, 201);
      if (method === 'GET' && url.endsWith('/engage/journeys/j1')) return json({ journey: CART_JOURNEY, versions: [VERSION(1, 'active', rich)] });
      if (method === 'GET' && url.endsWith('/engage/journeys')) return json({ journeys: [CART_JOURNEY] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cart' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New version from this' }));
    expect(await screen.findByText(/combines several conditions/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('save-journey'));
    await waitFor(() => expect(posted('/versions')).toHaveLength(1));
    expect(posted('/versions')[0]!.body).toEqual({ definition: rich });
  });

  it('only an admin sees approve, activate and stop; stopping asks first', async () => {
    const data = { journey: CART_JOURNEY, versions: [VERSION(2, 'draft', CART), VERSION(1, 'active', CART)] };
    mockApi((url, method) => {
      if (url.includes('/deactivate')) return json({ retiredVersion: 1 });
      if (method === 'GET' && url.endsWith('/engage/journeys/j1')) return json(data);
      if (method === 'GET' && url.endsWith('/engage/journeys')) return json({ journeys: [CART_JOURNEY] });
      return lists(url, method) ?? json({}, 404);
    });
    useAuthStore.setState({ isAdmin: false });
    const member = renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cart' }));
    await screen.findByTestId('version-2');
    expect(screen.queryByTestId('approve-2')).toBeNull();
    expect(screen.queryByTestId('stop-journey')).toBeNull();
    expect(screen.getByText(/Only a tenant admin can approve/)).toBeInTheDocument();
    member.unmount();
    useAuthStore.setState({ isAdmin: true });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cart' }));
    fireEvent.click(await screen.findByTestId('stop-journey'));
    expect(posted('/deactivate')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('confirm-stop'));
    await waitFor(() => expect(posted('/deactivate')).toHaveLength(1));
  });

  it('describes each version in words and shows scheduled runs for a segment journey', async () => {
    const seg = { trigger: { type: 'segment', segment: 'lapsed', segment_version: 2, every_days: 7, at_local_time: '10:00' }, exit_when: [], re_entry: 'never', holdout_percent: 0,
      steps: [{ id: 'm', type: 'message', channel: 'email', template: 'winback', purpose: 'marketing' }] };
    const winback = { id: 'j1', key: 'wb', name: 'Win-back', createdAt: '', activeVersion: 1, latestVersion: 1 };
    mockApi((url, method) => {
      if (url.includes('segment-runs')) return json({ runs: [{ id: 'r1', slot: '2026-11-17T07:00:00Z', status: 'done', matched: 120, enrolled: 118, skipped: 2, truncated: false, error: null, startedAt: '', finishedAt: '' }] });
      if (method === 'GET' && url.endsWith('/engage/journeys/j1')) return json({ journey: winback, versions: [VERSION(1, 'active', seg)] });
      if (method === 'GET' && url.endsWith('/engage/journeys')) return json({ journeys: [winback] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByRole('button', { name: 'Win-back' }));
    expect(await screen.findByText(/every 7 day\(s\) at 10:00 for segment lapsed v2/)).toBeInTheDocument();
    expect(screen.getByText(/Send email "winback"/)).toBeInTheDocument();
    expect(await screen.findByText(/120 matched · 118 entered/)).toBeInTheDocument();
  });

  it('after activating, the list shows the journey running without a reload', async () => {
    let active = false;
    const summary = () => ({ id: 'j1', key: 'k', name: 'Fresh', createdAt: '', activeVersion: active ? 1 : null, latestVersion: 1 });
    mockApi((url, method) => {
      if (url.includes('/activate')) { active = true; return json({ version: {} }); }
      if (method === 'GET' && url.endsWith('/engage/journeys')) return json({ journeys: [summary()] });
      if (method === 'GET' && url.endsWith('/engage/journeys/j1')) return json({ journey: summary(), versions: [VERSION(1, active ? 'active' : 'approved', CART)] });
      return lists(url, method) ?? json({}, 404);
    });
    // Nothing is marked stale here: the refresh after activation has to come from the page's own invalidation.
    renderHub(client(Infinity));
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    expect(await screen.findByText(/not running/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Fresh' }));
    fireEvent.click(await screen.findByTestId('activate-1'));
    await screen.findAllByTestId('status-active');
    fireEvent.click(screen.getByTestId('hub-go-journeys'));
    expect(within(await screen.findByTestId('hub-journeys')).getByTestId('status-active')).toBeInTheDocument();
  });
});

describe('segments (WP-20)', () => {
  it('rows round-trip to definitions, and richer definitions are left to JSON', () => {
    const def = { where: { any: [{ field: 'orders.count', op: 'gte', value: 2 }, { field: 'attributes.city', op: 'in', value: ['İstanbul', 'Ankara'] }] } };
    const rows = definitionToRows(def);
    expect(rows && rowsToDefinition(rows)).toEqual(def);
    expect(definitionToRows({ where: { field: 'consent.email', op: 'eq', value: 'granted' } })).toMatchObject({ rows: [{ field: 'consent.email' }] });
    expect(definitionToRows({ where: { not: { field: 'orders.count', op: 'eq', value: 0 } } })).toBeNull();
  });

  it('counts a new segment before saving, then saves it and opens it', async () => {
    const lapsed = { id: 's1', key: 'lapsed', name: 'Lapsed', createdAt: '', latestVersion: 1 };
    mockApi((url, method) => {
      if (url.includes('/preview')) return json({ count: 42, sample: [{ id: 'p1', externalId: 'c-1' }], evaluatedAt: '' });
      if (method === 'POST' && url.endsWith('/engage/segments')) return json({ segment: lapsed, version: { id: 'sv1', version: 1, definition: {}, createdAt: '' } }, 201);
      if (method === 'GET' && url.endsWith('/engage/segments/s1')) return json({ segment: lapsed, versions: [{ id: 'sv1', version: 1, definition: {}, createdAt: '' }] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-segments'));
    fireEvent.click(await screen.findByTestId('hub-new-segment'));
    fireEvent.change(await screen.findByLabelText('Segment name'), { target: { value: 'Lapsed' } });
    fireEvent.change(screen.getByLabelText('Segment key'), { target: { value: 'lapsed' } });
    fireEvent.click(screen.getByTestId('count-segment'));
    expect(await screen.findByTestId('segment-count')).toHaveTextContent('42 customers match now');
    expect(posted('/preview')[0]!.body).toEqual({ definition: { where: { all: [
      { field: 'orders.count', op: 'gte', value: 1 }, { field: 'orders.days_since_last', op: 'gte', value: 90 }, { field: 'consent.email', op: 'eq', value: 'granted' },
    ] } } });
    fireEvent.click(screen.getByTestId('save-segment'));
    expect(await screen.findByTestId('engage-segment')).toBeInTheDocument();
    expect(posted('/engage/segments').find((c) => c.url.endsWith('/engage/segments'))!.body).toMatchObject({ key: 'lapsed', name: 'Lapsed' });
  });
});

describe('templates (WP-20)', () => {
  it('creates a template that starts with an unsubscribe link, and previews a version in a sandboxed frame', async () => {
    mockApi((url, method) => {
      if (url.includes('/preview')) return json({ version: 1, subject: 'Hi Ayşe', html: '<p>Hi Ayşe</p><script>window.top.x=1</script>', text: null, errors: [], variables: [] });
      if (method === 'POST' && url.endsWith('/engage/templates')) return json({ template: { id: 't1' }, version: {} }, 201);
      if (method === 'GET' && url.endsWith('/engage/templates/t1')) return json({ template: { id: 't1', key: 'hello', name: 'Hello', channel: 'email', createdAt: '', latestVersion: 1 }, versions: [{ id: 'v1', version: 1, subject: 'Hi {{first_name}}', html: '<p>Hi</p>', text: null, createdAt: '' }] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-templates'));
    fireEvent.click(await screen.findByTestId('hub-new-template'));
    expect((await screen.findByLabelText('HTML') as HTMLTextAreaElement).value).toContain('{{unsubscribe_url}}');
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Template key'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hi {{first_name}}' } });
    fireEvent.click(screen.getByTestId('save-template'));
    fireEvent.click(await screen.findByTestId('preview-1'));
    const frame = await screen.findByTitle('Preview of version 1');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(within(document.body).getByText(/Hi Ayşe/)).toBeInTheDocument();
  });
});

describe('WhatsApp templates (WP-40a)', () => {
  const WA = { id: 'w1', key: 'cart-wa', name: 'Cart on WhatsApp', channel: 'whatsapp', createdAt: '', latestVersion: 1 };
  const EMAIL = { id: 't1', key: 'cart-reminder', name: 'Cart reminder', channel: 'email', createdAt: '', latestVersion: 1 };
  const DETAIL = {
    template: WA,
    whatsappVersions: [{
      id: 'v1', version: 1, createdAt: '',
      content: {
        metaName: 'cart_reminder', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply', bodyText: 'Merhaba {{1}}, sepetinde {{2}} bekliyor.',
        variables: [{ position: 1, source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }, { position: 2, source: 'payload', name: 'book', defaultValue: null }],
        header: null, urlButton: { index: 0, baseUrl: 'https://shop.example.com/cart/', variable: { source: 'payload', name: 'cart_id', defaultValue: null } },
      },
    }],
    health: { status: { status: 'PAUSED', category: 'MARKETING', quality: 'RED', rejectedReason: null, seenAt: '2026-11-23T10:00:00Z' }, sendable: false, category: 'marketing', problems: ['not_approved'], warnings: [] },
  };

  it('labels a WhatsApp template in the list and shows how Meta stands on it and where each value comes from', async () => {
    mockApi((url, method) => {
      if (method === 'GET' && url.endsWith('/engage/templates')) return json({ templates: [WA, EMAIL] });
      if (method === 'GET' && url.endsWith('/engage/templates/w1')) return json(DETAIL);
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-templates'));
    expect(await screen.findByTestId('template-channel-w1')).toHaveTextContent('WhatsApp');
    expect(screen.queryByTestId('template-channel-t1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Cart on WhatsApp'));
    const panel = await screen.findByTestId('engage-whatsapp-template');
    expect(within(panel).getByTestId('whatsapp-meta-status')).toHaveTextContent('paused · marketing · quality red');
    expect(within(panel).getByTestId('whatsapp-sendable')).toHaveTextContent('Not sendable yet.');
    expect(within(panel).getByTestId('whatsapp-problems')).toHaveTextContent('Meta has not approved this template, or has paused or disabled it.');
    expect(within(panel).getByTestId('whatsapp-variables')).toHaveTextContent('{{1}} customer field first_name, or "merhaba"');
    expect(within(panel).getByTestId('whatsapp-variables')).toHaveTextContent('Button link: https://shop.example.com/cart/ followed by trigger value cart_id');
    // A new version opens the WhatsApp form filled with the latest mapping, never the email editor.
    fireEvent.click(within(panel).getByTestId('whatsapp-new-version'));
    expect(await within(panel).findByTestId('whatsapp-template-form')).toBeInTheDocument();
    expect((within(panel).getByLabelText('Name at Meta') as HTMLInputElement).value).toBe('cart_reminder');
    expect(within(panel).queryByLabelText('HTML')).not.toBeInTheDocument();
  });

  it('creates a WhatsApp template from one Meta lists: the body fills in and each {{n}} gets a row (WP-40b)', async () => {
    mockApi((url, method) => {
      if (method === 'GET' && url.endsWith('/engage/whatsapp/templates')) return json({
        check: { lastAttemptAt: '2026-11-23T10:00:00Z', lastOkAt: '2026-11-23T10:00:00Z', lastError: null, consecutiveFailures: 0, templatesSeen: 1 },
        templates: [{ metaName: 'cart_reminder', language: 'tr', status: 'APPROVED', category: 'MARKETING', quality: 'GREEN', rejectedReason: null, seenAt: '', registeredAs: [],
          shape: { bodyText: 'Merhaba {{1}}, sepetinde {{2}} bekliyor.', bodyVariables: 2, headerFormat: null, buttons: ['QUICK_REPLY'] } }],
        unmatched: [],
      });
      if (method === 'POST' && url.endsWith('/engage/templates')) return json({ template: { id: 'w9' } }, 201);
      if (method === 'GET' && url.endsWith('/engage/templates/w9')) return json(DETAIL);
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-templates'));
    fireEvent.click(await screen.findByTestId('hub-new-template'));
    fireEvent.change(await screen.findByTestId('template-channel'), { target: { value: 'whatsapp' } });
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Cart on WhatsApp' } });
    fireEvent.change(screen.getByLabelText('Template key'), { target: { value: 'cart-wa' } });
    await waitFor(() => expect((screen.getByTestId('whatsapp-from-meta') as HTMLSelectElement).options.length).toBe(2));
    fireEvent.change(screen.getByTestId('whatsapp-from-meta'), { target: { value: 'cart_reminder|tr' } });
    expect((screen.getByTestId('whatsapp-body') as HTMLTextAreaElement).value).toBe('Merhaba {{1}}, sepetinde {{2}} bekliyor.');
    fireEvent.change(screen.getByLabelText('{{1}} field'), { target: { value: 'first_name' } });
    fireEvent.change(screen.getByLabelText('{{1}} default'), { target: { value: 'merhaba' } });
    fireEvent.change(screen.getByLabelText('{{2}} source'), { target: { value: 'payload' } });
    fireEvent.change(screen.getByLabelText('{{2}} field'), { target: { value: 'book' } });
    expect(screen.getByTestId('whatsapp-preview')).toHaveTextContent('Merhaba [first_name], sepetinde [book] bekliyor.');
    fireEvent.click(screen.getByTestId('save-whatsapp-template'));
    await waitFor(() => expect(posted('/engage/templates')).toHaveLength(1));
    expect(posted('/engage/templates')[0]!.body).toEqual({
      channel: 'whatsapp', key: 'cart-wa', name: 'Cart on WhatsApp',
      content: {
        metaName: 'cart_reminder', language: 'tr', declaredCategory: 'marketing', optOut: 'quick_reply', bodyText: 'Merhaba {{1}}, sepetinde {{2}} bekliyor.',
        variables: [{ source: 'attribute', name: 'first_name', defaultValue: 'merhaba' }, { source: 'payload', name: 'book', defaultValue: null }],
        header: null, urlButton: null,
      },
    });
    expect(await screen.findByTestId('engage-whatsapp-template')).toBeInTheDocument();
  });

  it('a message step chooses its channel, and the WhatsApp-else-email preset builds the branch', async () => {
    mockApi((url, method) => {
      if (method === 'GET' && url.endsWith('/engage/templates')) return json({ templates: [WA, EMAIL] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.click(screen.getByTestId('add-message'));
    fireEvent.change(screen.getByTestId('step-1-channel'), { target: { value: 'whatsapp' } });
    await waitFor(() => expect(screen.getByTestId('step-1-template')).toHaveTextContent('cart-wa'));
    expect(screen.getByTestId('step-1-template')).not.toHaveTextContent('cart-reminder');
    fireEvent.click(screen.getByTestId('add-whatsapp-or-email'));
    // choose-1 (branch on reachable.whatsapp), whatsapp-1, email-1, done-1
    expect(screen.getByLabelText('Step 3 rule 1 field')).toHaveValue('reachable.whatsapp');
    expect(screen.getByTestId('step-3-channel')).toHaveValue('whatsapp');
    expect(screen.getByTestId('step-4-channel')).toHaveValue('email');
  });

  it('keeps WhatsApp templates out of the email step picker of a journey', async () => {
    mockApi((url, method) => {
      if (method === 'GET' && url.endsWith('/engage/templates')) return json({ templates: [WA, EMAIL] });
      return lists(url, method) ?? json({}, 404);
    });
    renderHub();
    fireEvent.click(screen.getByTestId('hub-tab-journeys'));
    fireEvent.click(await screen.findByTestId('hub-new-journey'));
    await screen.findByTestId('journey-editor');
    fireEvent.click(screen.getByTestId('add-message'));
    await waitFor(() => expect(screen.getByTestId('step-1-template')).toHaveTextContent('cart-reminder'));
    expect(screen.getByTestId('step-1-template')).not.toHaveTextContent('cart-wa');
  });
});
