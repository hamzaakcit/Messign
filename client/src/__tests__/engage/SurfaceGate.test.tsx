import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SurfaceGate } from '@/engage/SurfaceGate';
import { getEffectiveSurface, setSessionSurface } from '@/lib/productSurface';

/**
 * ADR-017: on a shared build the app waits for the engage API to say whose session this is, then draws only what that
 * session may have. A tenant never sees a Company-OS page, not even for a moment.
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
    <SurfaceGate><div data-testid="app" /></SurfaceGate>
  </QueryClientProvider>,
);

afterEach(() => { globalThis.fetch = original; vi.unstubAllEnvs(); setSessionSurface(null); });

describe('SurfaceGate', () => {
  it('engage and workspace builds: the app at once, nothing asked', () => {
    for (const surface of ['engage', 'workspace']) {
      vi.stubEnv('VITE_PRODUCT_SURFACE', surface);
      mockMe(() => json({}, 500));
      const view = show();
      expect(screen.getByTestId('app')).toBeInTheDocument();
      expect(urls).toEqual([]);
      view.unmount();
    }
  });

  it('shared build: nothing of the app until the answer, then a tenant session is narrowed to engage', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    let answer: (r: Response) => void = () => undefined;
    mockMe(() => new Promise<Response>((resolve) => { answer = resolve; }));
    show();
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    answer(json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'engage' }));
    expect(await screen.findByTestId('app')).toBeInTheDocument();
    expect(getEffectiveSurface()).toBe('engage');
  });

  it('shared build, the platform organization: the whole app, surface unchanged', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'all' }));
    show();
    expect(await screen.findByTestId('app')).toBeInTheDocument();
    expect(getEffectiveSurface()).toBe('all');
  });

  it('shared build, an organization the engage API refuses: the whole app, surface unchanged', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ error: 'Organization is not an engage tenant' }, 403));
    show();
    expect(await screen.findByTestId('app')).toBeInTheDocument();
    expect(getEffectiveSurface()).toBe('all');
  });

  it('signing out undoes the narrowing, so the next user starts from the build surface', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    mockMe(() => json({ organizationId: 'o', userId: 'u', role: 'admin', product: 'engage' }));
    const view = show();
    await screen.findByTestId('app');
    expect(getEffectiveSurface()).toBe('engage');
    view.unmount();
    expect(getEffectiveSurface()).toBe('all');
  });
});
