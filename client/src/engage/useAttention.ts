import { useQuery } from '@tanstack/react-query';
import { getAttention } from './settingsApi';

/** What needs a tenant admin's attention: one query shared by the Settings screen and the dot on its tab. */
export const ATTENTION_KEY = ['engage', 'attention'] as const;

export function useAttention(enabled: boolean) {
  // A failed or refused request just means no dot: the screen never shows an error for a hint.
  return useQuery({ queryKey: ATTENTION_KEY, queryFn: getAttention, enabled, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
}
