/** TanStack Query keys for chat — shared by hooks and socket bridge invalidation. */
export const CHAT_CHANNELS_ROOT = ['chat', 'channels'] as const;

export function chatChannelsQueryKey(userId: string): readonly ['chat', 'channels', string] {
  return [...CHAT_CHANNELS_ROOT, userId];
}
