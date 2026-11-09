import { QueryClient } from '@tanstack/react-query';

/** A 4xx answer (missing access, missing route, bad input) will not change on retry; only retry network/5xx once. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

/**
 * Shared TanStack Query client for the Vite SPA (marketing workspace, future features).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
    },
  },
});
