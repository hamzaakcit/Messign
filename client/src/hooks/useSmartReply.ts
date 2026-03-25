import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';

export function useSmartReply() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const smartReplies = useChatStore((s) => s.smartReplies);
  const smartReplyLoading = useChatStore((s) => s.smartReplyLoading);
  const fetchSmartReplies = useChatStore((s) => s.fetchSmartReplies);
  const clearSmartReplies = useChatStore((s) => s.clearSmartReplies);

  const channelMessages = activeChannelId ? messages[activeChannelId] : undefined;
  const lastMessageId = channelMessages?.[channelMessages.length - 1]?.id;

  useEffect(() => {
    if (!activeChannelId || !lastMessageId) return;
    const timer = setTimeout(() => {
      fetchSmartReplies(activeChannelId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeChannelId, lastMessageId, fetchSmartReplies]);

  const refresh = useCallback(() => {
    if (activeChannelId) fetchSmartReplies(activeChannelId);
  }, [activeChannelId, fetchSmartReplies]);

  return {
    replies: smartReplies?.replies ?? [],
    contextSummary: smartReplies?.contextSummary ?? '',
    loading: smartReplyLoading,
    refresh,
    clear: clearSmartReplies,
  };
}
