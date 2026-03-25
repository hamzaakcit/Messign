import { useQuery } from '@tanstack/react-query';
import { chatAPI } from '@/lib/api';
import { chatChannelsQueryKey } from '@/lib/chatQueryKeys';
import type { Channel } from '@/types';

/**
 * Server-backed channel list with TanStack Query cache. Sync to Zustand via `hydrateChannels` in the layout.
 */
export function useChatChannelsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? chatChannelsQueryKey(userId) : (['chat', 'channels', '__none__'] as const),
    queryFn: async (): Promise<Channel[]> => {
      if (!userId) return [];
      return chatAPI.getChannels(userId) as Promise<Channel[]>;
    },
    enabled: Boolean(userId),
  });
}
