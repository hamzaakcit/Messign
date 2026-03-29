import { useQuery } from '@tanstack/react-query';
import { chatAPI } from '@/lib/api';
import { chatChannelsQueryKey } from '@/lib/chatQueryKeys';
import { normalizeChannelList } from '@/lib/chatChannelUtils';
import type { Channel } from '@/types';

/**
 * Server-backed channel list with TanStack Query cache. Sync to Zustand via `hydrateChannels` in the layout.
 */
export function useChatChannelsQuery(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? chatChannelsQueryKey(userId) : (['chat', 'channels', '__none__'] as const),
    queryFn: async (): Promise<Channel[]> => {
      if (!userId) return [];
      const raw = await chatAPI.getChannels(userId);
      return normalizeChannelList(raw);
    },
    enabled: Boolean(userId),
  });
}
