import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UnsubscribePage } from '@/engage/UnsubscribePage';
import { pickLang, TEXT } from '@/engage/unsubscribeText';

const TOKEN = 'abc.def';
const INFO = { channel: 'email', addressHint: 'a******@example.com', senderName: 'Demo Kitap', unsubscribed: false };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const show = () => render(
  <MemoryRouter initialEntries={[`/u/${TOKEN}`]}>
    <Routes><Route path="/u/:token" element={<UnsubscribePage />} /></Routes>
  </MemoryRouter>,
);

function setLanguages(langs: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: langs[0], configurable: true });
}

describe('UnsubscribePage', () => {
  const original = globalThis.fetch;
  let calls: Array<{ url: string; method: string }>;
  const mockFetch = (handler: (url: string, method: string) => Response | Promise<Response>) => {
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      calls.push({ url, method });
      return handler(url, method);
    }) as typeof fetch;
  };
  beforeEach(() => setLanguages(['en-US']));
  afterEach(() => { globalThis.fetch = original; document.head.querySelectorAll('meta[name=robots],meta[name=referrer]').forEach((m) => m.remove()); });

  it('opening the page shows who and what, and does NOT unsubscribe (previewers and scanners open links)', async () => {
    mockFetch(() => json(INFO));
    show();
    expect(await screen.findByText('Do you want to stop receiving emails from Demo Kitap?')).toBeInTheDocument();
    expect(screen.getByText('Address: a******@example.com')).toBeInTheDocument();
    expect(calls).toEqual([{ url: `/api/engage/unsubscribe/${TOKEN}`, method: 'GET' }]);
  });

  it('the button posts once, then confirms', async () => {
    mockFetch((_u, method) => (method === 'POST' ? json({ unsubscribed: true, alreadyUnsubscribed: false }) : json(INFO)));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText('You are unsubscribed. No more emails will be sent to this address.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([{ url: `/api/engage/unsubscribe/${TOKEN}`, method: 'POST' }]);
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
  });

  it('shows "already unsubscribed" when the link was used before, without offering the button', async () => {
    mockFetch(() => json({ ...INFO, unsubscribed: true }));
    show();
    expect(await screen.findByText('This address is already unsubscribed.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('an unknown or forged link looks the same as any other invalid link, and offers nothing', async () => {
    mockFetch(() => json({ error: 'Not found' }, 404));
    show();
    expect(await screen.findByText('This link is invalid or no longer available.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a 404 on confirm (the link stopped being valid in between) is the invalid message, not a success', async () => {
    mockFetch((_u, method) => (method === 'POST' ? json({ error: 'Not found' }, 404) : json(INFO)));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText('This link is invalid or no longer available.')).toBeInTheDocument();
    expect(screen.queryByText(/You are unsubscribed/)).not.toBeInTheDocument();
  });

  it('a failed load can be retried', async () => {
    let n = 0;
    mockFetch(() => (n++ === 0 ? json({ error: 'x' }, 500) : json(INFO)));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
  });

  it('a failed confirm (network or 5xx) never claims success and can be retried', async () => {
    let post = 0;
    mockFetch((_u, method) => {
      if (method !== 'POST') return json(INFO);
      return post++ === 0 ? Promise.reject(new TypeError('Failed to fetch')) : json({ unsubscribed: true, alreadyUnsubscribed: false });
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText('Something went wrong. Please try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText(/You are unsubscribed/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/You are unsubscribed/)).toBeInTheDocument();
  });

  it('is Turkish for a Turkish browser', async () => {
    setLanguages(['tr-TR', 'en']);
    mockFetch(() => json(INFO));
    show();
    expect(await screen.findByText('Demo Kitap e-postalarını almak istemiyor musunuz?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abonelikten çık' })).toBeInTheDocument();
  });

  it('asks search engines and referrers to stay away from a page whose URL is a credential', async () => {
    mockFetch(() => json(INFO));
    const { unmount } = show();
    await screen.findByRole('button', { name: 'Unsubscribe' });
    expect(document.head.querySelector('meta[name=robots]')?.getAttribute('content')).toContain('noindex');
    expect(document.head.querySelector('meta[name=referrer]')?.getAttribute('content')).toBe('no-referrer');
    unmount();
    expect(document.head.querySelector('meta[name=robots]')).toBeNull();
  });

  it('does not show the sender line when the tenant has no sender name', async () => {
    mockFetch(() => json({ ...INFO, senderName: null }));
    show();
    expect(await screen.findByText('Do you want to stop receiving these emails?')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/from null/)).not.toBeInTheDocument());
  });
});

describe('language choice and texts', () => {
  it('Turkish only when a browser language starts with tr', () => {
    expect(pickLang(['tr'])).toBe('tr');
    expect(pickLang(['en-US', 'TR-tr'])).toBe('tr');
    expect(pickLang(['en-US', 'de'])).toBe('en');
    expect(pickLang([])).toBe('en');
    expect(pickLang(undefined)).toBe('en');
  });
  it('both languages say the same things', () => {
    expect(Object.keys(TEXT.tr).sort()).toEqual(Object.keys(TEXT.en).sort());
  });
});
