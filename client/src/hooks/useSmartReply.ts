import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';

export function useSmartReply() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const threadMessages = useChatStore((s) => s.threadMessages);
  const smartReplies = useChatStore((s) => s.smartReplies);
  const smartReplyLoading = useChatStore((s) => s.smartReplyLoading);
  const fetchSmartReplies = useChatStore((s) => s.fetchSmartReplies);
  const clearSmartReplies = useChatStore((s) => s.clearSmartReplies);

  const channelMessages = activeChannelId ? messages[activeChannelId] : undefined;
  const lastMessageId = activeThreadId
    ? (threadMessages[threadMessages.length - 1]?.id ?? activeThreadId)
    : channelMessages?.[channelMessages.length - 1]?.id;

  useEffect(() => {
    if (!activeChannelId || !lastMessageId) return;
    const timer = setTimeout(() => {
      fetchSmartReplies(activeChannelId, activeThreadId ? { threadId: activeThreadId } : undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeChannelId, activeThreadId, lastMessageId, fetchSmartReplies]);

  const refresh = useCallback(() => {
    if (activeChannelId) {
      fetchSmartReplies(activeChannelId, activeThreadId ? { threadId: activeThreadId } : undefined);
    }
  }, [activeChannelId, activeThreadId, fetchSmartReplies]);

  return {
    replies: smartReplies?.replies ?? [],
    contextSummary: smartReplies?.contextSummary ?? '',
    loading: smartReplyLoading,
    refresh,
    clear: clearSmartReplies,
  };
}
