import { vi } from 'vitest';

const mockGetAccessToken = vi.fn<() => string | null>(() => null);

vi.mock('@/lib/authToken', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...(args as [])),
  setAccessToken: vi.fn(),
}));

/** fetchJson imports from apiCore — mock that module so API_ORIGIN is controlled in tests. */
vi.mock('@/lib/apiCore', () => ({
  API_ORIGIN: 'https://api.test',
  assertNotHtmlApiResponse: vi.fn(),
}));

import { fetchJson } from '@/lib/fetchJson';

beforeEach(() => {
  vi.mocked(globalThis.fetch).mockReset();
  mockGetAccessToken.mockReturnValue(null);
});

describe('fetchJson', () => {
  it('sends Content-Type: application/json header', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('/test');

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('includes Authorization header when token is present', async () => {
    mockGetAccessToken.mockReturnValue('my-token');

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('/secure');

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer my-token',
    );
  });

  it('includes X-User-Id header when userId option is provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('/resource', { userId: 'user-99' });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)['X-User-Id']).toBe(
      'user-99',
    );
  });

  it('throws error with message from response body on non-OK response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ error: 'Validation failed' }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await expect(fetchJson('/bad')).rejects.toThrow('Validation failed');
  });

  it('correctly serializes body as JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ created: true }),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('/items', {
      method: 'POST',
      body: { name: 'Widget', quantity: 5 },
    });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.body).toBe(JSON.stringify({ name: 'Widget', quantity: 5 }));
  });

  it('prepends API_ORIGIN for relative paths', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('/api/v1/data');

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/data');
  });

  it('uses absolute URL as-is when path starts with http', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await fetchJson('https://external.api/endpoint');

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('https://external.api/endpoint');
  });

  it('falls back to statusText when error body has no error or message field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await expect(fetchJson('/oops')).rejects.toThrow('Request failed: 500');
  });
});
