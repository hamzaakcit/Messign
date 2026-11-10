import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketingEntry } from '@/engage/MarketingEntry';

/**
 * Which page /marketing is (ADR-015, ADR-016): the organization decides. A tenant never gets the Company-OS Lucy page,
 * the platform organization gets it with engage on it, anyone else gets it as it was.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const original = globalThis.fetch;
let urls: string[];
function mockMe(answer: () => Promise<Response> | Response) {
  urls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return answer(); }) as typeof fetch;
}
const show = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MarketingEntry lucy={<div data-testid="lucy-page" />} hub={<div data-testid="engage-page" />} />
  </QueryClientProvider>,
);

afterEach(() => { globalThis.fetch = original; vi.unstubAllEnvs(); });

describe('MarketingEntry', () => {
  it('engage surface: the engage page, without asking anything', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'engage');
    mockMe(() => json({}, 500));
    show();
    expect(screen.getByTestId('engage-page')).toBeInTheDocument();
    expect(screen.queryByTestId('lucy-page')).toBeNull();
    expect(urls).toEqual([]);
  });

  it('workspace surface: the Lucy page, without asking anything (the engage API is not mounted there)', () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'workspace');
    mockMe(() => json({}, 500));
    show();
    expect(screen.getByTestId('lucy-page')).toBeInTheDocument();
    expect(screen.queryByTestId('engage-page')).toBeNull();
    expect(urls).toEqual([]);
  });

  it('shared deployment, a tenant: the engage page, never the Lucy page', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'engage' }));
    show();
    expect(await screen.findByTestId('engage-page')).toBeInTheDocument();
    expect(screen.queryByTestId('lucy-page')).toBeNull();
  });

  it('shared deployment, the platform organization with engage enabled: the Lucy page (which holds engage too)', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'all' }));
    show();
    expect(await screen.findByTestId('lucy-page')).toBeInTheDocument();
    expect(screen.queryByTestId('engage-page')).toBeNull();
  });

  it('shared deployment, an organization the engage API refuses: the Lucy page as it was', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ error: 'Organization is not an engage tenant' }, 403));
    show();
    expect(await screen.findByTestId('lucy-page')).toBeInTheDocument();
    expect(screen.queryByTestId('engage-page')).toBeNull();
  });

  it('shared deployment: nothing is shown until the engage API has answered, so a tenant never sees the Lucy page flash by', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    let answer: (r: Response) => void = () => undefined;
    mockMe(() => new Promise<Response>((resolve) => { answer = resolve; }));
    show();
    await waitFor(() => expect(urls.length).toBe(1));
    expect(screen.queryByTestId('lucy-page')).toBeNull();
    expect(screen.queryByTestId('engage-page')).toBeNull();
    answer(json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'engage' }));
    expect(await screen.findByTestId('engage-page')).toBeInTheDocument();
    expect(screen.queryByTestId('lucy-page')).toBeNull();
  });
});
