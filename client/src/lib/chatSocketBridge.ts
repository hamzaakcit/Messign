/**
 * Centralizes chat-related Socket.io handlers so AppShell stays thin and tests can mock one module.
 */
import { toast } from 'sonner';
import {
  getSocket,
  onMessageReact,
  onMessageEdit,
  onMessageDelete,
  onMessagePin,
  onThreadReply,
  onSocketError,
  offSocketError,
} from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';
import { CHAT_CHANNELS_ROOT } from '@/lib/chatQueryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import type { Message } from '@/types';

/**
 * Registers chat socket listeners. Returns cleanup (call on unmount).
 */
export function installChatSocketHandlers(): () => void {
  const socket = getSocket();

  const handleMessageNew = (message: {
    userId?: string;
    channelId?: string;
    senderName?: string;
    content?: string;
  }) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (currentUserId && message.userId === currentUserId) return;
    useChatStore.getState().addMessage(message as Message);
    const { activeChannelId, channels } = useChatStore.getState();
    const currentView = useUIStore.getState().currentView;
    const viewingThisChannel =
      currentView === 'chat' && activeChannelId === message.channelId;
    const tabHidden = typeof document !== 'undefined' && document.hidden;
    if (message.channelId && (!viewingThisChannel || tabHidden)) {
      useChatStore.getState().incrementChannelUnread(message.channelId);
      const channelName = channels.find((c) => c.id === message.channelId)?.name ?? 'Chat';
      const from = message.senderName ?? 'Someone';
      const preview =
        typeof message.content === 'string' && message.content.length > 0
          ? message.content.slice(0, 80) + (message.content.length > 80 ? '…' : '')
          : 'New message';
      toast(`${from} in ${channelName}`, { description: preview });
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${from} in ${channelName}`, { body: preview });
      }
    }
  };

  socket.on('message:new', handleMessageNew);

  const unsubReact = onMessageReact(({ messageId, channelId, reactions }) => {
    useChatStore.getState().updateMessageReactions(messageId, channelId, reactions);
  });
  const unsubEdit = onMessageEdit(({ messageId, channelId, content }) => {
    useChatStore.getState().editMessage(messageId, channelId, content);
  });
  const unsubDelete = onMessageDelete(({ messageId, channelId }) => {
    useChatStore.getState().deleteMessage(messageId, channelId);
  });
  const unsubPin = onMessagePin(({ messageId, channelId, isPinned }) => {
    useChatStore.getState().pinMessage(messageId, channelId, isPinned);
  });
  const unsubThreadReply = onThreadReply(({ threadId, replyCount }) => {
    useChatStore.getState().updateThreadReplyCount(threadId, replyCount);
  });

  const handleSocketError = (err: { message?: string; code?: string; channelId?: string }) => {
    if (err.code === 'CHANNEL_NOT_FOUND') {
      toast.error('Channel not found. Refreshing channel list.');
      void queryClient.invalidateQueries({ queryKey: [...CHAT_CHANNELS_ROOT] });
      const uid = useAuthStore.getState().user?.id;
      if (uid) void useChatStore.getState().fetchChannels(uid);
    } else if (err.code === 'SEND_FAILED' || err.message) {
      toast.error(err.message ?? 'Something went wrong');
    }
  };
  onSocketError(handleSocketError);

  return () => {
    socket.off('message:new', handleMessageNew);
    unsubReact();
    unsubEdit();
    unsubDelete();
    unsubPin();
    unsubThreadReply();
    offSocketError(handleSocketError);
  };
}
