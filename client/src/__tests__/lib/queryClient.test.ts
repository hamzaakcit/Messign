import { shouldRetryQuery } from '@/lib/queryClient';
import { fetchAPI } from '@/lib/apiCore';

describe('query retry policy', () => {
  const withStatus = (status: number) => Object.assign(new Error('x'), { status });

  it('never retries a 4xx answer', () => {
    for (const s of [400, 401, 403, 404, 422]) expect(shouldRetryQuery(0, withStatus(s))).toBe(false);
  });

  it('retries network errors and 5xx once', () => {
    expect(shouldRetryQuery(0, new Error('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(0, withStatus(503))).toBe(true);
    expect(shouldRetryQuery(1, withStatus(503))).toBe(false);
  });

  it('API errors carry the HTTP status the policy needs', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Reimbursement access not set up for this user' }), { status: 403 })) as typeof fetch;
    try {
      const err = await fetchAPI('/marketing/brand-profiles').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { status?: number }).status).toBe(403);
      expect(shouldRetryQuery(0, err)).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
