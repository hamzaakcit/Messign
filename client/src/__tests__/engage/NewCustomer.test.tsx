import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngageHub } from '@/engage/EngageHub';
import { NewCustomerPanel } from '@/engage/NewCustomerPanel';
import { useAuthStore } from '@/stores/authStore';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const original = globalThis.fetch;

let calls: Array<{ url: string; method: string; body: unknown }> = [];
function mockApi(handler: (url: string, method: string) => Response) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, method);
  }) as typeof fetch;
}
const posted = () => calls.filter((c) => c.method === 'POST' && new URL(c.url, 'http://localhost').pathname === '/api/engage/profiles');
const lists = (url: string) => (url.includes('/engage/profiles') ? json({ profiles: [], nextCursor: null }) : null);

const renderPanel = (onSaved = vi.fn()) => render(
  <QueryClientProvider client={client()}><MemoryRouter><NewCustomerPanel onSaved={onSaved} /></MemoryRouter></QueryClientProvider>,
);

beforeEach(() => { useAuthStore.setState({ isAdmin: true }); });
afterEach(() => { globalThis.fetch = original; });

describe('adding one customer by hand (Customers page)', () => {
  it('an admin sees Add customer on the Customers page; a member does not', async () => {
    mockApi((url) => lists(url) ?? json({}, 404));
    const admin = render(
      <QueryClientProvider client={client()}><MemoryRouter initialEntries={['/marketing']}><EngageHub /></MemoryRouter></QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('hub-tab-customers'));
    expect(await screen.findByTestId('new-customer')).toBeInTheDocument();
    admin.unmount();

    useAuthStore.setState({ isAdmin: false });
    render(
      <QueryClientProvider client={client()}><MemoryRouter initialEntries={['/marketing']}><EngageHub /></MemoryRouter></QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('hub-tab-customers'));
    await screen.findByText(/Every customer/);
    expect(screen.queryByTestId('new-customer')).toBeNull();
  });

  it('Add customer is disabled until there is a customer ID', () => {
    mockApi(() => json({}));
    renderPanel();
    expect(screen.getByTestId('save-customer')).toBeDisabled();
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: 'kitap-1' } });
    expect(screen.getByTestId('save-customer')).toBeEnabled();
  });

  it('email consent needs an email address and a note of where the customer agreed', () => {
    mockApi(() => json({}));
    renderPanel();
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: 'kitap-1' } });
    fireEvent.click(screen.getByTestId('customer-email-consent'));
    expect(screen.getByTestId('save-customer')).toBeDisabled();
    expect(screen.getByText(/Enter the customer's email address/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('customer-email'), { target: { value: 'ayse@example.com' } });
    expect(screen.getByTestId('save-customer')).toBeDisabled(); // still no note

    fireEvent.change(screen.getByTestId('customer-consent-note'), { target: { value: 'Paper form, 12 March' } });
    expect(screen.getByTestId('save-customer')).toBeEnabled();
  });

  it('saves the customer with the note as evidence, and then opens it', async () => {
    mockApi((url, method) => {
      if (method === 'POST' && new URL(url, 'http://localhost').pathname === '/api/engage/profiles') return json({ id: 'p1', externalId: 'kitap-1' }, 201);
      return lists(url) ?? json({}, 404);
    });
    const onSaved = vi.fn();
    renderPanel(onSaved);
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: ' kitap-1 ' } });
    fireEvent.change(screen.getByTestId('customer-email'), { target: { value: 'ayse@example.com' } });
    fireEvent.click(screen.getByTestId('customer-email-consent'));
    fireEvent.change(screen.getByTestId('customer-consent-note'), { target: { value: 'Paper form, 12 March' } });
    fireEvent.click(screen.getByTestId('save-customer'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p1'));
    expect(posted()[0]!.body).toEqual({
      external_id: 'kitap-1', email: 'ayse@example.com', phone: null, email_consent: true, whatsapp_consent: false, consent_note: 'Paper form, 12 March',
    });
  });

  it('WhatsApp consent needs the phone number and the note, and is sent with them (WP-40b)', async () => {
    mockApi((url, method) => (method === 'POST' ? json({ id: 'p3', externalId: 'kitap-3' }, 201) : lists(url) ?? json({}, 404)));
    const onSaved = vi.fn();
    renderPanel(onSaved);
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: 'kitap-3' } });
    fireEvent.click(screen.getByTestId('customer-whatsapp-consent'));
    expect(screen.getByTestId('customer-needs-phone')).toBeInTheDocument();
    expect(screen.getByTestId('save-customer')).toBeDisabled();
    fireEvent.change(screen.getByTestId('customer-phone'), { target: { value: '+905001112233' } });
    expect(screen.getByTestId('save-customer')).toBeDisabled(); // still needs where they agreed
    fireEvent.change(screen.getByTestId('customer-consent-note'), { target: { value: 'Store checkout, 20 November' } });
    fireEvent.click(screen.getByTestId('save-customer'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p3'));
    expect(posted()[0]!.body).toEqual({
      external_id: 'kitap-3', email: null, phone: '+905001112233', email_consent: false, whatsapp_consent: true, consent_note: 'Store checkout, 20 November',
    });
  });

  it('without consent, no note is sent', async () => {
    mockApi((url, method) => (method === 'POST' ? json({ id: 'p2', externalId: 'kitap-2' }, 201) : lists(url) ?? json({}, 404)));
    const onSaved = vi.fn();
    renderPanel(onSaved);
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: 'kitap-2' } });
    fireEvent.click(screen.getByTestId('save-customer'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p2'));
    expect(posted()[0]!.body).toMatchObject({ email_consent: false, consent_note: null });
  });

  it('a refusal from the server is shown, and the customer is not opened', async () => {
    mockApi((url, method) => (method === 'POST' ? json({ error: 'A customer with this customer ID already exists' }, 409) : lists(url) ?? json({}, 404)));
    const onSaved = vi.fn();
    renderPanel(onSaved);
    fireEvent.change(screen.getByTestId('customer-external-id'), { target: { value: 'kitap-1' } });
    fireEvent.click(screen.getByTestId('save-customer'));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
