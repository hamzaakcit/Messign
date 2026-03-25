import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client for the Vite SPA (marketing workspace, future features).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
